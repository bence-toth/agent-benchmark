import { spawn, execFile } from 'child_process'
import { createInterface } from 'readline'
import { promisify } from 'util'
import { worktreePath, branchName, removeWorktree, discardChanges } from './worktree.js'
import { parseStreamLine } from './metrics.js'
import { buildReviewPrompt } from './review-prompt.js'

const execFileAsync = promisify(execFile)

// Creates a worktree checked out at an existing branch (not creating a new one).
async function checkoutWorktree(repo, reviewKey, branch) {
  const wtPath = worktreePath(repo, reviewKey)
  await execFileAsync('git', ['-C', repo, 'worktree', 'add', wtPath, branch])
  return wtPath
}

export async function runReview(config, resultSet, opts) {
  const { prompt, repo, variants, review } = config
  const { axes, model, maxBudgetUsd } = review
  const variantKeys = Object.keys(variants).filter((k) => !resultSet.variants[k]?.error)

  if (opts.dryRun) {
    printDryRun(config, resultSet, variantKeys, axes)
    return null
  }

  const concurrency = opts.concurrency ?? variantKeys.length
  const reviewPrompt = buildReviewPrompt(prompt, axes)
  const scores = {}

  const worktrees = {}
  for (const key of variantKeys) {
    const branch = branchName(key)
    const wtPath = await checkoutWorktree(repo, `review-${key}`, branch)
    worktrees[key] = wtPath
  }

  const queue = [...variantKeys]

  async function reviewVariant(key) {
    const wtPath = worktrees[key]
    const label = variants[key].label
    process.stdout.write(`[${label}] reviewing...\n`)

    let result
    try {
      result = await spawnReviewSession(wtPath, reviewPrompt, model, maxBudgetUsd)
    } catch (err) {
      process.stdout.write(`[${label}] review failed: ${err.message}\n`)
      scores[key] = { label, error: err.message, scores: null, aggregates: null }
      return
    }

    const parsed = parseReviewOutput(result.text)
    if (!parsed) {
      process.stdout.write(`[${label}] review failed: could not parse JSON response\n`)
      scores[key] = {
        label,
        error: 'could not parse JSON response',
        rawOutput: result.text,
        scores: null,
        aggregates: null,
      }
      return
    }

    const aggregates = computeAggregates(parsed)
    process.stdout.write(`[${label}] done\n`)
    scores[key] = { label, scores: parsed, aggregates }
  }

  const running = new Set()
  await new Promise((resolve) => {
    function startNext() {
      while (running.size < concurrency && queue.length > 0) {
        const key = queue.shift()
        const p = reviewVariant(key).finally(() => {
          running.delete(p)
          startNext()
          if (running.size === 0 && queue.length === 0) resolve()
        })
        running.add(p)
      }
    }
    startNext()
  })

  for (const key of variantKeys) {
    try {
      // Discard any unexpected local changes before removing the worktree
      const wtPath = worktrees[key]
      await discardChanges(wtPath)
      await removeWorktree(repo, `review-${key}`)
    } catch {
      // ignore cleanup failures
    }
  }

  return scores
}

async function spawnReviewSession(cwd, reviewPrompt, model, maxBudgetUsd) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      reviewPrompt,
      '--dangerously-skip-permissions',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      model,
      '--max-budget-usd',
      String(maxBudgetUsd),
      '--no-session-persistence',
    ]

    const proc = spawn('claude', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const events = []
    const stderrLines = []

    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const event = parseStreamLine(line)
      if (event) events.push(event)
    })

    const errRl = createInterface({ input: proc.stderr })
    errRl.on('line', (line) => stderrLines.push(line))

    proc.on('close', (code) => {
      if (code !== 0 && events.length === 0) {
        reject(new Error(`claude exited with code ${code}: ${stderrLines.join(' ')}`.trim()))
        return
      }
      const text = extractFinalText(events)
      resolve({ events, text })
    })

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('claude CLI not found -- install Claude Code first'))
      } else {
        reject(err)
      }
    })
  })
}

function extractFinalText(events) {
  const resultEvent = events.findLast((e) => e.type === 'result')
  if (resultEvent?.result) return resultEvent.result

  // Fall back to last assistant message text block
  const assistantEvents = events.filter((e) => e.type === 'assistant')
  for (let i = assistantEvents.length - 1; i >= 0; i--) {
    const content = assistantEvents[i].message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type === 'text' && block.text) return block.text
    }
  }
  return ''
}

export function parseReviewOutput(text) {
  if (!text) return null

  // Strip optional markdown code fences
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  let obj
  try {
    obj = JSON.parse(stripped)
  } catch {
    return null
  }

  if (!obj || typeof obj !== 'object' || typeof obj.scores !== 'object') return null

  const scores = {}
  for (const [axis, entry] of Object.entries(obj.scores)) {
    if (!entry || typeof entry !== 'object') continue
    const score = entry.score === null ? null : typeof entry.score === 'number' ? entry.score : null
    const rationale = typeof entry.rationale === 'string' ? entry.rationale : ''
    scores[axis] = { score, rationale }
  }

  return scores
}

export function computeAggregates(scores) {
  const values = Object.values(scores)
    .map((s) => s.score)
    .filter((v) => v !== null && typeof v === 'number')

  if (values.length === 0) return { min: null, max: null, avg: null, median: null }

  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
      : sorted[mid]

  return { min, max, avg, median }
}

function printDryRun(config, resultSet, variantKeys, axes) {
  console.log('Dry run -- no processes will be spawned.\n')
  console.log(`Prompt:  ${config.prompt}`)
  console.log(`Budget:  $${config.review.maxBudgetUsd} per review session`)
  console.log(`Model:   ${config.review.model}`)
  console.log(`Axes:    ${axes.map((a) => a.name).join(', ')}`)
  console.log(`\nVariants to review (${variantKeys.length}):`)
  for (const key of variantKeys) {
    console.log(`  ${config.variants[key].label}`)
  }
  const skipped = Object.keys(config.variants).filter((k) => resultSet.variants[k]?.error)
  if (skipped.length > 0) {
    console.log(`\nSkipped (errored during run):`)
    for (const key of skipped) {
      console.log(`  ${config.variants[key].label}: ${resultSet.variants[key].error}`)
    }
  }
}
