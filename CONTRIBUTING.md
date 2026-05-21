# Contributing to agent-benchmark

## Development setup

```bash
git clone https://github.com/bence-toth/agent-benchmark
cd agent-benchmark
npm install
```

No build step. The package runs directly from source as ESM.

## Running locally without publishing

To test changes locally without publishing to NPM:

### Via npm link (preferred for rapid iteration)

```bash
# In the agent-benchmark directory
npm link

# The agent-benchmark command is now available globally from your local source:
agent-benchmark --help

# When done, unlink:
npm unlink -g agent-benchmark
```

### Via npm pack (simulate the published package)

```bash
# In the agent-benchmark directory
npm pack

# This creates agent-benchmark-0.1.0.tgz. Install it elsewhere:
npm install /path/to/agent-benchmark-0.1.0.tgz
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
npm run test:coverage     # all tests with LCOV coverage report (coverage/lcov.info)
```

Tests use the Node.js built-in test runner (`node:test`). No external test framework.

Integration tests create real temporary git repositories and benchmark directories, then clean them up. They do not require a Claude API key – the Claude runner is not exercised in tests.

## Lint and format

```bash
npm run lint          # ESLint
npm run format        # Prettier (writes in place)
npm run format:check  # Prettier (check only, used in CI)
```

Prettier is the source of truth for style. ESLint only enforces correctness rules (no-unused-vars, eqeqeq, prefer-const, etc.) – no style rules that overlap with Prettier.

## Project layout

```
bin/cli.js              – entry point, subcommand routing
lib/
  args.js               – CLI flag parsing for all subcommands
  config.js             – YAML loading and validation
  copilot-reviewer.js   – GitHub Copilot review orchestration
  init.js               – agent-benchmark init implementation
  metrics.js            – stream-json event parsing
  pricing.js            – normalized cost calculation across cache tiers
  report.js             – terminal table + result file writing
  review-prompt.js      – builds the review prompt for AI reviewers
  review-report.js      – review result file writing and loading
  reviewer.js           – Claude review orchestration
  runner.js             – Claude process spawning and orchestration
  worktree.js           – git worktree lifecycle and diff stats
  commands/
    copilot-review.js   – thin dispatcher for copilot-review subcommand
    init.js             – thin dispatcher for init subcommand
    results.js          – thin dispatcher for results subcommand
    review.js           – thin dispatcher for review subcommand
    run.js              – thin dispatcher for run subcommand
test/                   – unit, integration, and end-to-end tests
```

## Commit style

Small, atomic commits. Each commit should be self-contained and leave the test suite passing.

Subject line format: `<type>: <what changed>` where type is one of:

- `feat` – new behavior
- `fix` – bug fix
- `test` – test-only change
- `refactor` – no behavior change
- `docs` – documentation only
- `chore` – tooling, deps, CI

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
npm run pack         # dry-run, shows what would be packed

# Publish to NPM
npm publish
```

**Prerequisites:**

- You must be logged in: `npm login`
- You must have publish permissions for the `agent-benchmark` package on NPM
- The version in `package.json` must not already exist on NPM
