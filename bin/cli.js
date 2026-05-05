#!/usr/bin/env node

import { run } from '../lib/commands/run.js'
import { init } from '../lib/commands/init.js'
import { results } from '../lib/commands/results.js'
import { review } from '../lib/commands/review.js'

const [, , subcommand, ...args] = process.argv

const help = `
Usage:
  agent-bench init <repo-path> [--variants <n>] [--name <name>]
  agent-bench run <benchmark.yaml> [--dry-run] [--yes] [--concurrency <n>] [--no-cleanup]
  agent-bench results [<timestamp>]
  agent-bench review <benchmark.yaml> [<timestamp>] [--dry-run] [--yes] [--concurrency <n>]
`.trim()

async function main() {
  switch (subcommand) {
    case 'init':
      await init(args)
      break
    case 'run':
      await run(args)
      break
    case 'results':
      await results(args)
      break
    case 'review':
      await review(args)
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
