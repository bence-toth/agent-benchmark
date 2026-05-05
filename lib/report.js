import fs from 'fs/promises'
import path from 'path'

const RESULTS_DIR = '.agent-bench-results'

export function generateReport(reportData) {
  const { prompt, baseCommit, timestamp, variants } = reportData
  const lines = buildReportLines(prompt, baseCommit, timestamp, variants)
  console.log('\n' + lines.join('\n'))
}

export async function writeResultFiles(reportData) {
  const { timestamp, variants } = reportData
  const outDir = path.join(process.cwd(), RESULTS_DIR, timestamp)
  await fs.mkdir(outDir, { recursive: true })

  // results.json
  const jsonData = buildJsonData(reportData)
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(jsonData, null, 2))

  // results.md
  const { prompt, baseCommit } = reportData
  const mdLines = buildReportLines(prompt, baseCommit, timestamp, variants)
  await fs.writeFile(path.join(outDir, 'results.md'), mdLines.join('\n') + '\n')

  // per-variant files
  for (const [key, result] of Object.entries(variants)) {
    const varDir = path.join(outDir, key)
    await fs.mkdir(varDir, { recursive: true })

    if (result.events) {
      const jsonl = result.events.map((e) => JSON.stringify(e)).join('\n')
      await fs.writeFile(path.join(varDir, 'events.jsonl'), jsonl + '\n')
    }

    if (result.diffStats?.patch) {
      await fs.writeFile(path.join(varDir, 'diff.patch'), result.diffStats.patch)
    }
  }

  console.log(`\nResults written to: ${outDir}`)
}

export async function listResults() {
  const dir = path.join(process.cwd(), RESULTS_DIR)
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    console.log('No results found.')
    return
  }
  if (entries.length === 0) {
    console.log('No results found.')
    return
  }
  console.log('Past benchmark results:')
  for (const e of entries.sort().reverse()) {
    console.log(`  ${e}`)
  }
}

export async function resolveTimestamp(timestamp) {
  const dir = path.join(process.cwd(), RESULTS_DIR)
  if (timestamp) {
    const resolved = path.join(dir, timestamp)
    try {
      await fs.access(resolved)
    } catch {
      throw new Error(`No result found for timestamp: ${timestamp}`)
    }
    return timestamp
  }
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    throw new Error('No results found. Run agent-bench run first.')
  }
  const sorted = entries.filter(Boolean).sort()
  if (sorted.length === 0) throw new Error('No results found. Run agent-bench run first.')
  return sorted[sorted.length - 1]
}

export async function loadResultSet(timestamp) {
  const jsonPath = path.join(process.cwd(), RESULTS_DIR, timestamp, 'results.json')
  let raw
  try {
    raw = await fs.readFile(jsonPath, 'utf8')
  } catch {
    throw new Error(`Cannot read results.json for timestamp: ${timestamp}`)
  }
  return JSON.parse(raw)
}

export async function showResult(timestamp) {
  const dir = path.join(process.cwd(), RESULTS_DIR, timestamp)
  const mdPath = path.join(dir, 'results.md')
  let content
  try {
    content = await fs.readFile(mdPath, 'utf8')
  } catch {
    throw new Error(`No result found for timestamp: ${timestamp}`)
  }
  console.log(content)
}

function buildReportLines(prompt, baseCommit, timestamp, variants) {
  const lines = []
  lines.push(`Benchmark: "${prompt}" (${timestamp})`)
  lines.push(`Base commit: ${baseCommit.slice(0, 7)}`)
  lines.push('')

  const rows = []
  for (const [, result] of Object.entries(variants)) {
    rows.push(buildRow(result))
  }

  const colWidths = computeColWidths(rows)
  lines.push(formatHeader(colWidths))
  lines.push(formatSeparator(colWidths))
  for (const row of rows) {
    lines.push(formatRow(row, colWidths))
  }

  lines.push('')
  lines.push('Note: input tokens include cache creation and cache read tokens.')
  return lines
}

const COLUMNS = [
  'Variant',
  'Model',
  'Duration',
  'Input tok',
  'Output tok',
  'Cost',
  'Tool calls',
  'Diff (+/-)',
]

function buildRow(result) {
  if (result.error) {
    return [result.label, result.model ?? 'n/a', 'FAILED', result.error, '', '', '', '']
  }
  const m = result.metrics ?? {}
  const d = result.diffStats ?? {}

  const duration = m.durationMs !== null ? `${Math.round(m.durationMs / 1000)}s` : 'n/a'
  const inputTok = m.inputTokens !== null ? m.inputTokens.toLocaleString() : 'n/a'
  const outputTok = m.outputTokens !== null ? m.outputTokens.toLocaleString() : 'n/a'
  const cost = m.totalCostUsd !== null ? `$${m.totalCostUsd.toFixed(2)}` : 'n/a'
  const tools = formatToolCalls(m.toolCalls ?? {})
  const diff = d.insertions !== null ? `+${d.insertions}/-${d.deletions}` : 'n/a'

  return [result.label, result.model ?? 'n/a', duration, inputTok, outputTok, cost, tools, diff]
}

function formatToolCalls(toolCalls) {
  const entries = Object.entries(toolCalls)
  if (entries.length === 0) return 'none'
  return entries.map(([name, count]) => `${name}:${count}`).join(' ')
}

function computeColWidths(rows) {
  return COLUMNS.map((header, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0)
    return Math.max(header.length, maxData)
  })
}

function formatHeader(widths) {
  return COLUMNS.map((col, i) => col.padEnd(widths[i])).join(' | ')
}

function formatSeparator(widths) {
  return widths.map((w) => '-'.repeat(w)).join('-+-')
}

function formatRow(row, widths) {
  return row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join(' | ')
}

function buildJsonData(reportData) {
  const { prompt, baseCommit, timestamp, variants } = reportData
  const variantData = {}
  for (const [key, result] of Object.entries(variants)) {
    variantData[key] = {
      label: result.label,
      model: result.model ?? null,
      error: result.error ?? null,
      metrics: result.metrics ?? null,
      diffStats: result.diffStats
        ? {
            commits: result.diffStats.commits,
            insertions: result.diffStats.insertions,
            deletions: result.diffStats.deletions,
            diffStat: result.diffStats.diffStat,
          }
        : null,
      exitCode: result.exitCode ?? null,
    }
  }
  return { prompt, baseCommit, timestamp, variants: variantData }
}
