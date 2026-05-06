import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Swap process.cwd so writeResultFiles uses a temp directory
let tmpDir
let originalCwd

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-'))
  originalCwd = process.cwd
  process.cwd = () => tmpDir
})

after(async () => {
  process.cwd = originalCwd
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// Dynamic import so process.cwd override is in effect
async function importReport() {
  const { writeResultFiles, listResults, showResult } = await import('../lib/report.js')
  return { writeResultFiles, listResults, showResult }
}

const sampleReport = {
  prompt: 'Fix the bug',
  model: 'opusplan',
  baseCommit: 'abc1234',
  timestamp: '2026-05-01T00-00-00-000Z',
  variants: {
    baseline: {
      label: 'A – Baseline',
      metrics: {
        durationMs: 30000,
        inputTokens: 1000,
        outputTokens: 200,
        totalCostUsd: 0.3,
        numTurns: 2,
        toolCalls: { Bash: 2, Edit: 1 },
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      diffStats: {
        commits: ['abc fix'],
        insertions: 10,
        deletions: 5,
        diffStat: '1 file changed',
        patch: 'diff --git a/foo b/foo',
      },
      events: [{ type: 'result' }],
    },
    variant_b: {
      label: 'B – Variant',
      error: 'budget exceeded',
    },
  },
}

describe('writeResultFiles', () => {
  it('writes results.json, results.md, events.jsonl, and diff.patch', async () => {
    const { writeResultFiles } = await importReport()
    await writeResultFiles(sampleReport, { baseline: '/wt/baseline', variant_b: '/wt/b' })

    const dir = path.join(tmpDir, '.agent-benchmark-results', sampleReport.timestamp)
    const json = JSON.parse(await fs.readFile(path.join(dir, 'results.json'), 'utf8'))
    assert.equal(json.prompt, 'Fix the bug')
    assert.ok(json.variants.baseline.metrics)
    assert.equal(json.variants.variant_b.error, 'budget exceeded')

    const md = await fs.readFile(path.join(dir, 'results.md'), 'utf8')
    assert.ok(md.includes('Fix the bug'))

    const events = await fs.readFile(path.join(dir, 'baseline', 'events.jsonl'), 'utf8')
    assert.ok(events.includes('"result"'))

    const patch = await fs.readFile(path.join(dir, 'baseline', 'diff.patch'), 'utf8')
    assert.ok(patch.includes('diff --git'))
  })
})

describe('listResults', () => {
  it('prints nothing-found when results directory does not exist', async () => {
    // Point cwd at a fresh empty dir with no .agent-benchmark-results inside
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-empty-'))
    const saved = process.cwd
    process.cwd = () => emptyDir
    try {
      const { listResults } = await import('../lib/report.js?empty')
      const lines = []
      const orig = console.log
      console.log = (...a) => lines.push(a.join(' '))
      await listResults()
      console.log = orig
      assert.ok(lines.some((l) => l.includes('No results')))
    } finally {
      process.cwd = saved
      await fs.rm(emptyDir, { recursive: true, force: true })
    }
  })
})
