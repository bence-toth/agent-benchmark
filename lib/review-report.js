import fs from 'fs/promises'
import path from 'path'

const RESULTS_DIR = '.agent-benchmark-results'

export function printReviewReport(timestamp, axes, variantScores) {
  const lines = buildReportLines(timestamp, axes, variantScores)
  console.log('\n' + lines.join('\n'))
}

export async function writeReviewFiles(timestamp, axes, variantScores) {
  const outDir = path.join(process.cwd(), RESULTS_DIR, timestamp)
  await fs.mkdir(outDir, { recursive: true })

  const reviewTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonData = buildJsonData(timestamp, reviewTimestamp, axes, variantScores)
  await fs.writeFile(path.join(outDir, 'review.json'), JSON.stringify(jsonData, null, 2))

  const mdLines = buildReportLines(timestamp, axes, variantScores)
  await fs.writeFile(path.join(outDir, 'review.md'), mdLines.join('\n') + '\n')

  console.log(`\nReview results written to: ${outDir}`)
}

function buildReportLines(timestamp, axes, variantScores) {
  const lines = []
  lines.push(`Review scores for run ${timestamp}`)
  lines.push('')

  const axisNames = axes.map((a) => a.name)
  const variantKeys = Object.keys(variantScores)
  const labels = variantKeys.map((key) => variantScores[key].label)

  // Scores table: rows = axes, columns = variants
  const scoreColumns = variantKeys.map((key) => buildScoreColumn(variantScores[key], axisNames))
  const scoreLabelWidth = Math.max('Axis'.length, ...axisNames.map((n) => n.length))
  const scoreColWidths = labels.map((label, i) =>
    Math.max(label.length, ...scoreColumns[i].map((v) => v.length)),
  )

  lines.push(
    ['Axis'.padEnd(scoreLabelWidth), ...labels.map((l, i) => l.padEnd(scoreColWidths[i]))].join(
      ' | ',
    ),
  )
  lines.push([scoreLabelWidth, ...scoreColWidths].map((w) => '-'.repeat(w)).join('-+-'))
  for (let r = 0; r < axisNames.length; r++) {
    const cells = [
      axisNames[r].padEnd(scoreLabelWidth),
      ...scoreColumns.map((col, i) => col[r].padEnd(scoreColWidths[i])),
    ]
    lines.push(cells.join(' | '))
  }

  lines.push('')
  lines.push('Aggregate scores per variant (null values excluded)')
  lines.push('')

  // Aggregates table: rows = stats, columns = variants
  const AGG_LABELS = ['Min', 'Max', 'Avg', 'Median']
  const aggColumns = variantKeys.map((key) => buildAggColumn(variantScores[key]))
  const aggLabelWidth = Math.max('Metric'.length, ...AGG_LABELS.map((l) => l.length))
  const aggColWidths = labels.map((label, i) =>
    Math.max(label.length, ...aggColumns[i].map((v) => v.length)),
  )

  lines.push(
    ['Metric'.padEnd(aggLabelWidth), ...labels.map((l, i) => l.padEnd(aggColWidths[i]))].join(
      ' | ',
    ),
  )
  lines.push([aggLabelWidth, ...aggColWidths].map((w) => '-'.repeat(w)).join('-+-'))
  for (let r = 0; r < AGG_LABELS.length; r++) {
    const cells = [
      AGG_LABELS[r].padEnd(aggLabelWidth),
      ...aggColumns.map((col, i) => col[r].padEnd(aggColWidths[i])),
    ]
    lines.push(cells.join(' | '))
  }

  return lines
}

function buildScoreColumn(variantResult, axisNames) {
  if (variantResult.error) {
    return axisNames.map(() => 'ERR')
  }
  return axisNames.map((name) => {
    const entry = variantResult.scores?.[name]
    if (!entry) return '-'
    return entry.score === null ? 'null' : String(entry.score)
  })
}

function buildAggColumn(variantResult) {
  const agg = variantResult.aggregates
  if (!agg) return ['ERR', 'ERR', 'ERR', 'ERR']
  const fmt = (v) => (v === null ? '-' : String(v))
  return [fmt(agg.min), fmt(agg.max), fmt(agg.avg), fmt(agg.median)]
}

function buildJsonData(timestamp, reviewTimestamp, axes, variantScores) {
  const axisNames = axes.map((a) => a.name)
  const variants = {}
  for (const [key, result] of Object.entries(variantScores)) {
    variants[key] = {
      label: result.label,
      scores: result.scores ?? null,
      aggregates: result.aggregates ?? null,
      error: result.error ?? null,
    }
  }
  return { timestamp, reviewTimestamp, axes: axisNames, variants }
}
