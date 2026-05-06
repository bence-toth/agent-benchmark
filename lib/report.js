import fs from 'fs/promises'
import path from 'path'
import { normalizedCost } from './pricing.js'

const RESULTS_DIR = '.agent-benchmark-results'

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
    throw new Error('No results found. Run `agent-benchmark run` first.')
  }
  const sorted = entries.filter(Boolean).sort()
  if (sorted.length === 0) throw new Error('No results found. Run `agent-benchmark run` first.')
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

  const entries = Object.entries(variants)
  const labels = entries.map(([, r]) => r.label)
  const columns = buildColumns(entries)

  const labelWidth = Math.max('Metric'.length, ...ROW_LABELS.map((l) => l.length))
  const colWidths = labels.map((label, i) =>
    Math.max(label.length, ...columns[i].map((v) => v.length)),
  )

  const header = ['Metric'.padEnd(labelWidth), ...labels.map((l, i) => l.padEnd(colWidths[i]))]
  lines.push(header.join(' | '))
  lines.push([labelWidth, ...colWidths].map((w) => '-'.repeat(w)).join('-+-'))

  for (let r = 0; r < ROW_LABELS.length; r++) {
    const cells = [
      ROW_LABELS[r].padEnd(labelWidth),
      ...columns.map((col, i) => col[r].padEnd(colWidths[i])),
    ]
    lines.push(cells.join(' | '))
  }

  lines.push('')
  lines.push('Note: input tokens include cache creation and cache read tokens.')
  lines.push(
    'Normalized cost removes cache pricing variance (as if all input tokens were billed at the standard rate).',
  )
  return lines
}

const ROW_LABELS = [
  'Model',
  'Duration',
  'Input tokens',
  'Output tokens',
  'Cache write tokens',
  'Cache read tokens',
  'Cost',
  'Normalized cost',
  'Tool calls',
  'Diff (+/-)',
]

function buildColumns(entries) {
  return entries.map(([, result]) => buildColumn(result))
}

function buildColumn(result) {
  if (result.error) {
    return ['n/a', 'FAILED', result.error, '', '', '', '', '', '', '']
  }
  const m = result.metrics ?? {}
  const d = result.diffStats ?? {}

  const model = result.model ?? 'n/a'
  const duration = m.durationMs !== null ? `${Math.round(m.durationMs / 1000)}s` : 'n/a'
  const inputTok = m.inputTokens !== null ? m.inputTokens.toLocaleString() : 'n/a'
  const outputTok = m.outputTokens !== null ? m.outputTokens.toLocaleString() : 'n/a'
  const cacheWrite = (m.cacheCreationTokens ?? 0).toLocaleString()
  const cacheRead = (m.cacheReadTokens ?? 0).toLocaleString()
  const cost = m.totalCostUsd !== null ? `$${m.totalCostUsd.toFixed(2)}` : 'n/a'
  const norm = normalizedCost(m)
  const normStr = norm !== null ? `$${norm.toFixed(2)}` : 'n/a'
  const tools = formatToolCalls(m.toolCalls ?? {})
  const diff = d.insertions !== null ? `+${d.insertions}/-${d.deletions}` : 'n/a'

  return [model, duration, inputTok, outputTok, cacheWrite, cacheRead, cost, normStr, tools, diff]
}

function formatToolCalls(toolCalls) {
  const entries = Object.entries(toolCalls)
  if (entries.length === 0) return 'none'
  return entries.map(([name, count]) => `${name}:${count}`).join(' ')
}

function buildJsonData(reportData) {
  const { prompt, baseCommit, timestamp, variants } = reportData
  const variantData = {}
  for (const [key, result] of Object.entries(variants)) {
    const metrics = result.metrics ?? null
    variantData[key] = {
      label: result.label,
      model: result.model ?? null,
      error: result.error ?? null,
      metrics: metrics ? { ...metrics, normalizedCostUsd: normalizedCost(metrics) } : null,
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
