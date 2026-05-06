# agent-bench

A CLI tool that runs the same coding task across multiple AI assistant config variants in parallel, then produces a side-by-side comparison of cost, speed, token usage, and diff output, and scores each variant on code quality axes using AI-driven review.

Use it to answer: _does a better CLAUDE.md actually make Claude Code faster and cheaper? Does it produce better code?_

## How it works

1. You scaffold a benchmark directory from a target repo (`init`).
2. You edit the variant config files (CLAUDE.md, AGENTS.md, README.md, etc.) to test your ideas.
3. You run the benchmark (`run`) -- each variant gets its own git worktree, Claude runs in all of them in parallel, and you get a comparison table of metrics and diffs.
4. You score the code quality of each variant's changes (`review`) along configurable axes (0-100) to see which configuration produces better-quality code.

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) CLI installed and authenticated (`claude` on your PATH)
- Git 2.5+ (for worktree support)

## Worktree management

After each benchmark run completes:

- **All workspace changes are committed** to the variant branch so worktrees can be removed cleanly.
- If a commit fails (e.g., no staged changes), the tool continues without error.

After each review session:

- **All local changes are discarded** before the worktree is removed. Review sessions should not create changes on disk; this safeguard catches unexpected side effects.

## Installation

```
npm install -g agent-bench
```

Or use without installing:

```
npx agent-bench <command>
```

## Quick start

```bash
# 1. Scaffold a benchmark from your project
npx agent-bench init /path/to/your-project

# 2. Edit the variant files
#    variants/baseline/  -- leave as-is (or delete config_files entry to use repo directly)
#    variants/variant_b/ -- your experimental config

# 3. Fill in the prompt in agent-benchmark/benchmark.yaml

# 4. Run it
npx agent-bench run agent-benchmark/benchmark.yaml
```

## Commands

### `agent-bench init <repo-path>`

Scaffolds a benchmark directory from a target repo.

```
agent-bench init /path/to/repo [--variants <n>] [--name <name>]
```

| Flag             | Default           | Description                               |
| ---------------- | ----------------- | ----------------------------------------- |
| `--variants <n>` | `2`               | Number of variants to create (minimum 2)  |
| `--name <name>`  | `agent-benchmark` | Name of the benchmark directory to create |

What it does:

