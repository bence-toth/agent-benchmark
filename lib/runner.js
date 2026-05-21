import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { createInterface as createRlInterface } from 'readline'
import {
  createWorktree,
  applyConfigOverlay,
  removeWorktree,
  getBaseCommit,
  getDiffStats,
  commitChanges,
  branchName,
} from './worktree.js'
import { createCollector, parseMetrics, parseStreamLine } from './metrics.js'
import { generateReport, writeResultFiles } from './report.js'

export async function runBenchmark(config, opts) {
  const { id, prompt, maxBudgetUsd, repo, variants } = config
  const variantKeys = Object.keys(variants)

  if (opts.dryRun) {
    printDryRun(config, variantKeys)
    return
  }

  if (!opts.yes) {
    await confirmDangerousRun(variantKeys)
  }

  const baseCommit = await getBaseCommit(repo)
  console.log(`\nBase commit: ${baseCommit.slice(0, 7)}`)
  console.log(`Running ${variantKeys.length} variants in parallel...\n`)

  // Create all worktrees first
  const worktrees = {}
  const overlayCommits = {}
  for (const key of variantKeys) {
    const variant = variants[key]
    const wtPath = await createWorktree(repo, id, key)
    if (Object.keys(variant.configFiles).length > 0) {
      overlayCommits[key] = await applyConfigOverlay(wtPath, variant.configFiles)
    }
    worktrees[key] = wtPath
  }

  const concurrency = opts.concurrency ?? variantKeys.length
  const results = {}
  const queue = [...variantKeys]

  const board = createStatusBoard(variantKeys.map((k) => variants[k].label))

  async function runVariant(key) {
    const wtPath = worktrees[key]
    const variant = variants[key]
    const label = variant.label
    const model = variant.model
    const startTime = Date.now()

    board.set(label, 'starting...')

    const tickInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      board.set(label, `running... ${elapsed}s`)
    }, 1000)

    let runResult
    try {
      runResult = await spawnClaude(wtPath, prompt, model, maxBudgetUsd)
    } catch (err) {
      clearInterval(tickInterval)
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      board.set(label, `failed (${elapsed}s): ${err.message}`)
      results[key] = {
        label,
        model,
        branch: branchName(id, key),
        error: err.message,
        durationMs: Date.now() - startTime,
      }
      return
    }

    clearInterval(tickInterval)
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    board.set(label, `done (${elapsed}s)`)

    // Commit any workspace changes before calculating diffs
    await commitChanges(wtPath, overlayCommits[key])

    const metrics = parseMetrics(runResult.events)
    const diffStats = await getDiffStats(wtPath, baseCommit)

    results[key] = {
      label,
      model,
      branch: branchName(id, key),
      metrics,
      diffStats,
      events: runResult.events,
      exitCode: runResult.exitCode,
    }
  }

  // Run with concurrency limit
  const running = new Set()
  await new Promise((resolve) => {
    function startNext() {
      while (running.size < concurrency && queue.length > 0) {
        const key = queue.shift()
        const p = runVariant(key).finally(() => {
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const orderedResults = Object.fromEntries(variantKeys.map((k) => [k, results[k]]))
  const reportData = { prompt, baseCommit, timestamp, variants: orderedResults }

  generateReport(reportData)
  await writeResultFiles(reportData)

  for (const key of variantKeys) {
    try {
      await removeWorktree(repo, key)
    } catch {
      // ignore cleanup failures
    }
  }

  return timestamp
}

async function spawnClaude(cwd, prompt, model, maxBudgetUsd) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      prompt,
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
    const collector = createCollector()
    const stderrLines = []

    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const event = parseStreamLine(line)
      if (event) collector.push(event)
    })

    const errRl = createRlInterface({ input: proc.stderr })
    errRl.on('line', (line) => stderrLines.push(line))

    proc.on('close', (code) => {
      if (code !== 0 && collector.getEvents().length === 0) {
        reject(new Error(`claude exited with code ${code}: ${stderrLines.join(' ')}`.trim()))
      } else {
        resolve({ events: collector.getEvents(), exitCode: code })
      }
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

export function createStatusBoard(labels, out = process.stdout) {
  const statuses = new Map(labels.map((l) => [l, 'waiting...']))
  const isTTY = out.isTTY
  let drawn = false

  function renderTTY() {
    const lines = labels.map((l) => `[${l}] ${statuses.get(l)}`)
    if (drawn) out.write(`\x1b[${lines.length}A`)
    out.write(lines.map((l) => l.padEnd(out.columns ?? 80)).join('\n') + '\n')
    drawn = true
  }

  return {
    set(label, status) {
      statuses.set(label, status)
      if (isTTY) {
        renderTTY()
      } else {
        out.write(`[${label}] ${status}\n`)
      }
    },
    done() {
      if (!isTTY) return
      const lines = labels.map((l) => `[${l}] ${statuses.get(l)}`)
      if (drawn) out.write(`\x1b[${lines.length}A`)
      out.write(lines.join('\n') + '\n')
    },
  }
}

function printDryRun(config, variantKeys) {
  console.log('Dry run – no processes will be spawned.\n')
  console.log(`Prompt:  ${config.prompt}`)
  console.log(`Budget:  $${config.maxBudgetUsd} per variant`)
  console.log(`Repo:    ${config.repo}`)
  console.log(`\nVariants (${variantKeys.length}):`)
  for (const key of variantKeys) {
    const v = config.variants[key]
    const files = Object.keys(v.configFiles)
    const model = v.model !== config.model ? ` (model: ${v.model})` : ''
    console.log(`  ${v.label}: ${files.length === 0 ? 'repo as-is' : files.join(', ')}${model}`)
  }
}

async function confirmDangerousRun(variantKeys) {
  console.log('\nWARNING: This will run Claude Code with --dangerously-skip-permissions.')
  console.log('Claude will have full filesystem and shell access with no confirmation prompts.')
  console.log(`Variants to run: ${variantKeys.join(', ')}`)

  const rl = createRlInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question('\nProceed? [y/N] ', resolve)
  })
  rl.close()

  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Aborted.')
    process.exit(0)
  }
}
