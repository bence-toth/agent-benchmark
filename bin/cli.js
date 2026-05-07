#!/usr/bin/env node

import { run } from '../lib/commands/run.js'
import { init } from '../lib/commands/init.js'
import { results } from '../lib/commands/results.js'
import { review } from '../lib/commands/review.js'
import { runCleanup } from '../lib/commands/run-cleanup.js'
import { reviewCleanup } from '../lib/commands/review-cleanup.js'
import { copilotReview } from '../lib/commands/copilot-review.js'
import { copilotReviewCleanup } from '../lib/commands/copilot-review-cleanup.js'

const [, , subcommand, ...args] = process.argv

const help = `
Usage:
  agent-benchmark init <repo-path> [--variants <n>] [--name <name>]
  agent-benchmark run <benchmark.yaml> [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]
  agent-benchmark run-cleanup <benchmark.yaml> [--yes]
  agent-benchmark results [<timestamp>] [--list]
  agent-benchmark review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>]
  agent-benchmark review-cleanup <benchmark.yaml> [<timestamp>] [--yes]
  agent-benchmark copilot-review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]
  agent-benchmark copilot-review-cleanup <benchmark.yaml> [--yes]
`.trim()

async function main() {
  switch (subcommand) {
    case 'init':
      await init(args)
      break
    case 'run':
      await run(args)
      break
    case 'run-cleanup':
      await runCleanup(args)
      break
    case 'results':
      await results(args)
      break
    case 'review':
      await review(args)
      break
    case 'review-cleanup':
      await reviewCleanup(args)
      break
    case 'copilot-review':
      await copilotReview(args)
      break
    case 'copilot-review-cleanup':
      await copilotReviewCleanup(args)
      break
    default:
      console.error(help)
      process.exit(subcommand ? 1 : 0)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
