import { loadConfig } from '../config.js'
import { parseReviewArgs } from '../args.js'
import { resolveTimestamp, loadResultSet } from '../report.js'
import { runReview } from '../reviewer.js'
import { printReviewReport, writeReviewFiles } from '../review-report.js'
import { createInterface } from 'readline'

export async function review(args) {
  const opts = parseReviewArgs(args)
  const config = await loadConfig(opts.configFile)

  const timestamp = await resolveTimestamp(opts.timestamp)
  const resultSet = await loadResultSet(timestamp)

  const variantKeys = Object.keys(config.variants)
  const { axes } = config.review

  if (!opts.dryRun && !opts.yes) {
    await confirmReview(variantKeys, axes, config.review.model, config.review.maxBudgetUsd)
  }

  const scores = await runReview(config, resultSet, opts)

  if (scores) {
    printReviewReport(timestamp, axes, scores)
    await writeReviewFiles(timestamp, axes, scores)
  }
}

async function confirmReview(variantKeys, axes, model, maxBudgetUsd) {
  console.log(`\nAbout to run review sessions with --dangerously-skip-permissions.`)
  console.log(`Model: ${model}  Budget: $${maxBudgetUsd} per session`)
  console.log(`Axes: ${axes.map((a) => a.name).join(', ')}`)
  console.log(`Variants: ${variantKeys.join(', ')}`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question('\nProceed? [y/N] ', resolve)
  })
  rl.close()

  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.')
    process.exit(0)
  }
}
