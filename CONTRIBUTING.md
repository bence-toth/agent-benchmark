# Contributing to agent-bench

## Development setup

```bash
git clone https://github.com/your-org/agent-bench
cd agent-bench
npm install
```

No build step. The package runs directly from source as ESM.

## Running locally without publishing

To test changes locally without publishing to NPM:

### Via npm link (preferred for rapid iteration)

```bash
# In the agent-bench directory
npm link

# The agent-bench command is now available globally from your local source:
agent-bench --help

# When done, unlink:
npm unlink -g agent-bench
```

### Via npm pack (simulate the published package)

```bash
# In the agent-bench directory
npm pack

# This creates agent-bench-0.1.0.tgz. Install it elsewhere:
npm install /path/to/agent-bench-0.1.0.tgz
```

### Direct invocation (for CLI testing)

```bash
# Run the CLI directly from source without installing:
node bin/cli.js --help
node bin/cli.js init /path/to/my-repo
```

## Running tests

```bash
npm test                  # all tests
```

Tests use the Node.js built-in test runner (`node:test`). No external test framework.

Integration tests create real temporary git repositories and benchmark directories, then clean them up. They do not require a Claude API key -- the Claude runner is not exercised in tests.

## Lint and format

```bash
npm run lint          # ESLint
npm run format        # Prettier (writes in place)
npm run format:check  # Prettier (check only, used in CI)
```

Prettier is the source of truth for style. ESLint only enforces correctness rules (no-unused-vars, eqeqeq, prefer-const, etc.) -- no style rules that overlap with Prettier.

## Project layout

```
bin/cli.js              -- entry point, subcommand routing
lib/
  args.js               -- CLI flag parsing for init and run
  config.js             -- YAML loading and validation
  init.js               -- agent-bench init implementation
  metrics.js            -- stream-json event parsing
  report.js             -- terminal table + result file writing
  runner.js             -- Claude process spawning and orchestration
  worktree.js           -- git worktree lifecycle and diff stats
  commands/
    init.js             -- thin dispatcher for init subcommand
    run.js              -- thin dispatcher for run subcommand
    results.js          -- thin dispatcher for results subcommand
test/                   -- unit, integration, and end-to-end tests
```

## Making changes

### Adding a new metric

1. Add extraction logic in [lib/metrics.js](lib/metrics.js) inside `parseMetrics`.
2. Add the column to `COLUMNS` and `buildRow` in [lib/report.js](lib/report.js).
3. Add a unit test in [test/unit/metrics.test.js](test/unit/metrics.test.js).

### Adding a new CLI flag

1. Add parsing in [lib/args.js](lib/args.js) in the appropriate `parse*Args` function.
2. Pass the option through the command dispatcher in [lib/commands/](lib/commands/).
3. Use it in the relevant module.
4. Add a unit test in [test/unit/args.test.js](test/unit/args.test.js).

### Adding a recognized config file

Add the path to the `AI_CONFIG_FILES` or `DOC_FILES` array at the top of [lib/init.js](lib/init.js).

## Commit style

Small, atomic commits. Each commit should be self-contained and leave the test suite passing.

Subject line format: `<type>: <what changed>` where type is one of:

- `feat` -- new behavior
- `fix` -- bug fix
- `test` -- test-only change
- `refactor` -- no behavior change
- `docs` -- documentation only
- `chore` -- tooling, deps, CI

No period at the end of the subject line. Keep the subject under 72 characters.

## Pull requests

- One logical change per PR.
- All tests must pass (`npm test`).
- Lint and format must be clean (`npm run lint && npm run format:check`).
- Update tests to cover new behavior.

## Publishing

### Automated publishing (recommended)

Releases are automated via GitHub Actions on version tag pushes. To cut a release:

1. Bump `version` in `package.json`.
2. Commit: `git commit -m "chore: bump to v1.x.x"`.
3. Tag: `git tag -a v1.x.x -m "Release v1.x.x"`.
4. Push: `git push origin main --tags`.

The `publish.yml` workflow runs `npm publish` automatically when a `v*` tag is pushed. An `NPM_TOKEN` secret must be configured in the repository settings.

### Manual publishing

If GitHub Actions is unavailable or you need to publish manually:

```bash
# Verify the package before publishing
npm run build        # runs tests, lint, and format checks
npm pack             # dry-run, shows what would be packed

# Publish to NPM
npm publish
```

**Prerequisites:**

- You must be logged in: `npm login`
- You must have publish permissions for the `agent-bench` package on NPM
- The version in `package.json` must not already exist on NPM
