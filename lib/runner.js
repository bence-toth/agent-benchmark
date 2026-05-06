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
} from './worktree.js'
import { createCollector, parseMetrics, parseStreamLine } from './metrics.js'
import { generateReport, writeResultFiles } from './report.js'

export async function runBenchmark(config, opts) {
  const { prompt, maxBudgetUsd, repo, variants } = config
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
  for (const key of variantKeys) {
    const variant = variants[key]
    const wtPath = await createWorktree(repo, key)
    if (Object.keys(variant.configFiles).length > 0) {
      await applyConfigOverlay(wtPath, variant.configFiles)
    }
    worktrees[key] = wtPath
  }

  const concurrency = opts.concurrency ?? variantKeys.length
  const results = {}
  const queue = [...variantKeys]

  async function runVariant(key) {
    const wtPath = worktrees[key]
    const variant = variants[key]
    const label = variant.label
    const model = variant.model
    const startTime = Date.now()

    process.stdout.write(`[${label}] starting...\n`)

    const tickInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      process.stdout.write(`[${label}] running... ${elapsed}s\r`)
    }, 1000)

    let runResult
    try {
      runResult = await spawnClaude(wtPath, prompt, model, maxBudgetUsd)
    } catch (err) {
      clearInterval(tickInterval)
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      process.stdout.write(`[${label}] failed (${elapsed}s): ${err.message}\n`)
      results[key] = { label, model, error: err.message, durationMs: Date.now() - startTime }
      return
    }

    clearInterval(tickInterval)
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    process.stdout.write(`[${label}] done (${elapsed}s)          \n`)

    // Commit any workspace changes before calculating diffs
    await commitChanges(wtPath)

    const metrics = parseMetrics(runResult.events)
    const diffStats = await getDiffStats(wtPath, baseCommit)

    results[key] = {
      label,
      model,
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportData = { prompt, baseCommit, timestamp, variants: results }

  generateReport(reportData)
  await writeResultFiles(reportData)

  if (!opts.noCleanup) {
    await promptCleanup(repo, variantKeys)
  }
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
        reject(new Error('claude CLI not found -- install Claude Code first'))
      } else {
        reject(err)
      }
    })
  })
}

async function promptCleanup(repo, variantKeys) {
  const rl = createRlInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question('\nRemove worktrees and branches? [Y/n] ', resolve)
  })
  rl.close()

  if (answer.trim().toLowerCase() !== 'n') {
    for (const key of variantKeys) {
      await removeWorktree(repo, key)
    }
    console.log('Worktrees cleaned up.')
  } else {
    console.log('Worktrees kept. Run `git worktree list` to inspect.')
  }
}

function printDryRun(config, variantKeys) {
  console.log('Dry run -- no processes will be spawned.\n')
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
