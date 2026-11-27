import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from '../src/parse.js';
import { scanText, scanSource } from '../src/scan.js';
import { compare, failures } from '../src/check.js';
import { run, parseArgs } from '../src/cli.js';

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'envguard-'));
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test('parseEnv: comments, export, quotes, inline comments, empty values', () => {
  const env = parseEnv([
    '# a comment',
    '',
    'PLAIN=abc',
    'export EXPORTED=1',
    'QUOTED="hello world"',
    "SINGLE='x y'",
    'INLINE=value # trailing',
    'EMPTY=',
    'HASH_IN_VALUE=abc#def',
    'not a valid line',
  ].join('\n'));
  assert.deepEqual([...env.keys()], ['PLAIN', 'EXPORTED', 'QUOTED', 'SINGLE', 'INLINE', 'EMPTY', 'HASH_IN_VALUE']);
  assert.equal(env.get('QUOTED').value, 'hello world');
  assert.equal(env.get('SINGLE').value, 'x y');
  assert.equal(env.get('INLINE').value, 'value');
  assert.equal(env.get('EMPTY').value, '');
  assert.equal(env.get('HASH_IN_VALUE').value, 'abc#def');
  assert.equal(env.get('PLAIN').line, 3);
});

test('parseEnv: handles CRLF and a BOM', () => {
  const env = parseEnv('﻿A=1\r\nB=2\r\n');
  assert.deepEqual([...env.keys()], ['A', 'B']);
  assert.equal(env.get('B').value, '2');
});

test('scanText: finds the usual ways of reading env vars', () => {
  const src = [
    'const a = process.env.API_URL;',
    "const b = process.env['SECRET_KEY'];",
    'const c = import.meta.env.VITE_TITLE;',
    "const { DB_HOST, DB_PORT = '5432', RENAMED: local, ...rest } = process.env;",
  ].join('\n');
  const found = scanText(src, 'a.js');
  assert.deepEqual([...found.keys()].sort(), ['API_URL', 'DB_HOST', 'DB_PORT', 'RENAMED', 'SECRET_KEY', 'VITE_TITLE']);
  assert.deepEqual(found.get('API_URL'), [{ file: 'a.js', line: 1 }]);
  assert.equal(found.get('VITE_TITLE')[0].line, 3);
});

test('scanText: ignores things that merely look similar', () => {
  const found = scanText('const x = process.envelope.FOO; const y = myprocess.env.BAR;');
  assert.equal(found.size, 0);
});

test('scanSource: walks directories, skips node_modules and unknown extensions', () => {
  const dir = project({
    'src/app.ts': 'export const url = process.env.APP_URL;',
    'src/deep/more.js': 'process.env.DEEP_ONE',
    'node_modules/pkg/index.js': 'process.env.SHOULD_NOT_APPEAR',
    'README.md': 'process.env.IN_DOCS',
  });
  try {
    const found = scanSource(dir);
    assert.deepEqual([...found.keys()].sort(), ['APP_URL', 'DEEP_ONE']);
    assert.equal(found.get('DEEP_ONE')[0].file, 'src/deep/more.js');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compare: reports each category and respects ignore', () => {
  const example = parseEnv('A=\nB=\nC=\nNODE_ENV=');
  const env = parseEnv('A=1\nC=\nZ=9');
  const usage = new Map([['A', []], ['B', []], ['D', []], ['NODE_ENV', []], ['SKIPME', []]]);
  const r = compare({ example, env, usage, ignore: ['SKIPME'] });
  assert.deepEqual(r.missing, ['B']);
  assert.deepEqual(r.extra, ['Z']);
  assert.deepEqual(r.undocumented, ['D']);
  assert.deepEqual(r.unused, ['C']);
  assert.deepEqual(r.empty, ['C']);
});

test('compare: without a .env nothing is "missing" or "extra"', () => {
  const r = compare({ example: parseEnv('A='), env: null, usage: new Map() });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
  assert.deepEqual(r.unused, ['A']);
});

test('failures: strict adds the soft findings', () => {
  const r = { missing: [], undocumented: [], extra: ['X'], unused: [], empty: [] };
  assert.equal(failures(r).length, 0);
  assert.equal(failures(r, { strict: true }).length, 1);
});

test('parseArgs: flags and errors', () => {
  const o = parseArgs(['--example', 'e', '--ignore', 'A, B', '--ignore', 'C', '--strict', '--json']);
  assert.equal(o.example, 'e');
  assert.deepEqual(o.ignore, ['A', 'B', 'C']);
  assert.equal(o.strict && o.json, true);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['--env']), /needs a value/);
});

test('run: clean project exits 0', () => {
  const dir = project({
    '.env.example': 'API_URL=\nTOKEN=\n',
    '.env': 'API_URL=http://x\nTOKEN=abc\n',
    'index.js': 'fetch(process.env.API_URL, { headers: { a: process.env.TOKEN } })',
  });
  try {
    const r = run([], { cwd: dir });
    assert.equal(r.code, 0);
    assert.match(r.out, /^ok:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run: undocumented variable is reported with file and line, exit 1', () => {
  const dir = project({
    '.env.example': 'A=\n',
    'index.js': '\n\nconst a = process.env.A;\nconst b = process.env.BRAND_NEW;\n',
  });
  try {
    const r = run([], { cwd: dir });
    assert.equal(r.code, 1);
    assert.match(r.out, /Used in code but not in \.env\.example \(1\)/);
    assert.match(r.out, /BRAND_NEW\s+index\.js:4/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run: missing key in .env is an error, extra key only with --strict', () => {
  const dir = project({
    '.env.example': 'A=\nB=\n',
    '.env': 'A=1\nEXTRA=2\n',
    'x.js': 'process.env.A; process.env.B;',
  });
  try {
    assert.equal(run([], { cwd: dir }).code, 1);
    const onlyExtra = run(['--ignore', 'B'], { cwd: dir });
    assert.equal(onlyExtra.code, 0);
    assert.equal(run(['--ignore', 'B', '--strict'], { cwd: dir }).code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run: --json output parses and has ok flag', () => {
  const dir = project({ '.env.example': 'A=\n', 'x.js': 'process.env.A' });
  try {
    const r = run(['--json'], { cwd: dir });
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.missing, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run: usage problems exit 2', () => {
  const dir = project({ 'x.js': '' });
  try {
    assert.equal(run([], { cwd: dir }).code, 2); // no .env.example
    assert.equal(run(['--bogus'], { cwd: dir }).code, 2);
    const noEnv = project({ '.env.example': 'A=\n' });
    try {
      assert.equal(run(['--env', 'nope.env'], { cwd: noEnv }).code, 2);
    } finally {
      rmSync(noEnv, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run: help and version', () => {
  assert.match(run(['--help']).out, /Usage: envguard/);
  assert.equal(run(['-v'], { version: '1.2.3' }).out, '1.2.3\n');
});
