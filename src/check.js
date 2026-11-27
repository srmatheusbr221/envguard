// Variables that exist without anybody defining them in a .env file.
export const BUILTIN_IGNORE = ['NODE_ENV', 'CI', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'];

/**
 * @param {object} input
 * @param {Map<string, object>} input.example  keys from .env.example
 * @param {Map<string, object> | null} input.env  keys from .env, or null if there's none to compare
 * @param {Map<string, object[]>} input.usage  keys read by the source code, with locations
 * @param {string[]} [input.ignore]
 */
export function compare({ example, env, usage, ignore = [] }) {
  const skip = new Set([...BUILTIN_IGNORE, ...ignore]);
  const keep = (k) => !skip.has(k);

  const exampleKeys = [...example.keys()].filter(keep);
  const usedKeys = [...usage.keys()].filter(keep);

  // in the example but missing from the real .env -> the app will start without it
  const missing = env ? exampleKeys.filter((k) => !env.has(k)) : [];
  // in the real .env but nobody documented it
  const extra = env ? [...env.keys()].filter((k) => keep(k) && !example.has(k)) : [];
  // the code reads it, .env.example doesn't mention it -> next person to clone gets a surprise
  const undocumented = usedKeys.filter((k) => !example.has(k));
  // documented but nothing reads it -> probably stale
  const unused = exampleKeys.filter((k) => !usage.has(k));
  // present in .env.example without a value is fine; empty in .env is suspicious
  const empty = env ? exampleKeys.filter((k) => env.has(k) && env.get(k).value === '') : [];

  return {
    missing: missing.sort(),
    extra: extra.sort(),
    undocumented: undocumented.sort(),
    unused: unused.sort(),
    empty: empty.sort(),
  };
}

/** Which findings should fail the run. */
export function failures(result, { strict = false } = {}) {
  const bad = [...result.missing, ...result.undocumented];
  if (strict) bad.push(...result.extra, ...result.unused, ...result.empty);
  return bad;
}
