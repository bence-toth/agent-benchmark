# agent-bench

A CLI tool that runs the same coding task across multiple AI assistant config variants in parallel, then produces a side-by-side comparison of cost, speed, token usage, and diff output.

Use it to answer: *does a better CLAUDE.md actually make Claude Code faster and cheaper?*

## How it works

1. You scaffold a benchmark directory from a target repo (`init`).
2. You edit the variant config files (CLAUDE.md, AGENTS.md, README.md, etc.) to test your ideas.
3. You run the benchmark (`run`) -- each variant gets its own git worktree, Claude runs in all of them in parallel, and you get a comparison table.

## Requirements

- Node.js 18+
- [Claude Code](https://claude.ai/code) CLI installed and authenticated (`claude` on your PATH)
- Git 2.5+ (for worktree support)

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

| Flag | Default | Description |
|------|---------|-------------|
| `--variants <n>` | `2` | Number of variants to create (minimum 2) |
| `--name <name>` | `agent-benchmark` | Name of the benchmark directory to create |

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

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate config and print what would happen, without running Claude |
| `--yes` | Skip the confirmation prompt before running |
| `--concurrency <n>` | Max number of parallel Claude processes (default: all variants at once) |
| `--no-cleanup` | Skip the prompt to remove worktrees after the run |

**Security note:** This command runs Claude with `--dangerously-skip-permissions`, giving it full filesystem and shell access with no confirmation prompts. You will be asked to confirm before any processes are spawned (bypass with `--yes`).

### `agent-bench results`

List past benchmark result sets stored in `.agent-bench-results/`.

```
agent-bench results            # list all
agent-bench results <timestamp>  # re-print a specific report
```

## Benchmark config

A `benchmark.yaml` file drives each run:

```yaml
# The prompt given to Claude in every variant.
prompt: "Refactor the auth middleware to use async/await"

# Model to use (optional, defaults to opusplan).
model: opusplan

# Maximum spend per variant in USD (safety cap).
max_budget_usd: 1.00

# The target repo to benchmark against (defaults to cwd if omitted).
repo: /path/to/your-project

# Each variant gets its own worktree and config overlay.
variants:
  baseline:
    label: "A -- No changes"
    # No config_files: uses the repo's existing config as-is.

  structured_claude:
    label: "B -- Structured CLAUDE.md"
    config_files:
      CLAUDE.md: ./variants/variant_b/CLAUDE.md

  with_agents:
    label: "C -- CLAUDE.md + AGENTS.md"
    config_files:
      CLAUDE.md: ./variants/variant_c/CLAUDE.md
      AGENTS.md: ./variants/variant_c/AGENTS.md

  minimal_readme:
    label: "D -- Lean README context"
    config_files:
      CLAUDE.md: ./variants/variant_d/CLAUDE.md
      README.md: ./variants/variant_d/README.md
```

### Config fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `prompt` | yes | -- | The task prompt sent to Claude in every variant |
| `model` | no | `opusplan` | Claude model to use |
| `max_budget_usd` | no | `1.00` | Per-variant spend cap in USD |
| `repo` | no | `cwd` | Absolute path to the target git repository |
| `variants` | yes | -- | Map of variant keys to variant definitions |

### Variant definition

| Field | Required | Description |
|-------|----------|-------------|
| `label` | no | Human-readable name shown in the report (defaults to variant key) |
| `config_files` | no | Map of `<repo-relative dest>: <source path>` file overlays |

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

**Repo documentation (optional):**
- `README.md`
- `CONTRIBUTING.md`

## Report output

After a run, a comparison table is printed to the terminal:

```
Benchmark: "Refactor auth middleware" (2026-05-01T12:00:00Z)
Base commit: abc1234
Model: opusplan

Variant          | Duration | Input tok | Output tok | Cost    | Tool calls       | Diff (+/-)
-----------------+----------+-----------+------------+---------+------------------+----------
A -- No changes  | 45s      | 12,340    | 3,210      | $0.42   | Bash:5 Edit:3    | +120/-80
B -- Structured  | 32s      | 9,800     | 2,100      | $0.31   | Bash:3 Edit:2    | +95/-60
```

Input tokens include cache creation and cache read tokens.

Results are also written to `.agent-bench-results/<timestamp>/`:

| File | Contents |
|------|----------|
| `results.json` | Structured metrics for all variants |
| `results.md` | The table above in Markdown |
| `<variant>/events.jsonl` | Raw Claude stream-json events |
| `<variant>/diff.patch` | Full unified diff relative to base commit |

## Reproducibility

The config file, base commit SHA, model, and prompt are recorded in every `results.json`. All worktrees branch from the same HEAD commit, so the only variable between runs is the config overlay.

## Notes on prompt caching

The first variant to finish will pay the cache creation cost. Later variants running on the same model and account may benefit from cached system prompts. Token counts in the report reflect the actual API charges for each variant, including cache hits.

## License

MIT
