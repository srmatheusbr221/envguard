// Minimal .env parser. We only care about the keys (and whether a value is
// empty), so this doesn't expand variables or handle multi-line values.

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/;

/**
 * @param {string} text
 * @returns {Map<string, { value: string, line: number }>}
 */
export function parseEnv(text) {
  const out = new Map();
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);

  lines.forEach((raw, i) => {
    if (/^\s*(#|$)/.test(raw)) return;
    const m = LINE.exec(raw);
    if (!m) return;
    out.set(m[1], { value: cleanValue(m[2]), line: i + 1 });
  });

  return out;
}

function cleanValue(v) {
  v = v.trim();
  const q = v[0];
  if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) {
    return v.slice(1, v.lastIndexOf(q));
  }
  // unquoted: a " #" starts an inline comment
  const hash = v.search(/\s#/);
  return (hash === -1 ? v : v.slice(0, hash)).trim();
}
