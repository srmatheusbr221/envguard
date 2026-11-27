# Changelog

## 0.1.0

First public version.

- Compares `.env.example`, `.env` and the variables read by source code
- Detects `process.env.X`, `process.env["X"]`, `import.meta.env.X` and destructuring
- `--strict`, `--ignore`, `--json`, `--example`, `--env`, `--src`
- Exit codes: 0 fine, 1 problems, 2 bad usage
