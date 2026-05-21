# agent-benchmark

A CLI tool that runs the same coding task across multiple AI assistant config variants in parallel, then produces a side-by-side comparison of cost, speed, token usage, and diff output, and scores each variant on code quality axes using AI-driven review.

Put numbers to the vibes and make data-driven decisions by understanding how different configurations (`CLAUDE.md`, `AGENTS.md`, repo documentation, model choice) influence the way AI coding agents interact with your codebase in terms of cost, speed, and output quality.

## How it works

1. Scaffold a benchmark directory from a target repo
2. Edit the variant config files (`CLAUDE.md`, `AGENTS.md`, `README.md` etc.) to test your ideas
3. Run the benchmark – each variant gets its own git worktree, Claude runs in all of them in parallel, and you get a comparison table of metrics and diffs
4. Score the code quality of each variant's changes along configurable axes (0-100) to see which configuration produces better-quality code

## Requirements

- Node.js 18+
- Git 2.5+ (for worktree support)
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (required for `copilot-review`)
- [Claude Code](https://claude.ai/code) CLI installed and authenticated (`claude` on your `PATH`)

## Installation

```sh
npm install -g agent-benchmark
```

Or use without installing:

```sh
npx agent-benchmark <command>
```

## Quick start

```sh
# 1. Scaffold a benchmark from your project
npx agent-benchmark init /path/to/your-project

# 2. Edit the variant files
#    variants/baseline/  – leave as-is (or delete config_files entry to use repo directly)
#    variants/variant_b/ – your experimental config

# 3. Fill in the prompt in agent-benchmark/benchmark.yaml

# 4. Run it
npx agent-benchmark run agent-benchmark/benchmark.yaml

# 5. Score code quality of each variant
npx agent-benchmark review agent-benchmark/benchmark.yaml
```

## Benchmarks

### Benchmark configuration

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
    label: 'A – No changes'
    # No config_files: uses the repo's existing config as-is.

  structured_claude:
    label: 'B – Structured CLAUDE.md'
    config_files:
      CLAUDE.md: ./variants/variant_b/CLAUDE.md

  with_agents:
    label: 'C – CLAUDE.md + AGENTS.md (sonnet)'
    model: sonnet
    config_files:
      CLAUDE.md: ./variants/variant_c/CLAUDE.md
      AGENTS.md: ./variants/variant_c/AGENTS.md

  minimal_readme:
    label: 'D – Lean README context'
    config_files:
      CLAUDE.md: ./variants/variant_d/CLAUDE.md
      README.md: ./variants/variant_d/README.md
```

#### Configuration fields

| Field            | Required | Default    | Description                                                 |
| ---------------- | -------- | ---------- | ----------------------------------------------------------- |
| `prompt`         | yes      | –          | The task prompt sent to Claude in every variant             |
| `model`          | no       | `opusplan` | Global default Claude model (can be overridden per-variant) |
| `max_budget_usd` | no       | `1.00`     | Per-variant spend cap in USD                                |
| `repo`           | no       | `cwd`      | Absolute path to the target git repository                  |
| `variants`       | yes      | –          | Map of variant keys to variant definitions                  |

#### Variant definition

| Field          | Required | Description                                                                   |
| -------------- | -------- | ----------------------------------------------------------------------------- |
| `label`        | no       | Human-readable name shown in the report (defaults to variant key)             |
| `model`        | no       | Claude model to use for this variant (inherits global `model` if unspecified) |
| `config_files` | no       | Map of `<repo-relative dest>: <source path>` file overlays                    |

`config_files` source paths are resolved relative to the directory containing `benchmark.yaml`. Destination paths are repo-relative (e.g. `CLAUDE.md`, `.github/copilot-instructions.md`). Any file can be used as an overlay -- the destination path is not limited to AI config files. For example, you could override `src/config.json` or `tsconfig.json` if that is relevant to your benchmark.

A variant with no `config_files` entry uses the repo's existing files as-is.

### Automatically recognized config files

`init` scans for these files and copies whichever exist:

**AI assistant config:**

- `CLAUDE.md` and `AGENTS.md` (from any location, including subfolders)
- `.claude/` folder and contents
- `.github/copilot-instructions.md`

**Repo documentation:**

- `README.md`
- `CONTRIBUTING.md`

### Report output

After a run, a comparison table is printed to the terminal:

```
Benchmark: "Refactor auth middleware" (2026-05-01T12:00:00Z)
Base commit: abc1234

Metric             | A – No changes    | B – Structured
-------------------+-------------------+---------------
Model              | opusplan          | sonnet
Duration           | 45s               | 32s
Input tokens       | 12,340            | 9,800
Output tokens      | 3,210             | 2,100
Cache write tokens | 4,200             | 0
Cache read tokens  | 6,100             | 8,300
Cost               | $0.42             | $0.31
Normalized cost    | $0.40             | $0.35
Tool calls         | Bash:5 Edit:3     | Bash:3 Edit:2
Diff (+/-)         | +120/-80          | +95/-60
```

Input tokens include cache creation and cache read tokens. Normalized cost re-prices all input tokens at the standard (non-cached) rate, removing variance caused by cache hits and misses between variants.

The report also lists the git branch created for each variant:

```
Variant branches:
  A – No changes: agent-benchmark/baseline
  B – Structured: agent-benchmark/structured_claude
```

Results are also written to `.agent-benchmark-results/<timestamp>/`:

| File                     | Contents                                  |
| ------------------------ | ----------------------------------------- |
| `results.json`           | Structured metrics for all variants       |
| `results.md`             | The table above in Markdown               |
| `<variant>/events.jsonl` | Raw Claude stream-json events             |
| `<variant>/diff.patch`   | Full unified diff relative to base commit |

### Config file exclusion

Config overlay files (those listed under `config_files` in a variant) are excluded from the variant's branch and diff unless Claude actually modified them. This ensures that diffs reflect only Claude's code changes, not the configuration differences between variants.

### Reproducibility

The config file, base commit SHA, model, and prompt are recorded in every `results.json`. All worktrees branch from the same HEAD commit, so the only variable between runs is the config overlay.

### Notes on prompt caching

The first variant to finish will pay the cache creation cost. Later variants running on the same model and account may benefit from cached system prompts. Token counts in the report reflect the actual API charges for each variant, including cache hits.

The **Normalized cost** row removes this variance by re-pricing all cached input tokens (both cache writes and cache reads) at the standard input rate. Use this row when comparing cost efficiency between variants, since it is independent of execution order and cache state.

## Reviews

### Review configuration

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

If `review` is omitted, `agent-benchmark review` uses all 14 default axes, the global model, and a $0.50 budget per session.

#### Default scoring axes

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

### Review output

After a review run, two tables are printed:

**Per-axis scores** (one column per variant, `null` means not applicable):

```
Review scores for run 2026-05-01T12-00-00Z

Axis         | A – No changes | B – Structured
-------------+----------------+---------------
focused      | 85             | 92
clear        | 90             | 88
conventional | 75             | 80
robust       | 60             | 70
...          | ...            | ...
```

**Aggregate statistics** (one column per variant, `null` values excluded):

```
Aggregate scores per variant (null values excluded)

Metric | A – No changes | B – Structured
-------+----------------+---------------
Min    | 60             | 45
Max    | 90             | 95
Avg    | 77.5           | 80.0
Median | 80.0           | 82.5
```

Results are written to `.agent-benchmark-results/<timestamp>/`:

| File          | Contents                           |
| ------------- | ---------------------------------- |
| `review.json` | Structured scores for all variants |
| `review.md`   | The tables above in Markdown       |

### Additional review workflows

#### Copilot review

For Copilot-based code review, use the `agent-benchmark copilot-review` command. It automates creating PRs for each variant and requesting Copilot reviews.

#### Human review

After a benchmark run, inspect the diffs manually:

```bash
# View the diff for a specific variant
git diff <base-commit>..<agent-benchmark/variant-key>

# Or read the saved patch files
cat .agent-benchmark-results/<timestamp>/<variant>/diff.patch
```

Score each variant on the axes that matter to you and record the scores alongside `review.json` for comparison.

### Config file exclusion

Config overlay files (those listed under `config_files` in a variant) are excluded from the variant's branch and diff unless Claude actually modified them. This ensures that reviews reflect only Claude's code changes, not the configuration differences between variants.

## Commands

### Init

Scaffolds a benchmark directory from a target repo.

```
agent-benchmark init <repo-path> [--variants <n>] [--name <name>]
```

| Argument / Flag  | Default           | Description                               |
| ---------------- | ----------------- | ----------------------------------------- |
| `<repo-path>`    |                   | Local path to the target repository       |
| `--variants <n>` | `2`               | Number of variants to create (minimum 2)  |
| `--name <name>`  | `agent-benchmark` | Name of the benchmark directory to create |

What it does:

- Verifies the target path is a git repository
- Scans for recognized config files
- Creates an `agent-benchmark/` directory in the current working directory
- Copies found config files into each variant subdirectory
- Generates a pre-filled `benchmark.yaml`

If `agent-benchmark/` already exists, you will be prompted to use a numbered suffix, delete the existing directory, or cancel.

### Run

Runs the benchmark defined in a YAML config file.

```
agent-benchmark run <benchmark.yaml> [--dry-run] [--yes] [--concurrency <n>]
```

| Argument / Flag     | Default | Description                                                         |
| ------------------- | ------- | ------------------------------------------------------------------- |
| `<benchmark.yaml>`  |         | Path to the benchmark config                                        |
| `--dry-run`         |         | Validate config and print what would happen, without running Claude |
| `--yes`             |         | Skip the confirmation prompt before running                         |
| `--concurrency <n>` | all     | Max number of parallel Claude processes                             |

**Security note:** This command runs Claude with `--dangerously-skip-permissions`, giving it full filesystem and shell access with no confirmation prompts. You will be asked to confirm before any processes are spawned (bypass with `--yes`).

Each variant's changes are committed to a branch named `agent-benchmark/<variant-key>`. Worktrees are removed automatically when the run finishes. Branch names are printed at the end of the run and recorded in `results.json`.

### Results

Display benchmark result sets stored in `.agent-benchmark-results/`.

```
agent-benchmark results [<timestamp>] [--list]
```

| Argument / Flag | Description                    |
| --------------- | ------------------------------ |
| `<timestamp>`   | Which result set to display    |
| `--list`        | List all available result sets |

### Review

Score the code quality of each variant's changeset along configurable axes (0-100) using AI-driven review sessions. Produces per-variant scores and cross-variant aggregate statistics.

```
agent-benchmark review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>]
```

| Argument / Flag     | Default | Description                                     |
| ------------------- | ------- | ----------------------------------------------- |
| `<benchmark.yaml>`  |         | Path to the benchmark config                    |
| `<timestamp>`       | latest  | Which result set to review                      |
| `--dry-run`         |         | Print what would happen without spawning Claude |
| `--yes`             |         | Skip confirmation prompt                        |
| `--concurrency <n>` | all     | Max parallel review sessions                    |

Each review session:

1. Gets the full repository checked out at the variant's branch
2. Receives the original task prompt and is asked to score the change on each configured axis
3. Uses `git log` and `git diff` to locate and inspect the exact changes, and reads related files for context
4. Writes scores to `.review-scores.json` using the `Write` tool — a JSON object with a score (0-100 or `null`) and a one-sentence rationale per axis

Results are written to `.agent-benchmark-results/<timestamp>/review.json` and `review.md`.

### Copilot review

Create pull requests for each benchmark variant and request Copilot code reviews.

```
agent-benchmark copilot-review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>]
```

| Argument / Flag     | Default | Description                                  |
| ------------------- | ------- | -------------------------------------------- |
| `<benchmark.yaml>`  |         | Path to the benchmark config                 |
| `<timestamp>`       | latest  | Which result set to create PRs for           |
| `--dry-run`         |         | Print what would happen without creating PRs |
| `--yes`             |         | Skip confirmation prompt                     |
| `--concurrency <n>` | all     | Max parallel PR creation                     |

**Security note:** This command uses the `gh` CLI to create PRs and request reviews. You will be asked to confirm before any operations are performed (bypass with `--yes`).

For each variant:

1. Checks out or creates a worktree at the variant's branch
2. Pushes the branch to the remote
3. Creates a PR with the benchmark task prompt and variant metadata
4. Requests Copilot review via `gh pr review --copilot`
5. Collects the PR URL for the final report

Worktrees are removed automatically when the command finishes. Results are printed to a summary table showing PR URLs.

## License

[Licensed under MIT.](./LICENSE) Do what you will.
