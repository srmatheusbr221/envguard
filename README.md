# envguard

A tiny CLI that answers one question: **does `.env.example` still match what the code reads?**

Everybody has cloned a repo, copied `.env.example` to `.env`, run the app, and watched it crash on a variable nobody documented. envguard looks at three things and tells you where they disagree:

1. `.env.example`: the template other people copy
2. your real `.env` (optional, skipped when it isn't there, e.g. in CI)
3. the source code: every `process.env.X` / `import.meta.env.X` it can find

```
$ npx github:srmatheusbr221/envguard
Missing from .env (1)  listed in .env.example
  SMTP_PASSWORD

Used in code but not in .env.example (2)  add them to the template
  STRIPE_WEBHOOK_SECRET  src/billing/webhook.ts:14
  FEATURE_NEW_CHECKOUT   src/flags.ts:3

Documented but never read (1)  stale?
  OLD_ANALYTICS_ID
```

Exit code is `1` when something would actually break a fresh setup, so it works as a CI step.

## Install / run

It isn't on npm yet. Run it straight from GitHub, or install it as a dev dependency:

```sh
npx github:srmatheusbr221/envguard
npm install --save-dev github:srmatheusbr221/envguard
```

Node 20+. No dependencies.

## What counts as a problem

| Finding | Meaning | Fails the run? |
| --- | --- | --- |
| **Missing** | in `.env.example`, absent from `.env` | yes |
| **Used but not documented** | read by the code, absent from `.env.example` | yes |
| Extra | in `.env`, absent from `.env.example` | only with `--strict` |
| Unused | in `.env.example`, never read by the code | only with `--strict` |
| Empty | in both, but `.env` has no value | only with `--strict` |

`NODE_ENV`, `CI`, and Vite's built-ins (`MODE`, `DEV`, `PROD`, `SSR`, `BASE_URL`) are ignored by default.

## Options

```
--example <file>   template file            (default: .env.example)
--env <file>       real env file to compare (default: .env, skipped if absent)
--src <dir>        source directory to scan (default: .)
--ignore <A,B>     variables to ignore, comma separated
--strict           also fail on extra, unused and empty variables
--json             machine readable output
```

Use it in CI (no `.env` there, so only the template vs. code check runs):

```yaml
- run: npx github:srmatheusbr221/envguard --ignore AWS_REGION
```

## What it can read

- `process.env.NAME`, `process.env["NAME"]`
- `import.meta.env.NAME`
- destructuring: `const { A, B = 'x', C: alias } = process.env`
- file types: `.js .mjs .cjs .jsx .ts .mts .cts .tsx .vue .svelte .astro`
- skipped folders: `node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `.cache`

## What it can't do (yet)

It's a regex scanner, not a parser, so these are invisible to it:

- dynamic access like `process.env[name]`
- other languages (Python's `os.environ`, Go's `os.Getenv`...)
- `.env.local` / `.env.production` layering

Those are tracked in the issues if you'd like to help.

## Development

```sh
git clone https://github.com/srmatheusbr221/envguard
cd envguard
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## About AI assistance

I used an AI coding assistant (Claude Code) while writing this, then read, ran and edited the result. The test suite is there so you don't have to take my word for any of it.

## License

MIT
