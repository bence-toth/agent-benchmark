import fs from 'fs/promises'
import path from 'path'

const RESULTS_DIR = '.agent-bench-results'

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

  // Scores table
  const scoreRows = variantKeys.map((key) => buildScoreRow(variantScores[key], axisNames))
  const scoreColWidths = computeScoreColWidths(scoreRows, axisNames)
  lines.push(formatScoreHeader(axisNames, scoreColWidths))
  lines.push(formatSeparator(scoreColWidths))
  for (const row of scoreRows) {
    lines.push(formatRow(row, scoreColWidths))
  }

  lines.push('')
  lines.push('Aggregate scores per variant (null values excluded)')
  lines.push('')

  // Aggregates table
  const aggRows = variantKeys.map((key) => buildAggRow(variantScores[key]))
  const AGG_COLS = ['Variant', 'Min', 'Max', 'Avg', 'Median']
  const aggColWidths = computeColWidths(aggRows, AGG_COLS)
  lines.push(AGG_COLS.map((c, i) => c.padEnd(aggColWidths[i])).join(' | '))
  lines.push(aggColWidths.map((w) => '-'.repeat(w)).join('-+-'))
  for (const row of aggRows) {
    lines.push(formatRow(row, aggColWidths))
  }

  return lines
}

function buildScoreRow(variantResult, axisNames) {
  const label = variantResult.label
  if (variantResult.error) {
    return [label, ...axisNames.map(() => 'ERR')]
  }
  return [
    label,
    ...axisNames.map((name) => {
      const entry = variantResult.scores?.[name]
      if (!entry) return '-'
      return entry.score === null ? 'null' : String(entry.score)
    }),
  ]
}

function buildAggRow(variantResult) {
  const label = variantResult.label
  const agg = variantResult.aggregates
  if (!agg) return [label, 'ERR', 'ERR', 'ERR', 'ERR']
  const fmt = (v) => (v === null ? '-' : String(v))
  return [label, fmt(agg.min), fmt(agg.max), fmt(agg.avg), fmt(agg.median)]
}

function computeScoreColWidths(rows, axisNames) {
  const headers = ['Variant', ...axisNames]
  return headers.map((header, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0)
    return Math.max(header.length, maxData)
  })
}

function computeColWidths(rows, headers) {
  return headers.map((header, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0)
    return Math.max(header.length, maxData)
  })
}

function formatScoreHeader(axisNames, widths) {
  return ['Variant', ...axisNames].map((col, i) => col.padEnd(widths[i])).join(' | ')
}

function formatSeparator(widths) {
  return widths.map((w) => '-'.repeat(w)).join('-+-')
}

function formatRow(row, widths) {
  return row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join(' | ')
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
