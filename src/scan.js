import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx',
  '.vue', '.svelte', '.astro',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache',
]);

const MAX_FILE_SIZE = 1024 * 1024; // skip bundles and generated blobs

// process.env.FOO, process.env["FOO"], import.meta.env.FOO, import.meta.env['FOO']
const DIRECT = /\b(?:process|import\.meta)\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\])/g;

// const { FOO, BAR: renamed = 'x' } = process.env
const DESTRUCTURE = /\{([^{}]*)\}\s*=\s*(?:process|import\.meta)\.env\b/g;

/**
 * Finds every environment variable the code reads.
 * @param {string} root directory to walk
 * @returns {Map<string, { file: string, line: number }[]>}
 */
export function scanSource(root) {
  const found = new Map();
  walk(root, root, found);
  return found;
}

export function scanText(text, file = '<memory>') {
  const found = new Map();
  collect(text, file, found);
  return found;
}

function walk(dir, root, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, root, found);
      continue;
    }
    if (!e.isFile()) continue;
    const dot = e.name.lastIndexOf('.');
    if (dot === -1 || !EXTENSIONS.has(e.name.slice(dot))) continue;
    if (statSync(full).size > MAX_FILE_SIZE) continue;
    const rel = relative(root, full).split(sep).join('/');
    collect(readFileSync(full, 'utf8'), rel, found);
  }
}

function collect(text, file, found) {
  const add = (name, index) => {
    const line = text.slice(0, index).split('\n').length;
    if (!found.has(name)) found.set(name, []);
    found.get(name).push({ file, line });
  };

  for (const m of text.matchAll(DIRECT)) add(m[1] ?? m[2], m.index);

  for (const m of text.matchAll(DESTRUCTURE)) {
    for (const part of m[1].split(',')) {
      // "FOO", "FOO = 'x'", "FOO: alias" -> FOO ; "...rest" is ignored
      const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|=|$)/.exec(part)?.[1];
      if (name) add(name, m.index);
    }
  }
}
