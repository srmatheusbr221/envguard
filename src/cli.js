import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from './parse.js';
import { scanSource } from './scan.js';
import { compare, failures } from './check.js';

const HELP = `envguard - keep .env.example honest

Usage: envguard [options]

Options:
  --example <file>   template file            (default: .env.example)
  --env <file>       real env file to compare (default: .env, skipped if absent)
  --src <dir>        source directory to scan (default: .)
  --ignore <A,B>     variables to ignore, comma separated
  --strict           also fail on extra, unused and empty variables
  --json             machine readable output
  -h, --help         show this help
  -v, --version      show the version

Exit codes: 0 = fine, 1 = problems found, 2 = bad usage or unreadable file
`;

export function parseArgs(argv) {
  const opts = {
    example: '.env.example', env: '.env', envGiven: false,
    src: '.', ignore: [], strict: false, json: false,
  };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new UsageError(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--example': opts.example = need(i++, a); break;
      case '--env': opts.env = need(i++, a); opts.envGiven = true; break;
      case '--src': opts.src = need(i++, a); break;
      case '--ignore': opts.ignore.push(...need(i++, a).split(',').map((s) => s.trim()).filter(Boolean)); break;
      case '--strict': opts.strict = true; break;
      case '--json': opts.json = true; break;
      case '-h': case '--help': opts.help = true; break;
      case '-v': case '--version': opts.version = true; break;
      default: throw new UsageError(`unknown option: ${a}`);
    }
  }
  return opts;
}

export class UsageError extends Error {}

/**
 * Runs the whole thing and returns { code, out, err } so it's easy to test.
 */
export function run(argv, { cwd = process.cwd(), version = '0.0.0', color = false } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) return { code: 2, out: '', err: `envguard: ${e.message}\n\n${HELP}` };
    throw e;
  }
  if (opts.help) return { code: 0, out: HELP, err: '' };
  if (opts.version) return { code: 0, out: version + '\n', err: '' };

  const examplePath = resolve(cwd, opts.example);
  if (!existsSync(examplePath)) {
    return { code: 2, out: '', err: `envguard: can't find ${opts.example}\n` };
  }
  const example = parseEnv(readFileSync(examplePath, 'utf8'));

  let env = null;
  const envPath = resolve(cwd, opts.env);
  if (existsSync(envPath)) env = parseEnv(readFileSync(envPath, 'utf8'));
  else if (opts.envGiven) return { code: 2, out: '', err: `envguard: can't find ${opts.env}\n` };

  const usage = scanSource(resolve(cwd, opts.src));
  const result = compare({ example, env, usage, ignore: opts.ignore });
  const bad = failures(result, { strict: opts.strict });
  const code = bad.length ? 1 : 0;

  if (opts.json) {
    return { code, out: JSON.stringify({ ok: code === 0, ...result }, null, 2) + '\n', err: '' };
  }
  return { code, out: render(result, usage, { example: opts.example, env: env ? opts.env : null, color, strict: opts.strict }), err: '' };
}

function render(result, usage, { example, env, color, strict }) {
  const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const red = (s) => paint(31, s);
  const yellow = (s) => paint(33, s);
  const green = (s) => paint(32, s);
  const dim = (s) => paint(2, s);

  const lines = [];
  const section = (title, keys, paintFn, hint, where) => {
    if (!keys.length) return;
    lines.push(paintFn(`${title} (${keys.length})`) + (hint ? dim(`  ${hint}`) : ''));
    for (const k of keys) {
      const loc = where?.(k);
      lines.push(`  ${k}${loc ? dim('  ' + loc) : ''}`);
    }
    lines.push('');
  };
  const firstUse = (k) => {
    const u = usage.get(k)?.[0];
    return u ? `${u.file}:${u.line}` : '';
  };

  section('Missing from ' + (env ?? '.env'), result.missing, red, `listed in ${example}`);
  section('Used in code but not in ' + example, result.undocumented, red, 'add them to the template', firstUse);
  const soft = strict ? red : yellow;
  section('In ' + (env ?? '.env') + ' but not documented', result.extra, soft, `not in ${example}`);
  section('Documented but never read', result.unused, soft, 'stale?');
  section('Empty in ' + (env ?? '.env'), result.empty, soft, 'has a key but no value');

  if (!lines.length) return green(`ok: ${example} matches the code${env ? ' and ' + env : ''}`) + '\n';
  return lines.join('\n').replace(/\n+$/, '\n');
}
