# Contributing to envguard

Glad you're here. The codebase is about 300 lines, so it's easy to get into.

## Setup

```sh
git clone https://github.com/srmatheusbr221/envguard
cd envguard
npm test
```

Node 20+, no dependencies to install.

## Where things live

- `src/parse.js`: reads `.env` style files
- `src/scan.js`: finds env var usage in source files
- `src/check.js`: compares the three sources and decides what fails
- `src/cli.js`: argument parsing and output. `run()` returns `{ code, out, err }` instead of printing, which keeps it testable
- `bin/envguard.js`: the thin executable

## Making a change

1. Open an issue first for anything bigger than a bug fix.
2. Write a failing test in `test/envguard.test.js`. Tests build throwaway projects in a temp folder, see the `project()` helper.
3. Make it pass. Keep it dependency-free, that's a design goal.
4. Update the README table/options if behaviour changed, and add a line to `CHANGELOG.md`.
5. Open a PR using the template.

## Scanner rules of thumb

The scanner is deliberately regex based. If you add a pattern, add a test for what it should match **and** one for a lookalike that it must not match (see `scanText: ignores things that merely look similar`). False positives annoy people more than missing a rare syntax.

## AI tools

Use whatever helps you. Read and run what it produced before you open the PR, and say which tool it was in the PR description.
