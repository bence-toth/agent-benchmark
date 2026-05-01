# Agent instructions for agent-bench

## Project overview

`agent-bench` is a Node.js CLI tool (ESM, no build step) that runs a coding task across multiple git worktrees -- each with different AI assistant config files -- and produces a comparison report. It is published to npm as `agent-bench`.

The entry point is `bin/cli.js`. All logic lives in `lib/`. Tests live in `test/unit/` and `test/integration/`.

## Architecture

```
bin/cli.js              -- subcommand router
lib/
  args.js               -- flag parsing (parseInitArgs, parseRunArgs)
  config.js             -- YAML load + validate (loadConfig)
  init.js               -- agent-bench init (initBenchmark)
  metrics.js            -- stream-json parsing (parseMetrics, createCollector)
  report.js             -- table render + file write (generateReport, writeResultFiles)
  runner.js             -- Claude process orchestration (runBenchmark)
  worktree.js           -- git worktree lifecycle (createWorktree, applyConfigOverlay, removeWorktree, getDiffStats)
  commands/             -- thin dispatchers that glue args -> lib modules
```

## Key constraints

- **ESM only.** All files use `import`/`export`. No `require()`. No `.mjs` extensions needed because `"type": "module"` is set in `package.json`.
- **No build step.** Source runs directly. Do not add transpilation.
- **Minimal dependencies.** Only `js-yaml` is a runtime dependency. Everything else uses Node.js built-ins (`fs/promises`, `child_process`, `path`, `readline`, `node:test`).
- **Node 18+ only.** Use the built-in test runner (`node:test`), `fs/promises`, `Array.findLast`, and other Node 18 APIs freely.

## Testing

```bash
npm test                  # all tests
npm run test:unit         # test/unit/**/*.test.js
npm run test:integration  # test/integration/**/*.test.js
```

- Unit tests must not spawn subprocesses or touch the real filesystem. Use `os.tmpdir()` for any temp files.
- Integration tests may use real git repos created in `os.tmpdir()`. They must clean up after themselves in `after()` hooks.
- Tests must not require a Claude API key. The runner (`lib/runner.js`) is not exercised in the test suite.
- Always run the relevant test suite after making changes and fix failures before finishing.

## Code style

Run `npm run format` before committing. Prettier config: 2-space indent, single quotes, no semicolons, 100-char line width, trailing commas.

ESLint enforces: `no-unused-vars`, `no-undef`, `eqeqeq`, `no-var`, `prefer-const`.

Write no comments unless the reason is non-obvious. No JSDoc. No multi-line comment blocks.

## Commit style

Each commit must be atomic -- one logical change, tests passing.

Format: `<type>: <what changed>` (feat / fix / test / refactor / docs / chore). No period. Under 72 chars. Always append:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Common tasks

### Add a new CLI flag to `run`

1. Parse it in `lib/args.js` inside `parseRunArgs`.
2. Thread it through `lib/commands/run.js` to `lib/runner.js`.
3. Add a test in `test/unit/args.test.js`.

### Add a new metric to the report

1. Extract it in `lib/metrics.js` inside `parseMetrics`.
2. Add it to `COLUMNS` and `buildRow` in `lib/report.js`.
3. Add/update tests in `test/unit/metrics.test.js` and `test/unit/report.test.js`.

### Add a recognized config file to `init`

Append the repo-relative path to `AI_CONFIG_FILES` or `DOC_FILES` in `lib/init.js`.

## What to avoid

- Do not add dependencies beyond `js-yaml` without a strong reason. Check if a Node.js built-in covers the need first.
- Do not add a build step or transpilation.
- Do not use `console.log` in library modules except as deliberate user-facing progress output. Errors should `throw`.
- Do not swallow errors silently. Catch only when there is a meaningful recovery or fallback (e.g. a missing optional file).
- Do not read files larger than 100KB unless the task explicitly requires it.
