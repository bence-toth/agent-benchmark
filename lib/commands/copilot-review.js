import { loadConfig } from '../config.js'
import { parseCopilotReviewArgs } from '../args.js'
import { resolveTimestamp, loadResultSet } from '../report.js'
import { runCopilotReview } from '../copilot-reviewer.js'
import { createInterface } from 'readline'

export async function copilotReview(args) {
  const opts = parseCopilotReviewArgs(args)
  const config = await loadConfig(opts.configFile)

  const timestamp = await resolveTimestamp(opts.timestamp)
  const resultSet = await loadResultSet(timestamp)

  const variantKeys = Object.keys(config.variants).filter((k) => !resultSet.variants[k]?.error)

  if (!opts.dryRun && !opts.yes) {
    await confirmCopilotReview(variantKeys, config.prBaseBranch, config)
  }

  const results = await runCopilotReview(config, resultSet, opts)

  if (results) {
    printCopilotReviewReport(timestamp, results)
  }
}

async function confirmCopilotReview(variantKeys, prBaseBranch) {
  console.log(`\nAbout to create PRs and request Copilot reviews.`)
  console.log(`Base branch: ${prBaseBranch}`)
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

function printCopilotReviewReport(timestamp, results) {
  console.log(`\nCreated PRs for benchmark run ${timestamp}\n`)

  const variantKeys = Object.keys(results)
  const maxLabelLen = Math.max(...variantKeys.map((k) => results[k].label.length))
  const maxStatusLen = 8

  // Print header
  console.log(
    `Variant${' '.repeat(Math.max(1, maxLabelLen - 7))} | Status${' '.repeat(Math.max(1, maxStatusLen - 6))} | PR URL`,
  )
  console.log(`${'-'.repeat(maxLabelLen + 1)}-+-${'-'.repeat(maxStatusLen + 1)}-+${'-'.repeat(80)}`)

  // Print rows
  for (const key of variantKeys) {
    const { label, status, prUrl } = results[key]
    const urlDisplay = prUrl || '(failed)'
    console.log(`${label.padEnd(maxLabelLen)} | ${status.padEnd(maxStatusLen)} | ${urlDisplay}`)
  }

  // Print summary
  const successful = variantKeys.filter((k) => results[k].status === 'success').length
  const failed = variantKeys.filter((k) => results[k].status === 'failed').length
  const created = variantKeys.filter((k) => results[k].status === 'created').length

  console.log(
    `\nSummary: ${successful} successful, ${created} created (review request failed), ${failed} failed`,
  )
}
