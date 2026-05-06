# Agent instructions for agent-benchmark

## Project overview

`agent-benchmark` is a Node.js CLI tool (ESM, no build step) that runs a coding task across multiple git worktrees – each with different AI assistant config files – and produces a comparison report. It is published to npm as `agent-benchmark`.

The entry point is `bin/cli.js`. All logic lives in `lib/`. Tests are flat in `test/` (no subdirectories).

## Architecture

```
bin/cli.js              – subcommand router
lib/
  args.js               – flag parsing (parseInitArgs, parseRunArgs, parseReviewArgs, parseCopilotReviewArgs)
  config.js             – YAML load + validate (loadConfig)
  copilot-reviewer.js   – GitHub Copilot review orchestration (runCopilotReview)
  init.js               – agent-benchmark init (initBenchmark)
  metrics.js            – stream-json parsing (parseMetrics, createCollector)
  pricing.js            – cost normalization accounting for cache pricing (normalizedCost)
  report.js             – table render + file write (generateReport, writeResultFiles, listResults, showResult, resolveTimestamp, loadResultSet)
  review-prompt.js      – review prompt construction (buildReviewPrompt)
  review-report.js      – review report render + file write (printReviewReport, writeReviewFiles)
  reviewer.js           – Claude-based review orchestration (runReview)
  runner.js             – Claude process orchestration (runBenchmark)
  worktree.js           – git worktree lifecycle (worktreePath, branchName, createWorktree, applyConfigOverlay, commitChanges, discardChanges, removeWorktree, pushBranch, getBaseCommit, getDiffStats)
  commands/
    copilot-review.js         – copilot-review subcommand
    copilot-review-cleanup.js – copilot-review-cleanup subcommand
    init.js                   – init subcommand
    results.js                – results subcommand
    review.js                 – review subcommand
    review-cleanup.js         – review-cleanup subcommand
    run.js                    – run subcommand
    run-cleanup.js            – run-cleanup subcommand
```

## Key constraints

- **ESM only.** All files use `import`/`export`. No `require()`. No `.mjs` extensions needed because `"type": "module"` is set in `package.json`.
- **No build step.** Source runs directly. Do not add transpilation.
- **Minimal dependencies.** Only `js-yaml` is a runtime dependency. Everything else uses Node.js built-ins (`fs/promises`, `child_process`, `path`, `readline`, `node:test`).
- **Node 18+ only.** Use the built-in test runner (`node:test`), `fs/promises`, `Array.findLast`, and other Node 18 APIs freely.

## Testing

```bash
npm test # all tests
```

- Unit tests must not spawn subprocesses or touch the real filesystem. Use `os.tmpdir()` for any temp files.
- Integration tests may use real git repos created in `os.tmpdir()`. They must clean up after themselves in `after()` hooks.
- Tests must not require a Claude API key. The runner (`lib/runner.js`) is not exercised in the test suite.
- Always run the relevant test suite after making changes and fix failures before finishing.
- Use `npm run test:coverage` to generate an LCOV coverage report at `coverage/lcov.info`.

## Code style

Run `npm run format` before committing. Prettier config: 2-space indent, single quotes, no semicolons, 100-char line width, trailing commas.

ESLint enforces: `no-unused-vars`, `no-undef`, `eqeqeq`, `no-var`, `prefer-const`.

Write no comments unless the reason is non-obvious. No JSDoc. No multi-line comment blocks.

## Commit style

Each commit must be atomic – one logical change, tests passing.

Format: `<type>: <what changed>` (feat / fix / test / refactor / docs / chore). No period. Under 72 chars.

## Before finishing a task

- Run `npm run build` to verify the project builds cleanly.
- Update `README.md` and `AGENTS.md` to reflect any changes to the public interface, architecture, or workflow.

## What to avoid

- Do not add dependencies beyond `js-yaml` without a strong reason. Check if a Node.js built-in covers the need first.
- Do not add a build step or transpilation.
- Do not use `console.log` in library modules except as deliberate user-facing progress output. Errors should `throw`.
- Do not swallow errors silently. Catch only when there is a meaningful recovery or fallback (e.g. a missing optional file).
- Do not read files larger than 100KB unless the task explicitly requires it.