- Verifies the target path is a git repository.
- Scans for recognized config files (see [Recognized config files](#recognized-config-files)).
- Creates an `agent-benchmark/` directory in the current working directory.
- Copies found config files into each variant subdirectory.
- Generates a pre-filled `benchmark.yaml`.

If `agent-benchmark/` already exists, you will be prompted to use a numbered suffix, delete the existing directory, or cancel.

### `agent-bench run <benchmark.yaml>`

Runs the benchmark defined in a YAML config file.

```
agent-bench run benchmark.yaml [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]
```

| Flag                | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `--dry-run`         | Validate config and print what would happen, without running Claude     |
| `--yes`             | Skip the confirmation prompt before running                             |
| `--concurrency <n>` | Max number of parallel Claude processes (default: all variants at once) |
| `--no-cleanup`      | Skip the prompt to remove worktrees after the run                       |

**Security note:** This command runs Claude with `--dangerously-skip-permissions`, giving it full filesystem and shell access with no confirmation prompts. You will be asked to confirm before any processes are spawned (bypass with `--yes`).

### `agent-bench run-cleanup <benchmark.yaml>`

Remove worktrees and branches created by a prior `run --no-cleanup`.

```
agent-bench run-cleanup benchmark.yaml [--yes]
```

| Flag    | Description                  |
| ------- | ---------------------------- |
| `--yes` | Skip the confirmation prompt |

This is useful if you ran with `--no-cleanup` to inspect results, then want to clean up manually later.

### `agent-bench results`

List past benchmark result sets stored in `.agent-bench-results/`.

```
agent-bench results              # list all
agent-bench results <timestamp>  # re-print a specific report
```

### `agent-bench review <benchmark.yaml>`

Score the code quality of each variant's changeset along configurable axes (0-100) using AI-driven review sessions. Produces per-variant scores and cross-variant aggregate statistics.

```
agent-bench review benchmark.yaml [<timestamp>] [--dry-run] [--yes] [--concurrency <n>]
```

| Argument / Flag     | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `<benchmark.yaml>`  | Path to the benchmark config (provides repo, variant definitions, review axes) |
| `<timestamp>`       | Which result set to review (default: most recent in `.agent-bench-results/`)   |
| `--dry-run`         | Print what would happen without spawning Claude                                |
| `--yes`             | Skip confirmation prompt                                                       |
| `--concurrency <n>` | Max parallel review sessions (default: all variants)                           |

**Security note:** Like `run`, this command spawns Claude with `--dangerously-skip-permissions`. You will be asked to confirm before sessions are spawned (bypass with `--yes`).

Each review session:

### `agent-bench review-cleanup <benchmark.yaml> [<timestamp>]`

Remove review worktrees created by a prior review run.

```
agent-bench review-cleanup benchmark.yaml [<timestamp>] [--yes]
```

| Argument / Flag    | Description                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `<benchmark.yaml>` | Path to the benchmark config (provides variant definitions)                                |
| `<timestamp>`      | Which result set's worktrees to clean up (default: most recent in `.agent-bench-results/`) |
| `--yes`            | Skip confirmation prompt                                                                   |

This is useful if you used a prior review run to inspect the variant branches manually, then want to remove the worktrees without re-running the review.

### `agent-bench copilot-review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]`

Create pull requests for each benchmark variant and request Copilot code reviews.

```
agent-bench copilot-review benchmark.yaml [<timestamp>] [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]
```

| Argument / Flag     | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `<benchmark.yaml>`  | Path to the benchmark config (provides repo, variant definitions, base branch) |
| `<timestamp>`       | Which result set to create PRs for (default: most recent in `.agent-bench-results/`) |
| `--dry-run`         | Print what would happen without creating PRs                                   |
| `--yes`             | Skip confirmation prompt                                                       |
| `--concurrency <n>` | Max parallel PR creation (default: all variants)                               |
| `--no-cleanup`      | Leave worktrees after creating PRs (useful for manual inspection)              |

**Security note:** This command uses the `gh` CLI to create PRs and request reviews. You will be asked to confirm before any operations are performed (bypass with `--yes`).

For each variant:

1. Checks out or creates a worktree at the variant's branch.
2. Pushes the branch to the remote.
3. Creates a PR with the benchmark task prompt and variant metadata.
4. Requests Copilot review via `gh pr review --copilot`.
5. Collects the PR URL for the final report.

Results are printed to a summary table showing PR URLs.

Each review session:

1. Gets the full repository checked out at the variant's branch.
2. Receives the original task prompt and is asked to score the change on each configured axis.
3. Uses `git diff` to see the exact changes and inspects related files for context.
4. Responds with a JSON object containing a score (0-100 or null) and a one-sentence rationale per axis.

Results are written to `.agent-bench-results/<timestamp>/review.json` and `review.md`.

## Review config

The `review` key in `benchmark.yaml` controls the review command:

```yaml
review:
  # Which axes to score. Each entry can be a string (built-in description)
  # or an object with name and optional custom description.
  axes:
    - focused
    - clear
    - conventional
    - robust
    - concise
    - tested
    # Override the description of a built-in axis:
    - name: secure
      description: 'Security best practices followed, input validation present'
    # Custom axis:
    - name: domain-correct
      description: 'The implementation is correct with respect to the business domain'

  # Model for review sessions (defaults to the global model).
  model: opus

  # Max budget per review session in USD (default: 0.50).
  max_budget_usd: 0.50
```

If `review` is omitted, `agent-bench review` uses all 14 default axes, the global model, and a $0.50 budget per session.

### Default scoring axes

| Axis           | What it measures                                                    |
| -------------- | ------------------------------------------------------------------- |
| `accessible`   | a11y was adequately considered                                      |
| `clear`        | Easy to understand what was changed                                 |
| `concise`      | Minimal but still effective                                         |
| `conventional` | Follows conventions of the repo                                     |
| `documented`   | Changes to public APIs or complex logic are documented where needed |
| `focused`      | Doesn't do stuff outside of the requested changes                   |
| `idiomatic`    | Follows language/framework idioms                                   |
| `localized`    | i18n was considered                                                 |
| `modular`      | Clear separation of concerns                                        |
| `nonbreaking`  | Doesn't break existing contracts or APIs                            |
| `performant`   | Performance was adequately considered                               |
| `robust`       | Handles edge cases                                                  |
| `secure`       | Security was adequately considered                                  |
| `tested`       | Meaningful change in test coverage, broken tests are patched        |

Duplicate axes are deduplicated (first occurrence wins). Axes not in the built-in list are treated as custom axes using their description as-is.

## Benchmark config

A `benchmark.yaml` file drives each run:

```yaml
# The prompt given to Claude in every variant.
prompt: 'Refactor the auth middleware to use async/await'

# Global model to use (optional, defaults to opusplan).
# Can be overridden per-variant.
model: opusplan

# Maximum spend per variant in USD (safety cap).
max_budget_usd: 1.00

# The target repo to benchmark against (defaults to cwd if omitted).
repo: /path/to/your-project

# Each variant gets its own worktree and config overlay.
variants:
  baseline:
    label: 'A -- No changes'
    # No config_files: uses the repo's existing config as-is.

  structured_claude:
    label: 'B -- Structured CLAUDE.md'
    config_files:
      CLAUDE.md: ./variants/variant_b/CLAUDE.md

  with_agents:
    label: 'C -- CLAUDE.md + AGENTS.md (sonnet)'
    model: sonnet
    config_files:
      CLAUDE.md: ./variants/variant_c/CLAUDE.md
      AGENTS.md: ./variants/variant_c/AGENTS.md

  minimal_readme:
    label: 'D -- Lean README context'
    config_files:
      CLAUDE.md: ./variants/variant_d/CLAUDE.md
      README.md: ./variants/variant_d/README.md
```

### Config fields

| Field            | Required | Default    | Description                                                 |
| ---------------- | -------- | ---------- | ----------------------------------------------------------- |
| `prompt`         | yes      | --         | The task prompt sent to Claude in every variant             |
| `model`          | no       | `opusplan` | Global default Claude model (can be overridden per-variant) |
| `max_budget_usd` | no       | `1.00`     | Per-variant spend cap in USD                                |
| `repo`           | no       | `cwd`      | Absolute path to the target git repository                  |
| `variants`       | yes      | --         | Map of variant keys to variant definitions                  |

### Variant definition

| Field          | Required | Description                                                                   |
| -------------- | -------- | ----------------------------------------------------------------------------- |
| `label`        | no       | Human-readable name shown in the report (defaults to variant key)             |
| `model`        | no       | Claude model to use for this variant (inherits global `model` if unspecified) |
| `config_files` | no       | Map of `<repo-relative dest>: <source path>` file overlays                    |

`config_files` source paths are resolved relative to the directory containing `benchmark.yaml`. Destination paths are repo-relative (e.g. `CLAUDE.md`, `.github/copilot-instructions.md`).

A variant with no `config_files` entry uses the repo's existing files as-is.

## Recognized config files

`init` scans for these files and copies whichever exist:

**AI assistant config:**

- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `AGENTS.md`
- `.claude/agents/*.md`
- `SKILLS.md`
- `.github/copilot-instructions.md`

**Repo documentation:**

- `README.md`
- `CONTRIBUTING.md`

## Review output

After a review run, two tables are printed:

**Per-variant scores** (one column per axis, `null` means not applicable):

```
Review scores for run 2026-05-01T12-00-00Z

Variant          | focused | clear | conventional | robust | ...
-----------------+---------+-------+--------------+--------+----
A -- No changes  | 85      | 90    | 75           | 60     | ...
B -- Structured  | 92      | 88    | 80           | 70     | ...
```

**Aggregate statistics per variant** (null values excluded):

```
Aggregate scores per variant (null values excluded)

Variant          | Min | Max | Avg  | Median
-----------------+-----+-----+------+-------
A -- No changes  | 60  | 90  | 77.5 | 80.0
B -- Structured  | 45  | 95  | 80.0 | 82.5
```

Results are written to `.agent-bench-results/<timestamp>/`:

| File          | Contents                           |
| ------------- | ---------------------------------- |
| `review.json` | Structured scores for all variants |
| `review.md`   | The tables above in Markdown       |

## Manual review workflows

### Human review

After a benchmark run, inspect the diffs manually:

```bash
# View the diff for a specific variant
git diff <base-commit>..<agent-bench/variant-key>

# Or read the saved patch files
cat .agent-bench-results/<timestamp>/<variant>/diff.patch
```

Score each variant on the axes that matter to you and record the scores alongside `review.json` for comparison.

### Copilot review

For Copilot-based code review, use the `agent-bench copilot-review` command (see above). It automates creating PRs for each variant and requesting Copilot reviews.

## Report output

After a run, a comparison table is printed to the terminal:

```
Benchmark: "Refactor auth middleware" (2026-05-01T12:00:00Z)
Base commit: abc1234

Variant          | Model      | Duration | Input tok | Output tok | Cost    | Tool calls       | Diff (+/-)
-----------------+------------+----------+-----------+------------+---------+------------------+----------
A -- No changes  | opusplan   | 45s      | 12,340    | 3,210      | $0.42   | Bash:5 Edit:3    | +120/-80
B -- Structured  | sonnet     | 32s      | 9,800     | 2,100      | $0.31   | Bash:3 Edit:2    | +95/-60
```

Input tokens include cache creation and cache read tokens.

Results are also written to `.agent-bench-results/<timestamp>/`:

| File                     | Contents                                  |
| ------------------------ | ----------------------------------------- |
| `results.json`           | Structured metrics for all variants       |
| `results.md`             | The table above in Markdown               |
| `<variant>/events.jsonl` | Raw Claude stream-json events             |
| `<variant>/diff.patch`   | Full unified diff relative to base commit |

## Reproducibility

The config file, base commit SHA, model, and prompt are recorded in every `results.json`. All worktrees branch from the same HEAD commit, so the only variable between runs is the config overlay.

## Notes on prompt caching

The first variant to finish will pay the cache creation cost. Later variants running on the same model and account may benefit from cached system prompts. Token counts in the report reflect the actual API charges for each variant, including cache hits.

## License

MIT
