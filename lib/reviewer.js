import { spawn, execFile } from 'child_process'
import { createInterface } from 'readline'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import { worktreePath, branchName, removeWorktree, discardChanges } from './worktree.js'
import { parseStreamLine } from './metrics.js'
import { buildReviewPrompt } from './review-prompt.js'
import { createStatusBoard } from './runner.js'

const execFileAsync = promisify(execFile)

// Creates a worktree checked out at an existing branch (not creating a new one).
async function checkoutWorktree(repo, reviewKey, branch) {
  const wtPath = worktreePath(repo, reviewKey)
  try {
    await execFileAsync('git', ['-C', repo, 'worktree', 'add', wtPath, branch])
  } catch (err) {
    if (err.code === 128 && err.stderr?.includes('already exists')) {
      return wtPath
    }
    const alreadyUsed =
      err.code === 128 && err.stderr?.match(/is already used by worktree at '([^']+)'/)
    if (alreadyUsed) {
      throw new Error(
        `Branch '${branch}' is already checked out at '${alreadyUsed[1]}'. ` +
          `Run \`git checkout -\` in that directory to switch branches, then retry.`,
      )
    }
    throw err
  }
  return wtPath
}

export async function runReview(config, resultSet, opts) {
  const { id, prompt, repo, variants, review } = config
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
    const branch = branchName(id, key)
    const wtPath = await checkoutWorktree(repo, `review-${key}`, branch)
    worktrees[key] = wtPath
  }

  const labels = variantKeys.map((k) => variants[k].label)
  const board = createStatusBoard(labels)
  const queue = [...variantKeys]

  async function reviewVariant(key) {
    const wtPath = worktrees[key]
    const label = variants[key].label
    board.set(label, 'reviewing...')

    try {
      await spawnReviewSession(wtPath, reviewPrompt, model, maxBudgetUsd)
    } catch (err) {
      board.set(label, `review failed: ${err.message}`)
      scores[key] = { label, error: err.message, scores: null, aggregates: null }
      return
    }

    const scoresPath = path.join(wtPath, '.review-scores.json')
    let parsed
    try {
      const content = await fs.readFile(scoresPath, 'utf8')
      const data = JSON.parse(content)
      parsed = parseReviewScores(data)
      await fs.unlink(scoresPath).catch(() => {})
    } catch (err) {
      board.set(label, `review failed: could not read scores file: ${err.message}`)
      scores[key] = {
        label,
        error: `could not read scores file: ${err.message}`,
        scores: null,
        aggregates: null,
      }
      return
    }

    if (!parsed) {
      board.set(label, 'review failed: invalid scores format')
      scores[key] = {
        label,
        error: 'invalid scores format',
        scores: null,
        aggregates: null,
      }
      return
    }

    const aggregates = computeAggregates(parsed)
    board.set(label, 'done')
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
  board.done()

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

  return Object.fromEntries(
    variantKeys.map((k) => [k, scores[k]]).filter(([, v]) => v !== undefined),
  )
}

async function spawnReviewSession(cwd, reviewPrompt, model, maxBudgetUsd) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      reviewPrompt,
      '--tools',
      'Bash,Read,Write',
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
        reject(new Error('claude CLI not found – install Claude Code first'))
      } else {
        reject(err)
      }
    })
  })
}

export function extractFinalText(events) {
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

export function parseReviewScores(scoresObj) {
  if (!scoresObj || typeof scoresObj !== 'object') return null
  if (!scoresObj.scores || typeof scoresObj.scores !== 'object' || Array.isArray(scoresObj.scores))
    return null

  const scores = {}
  for (const [axis, entry] of Object.entries(scoresObj.scores)) {
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
  console.log('Dry run – no processes will be spawned.\n')
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
