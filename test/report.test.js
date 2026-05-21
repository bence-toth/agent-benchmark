import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import * as reportModule from '../lib/report.js'

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
  let tmpDir
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-write-'))
    process.cwd = () => tmpDir
  })
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('writes results.json, results.md, events.jsonl, and diff.patch', async () => {
    await reportModule.writeResultFiles(sampleReport, {
      baseline: '/wt/baseline',
      variant_b: '/wt/b',
    })

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
  let tmpDir
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-list-'))
    process.cwd = () => tmpDir
  })
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('prints nothing-found when results directory does not exist', async () => {
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    await reportModule.listResults()
    console.log = orig
    assert.ok(lines.some((l) => l.includes('No results')))
  })

  it('prints nothing-found when results directory is empty', async () => {
    await fs.mkdir(path.join(tmpDir, '.agent-benchmark-results'))
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    await reportModule.listResults()
    console.log = orig
    assert.ok(lines.some((l) => l.includes('No results')))
  })

  it('lists existing result timestamps in reverse order', async () => {
    const resultsDir = path.join(tmpDir, '.agent-benchmark-results')
    await fs.mkdir(path.join(resultsDir, '2026-01-01T00-00-00Z'), { recursive: true })
    await fs.mkdir(path.join(resultsDir, '2026-02-01T00-00-00Z'), { recursive: true })
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    await reportModule.listResults()
    console.log = orig
    const output = lines.join('\n')
    assert.ok(output.includes('2026-01-01T00-00-00Z'))
    assert.ok(output.includes('2026-02-01T00-00-00Z'))
    const idx1 = output.indexOf('2026-02-01T00-00-00Z')
    const idx2 = output.indexOf('2026-01-01T00-00-00Z')
    assert.ok(idx1 < idx2)
  })
})

describe('generateReport', () => {
  it('prints benchmark report to stdout', () => {
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    reportModule.generateReport(sampleReport)
    console.log = orig
    const output = lines.join('\n')
    assert.ok(output.includes('Fix the bug'))
    assert.ok(output.includes('abc1234'.slice(0, 7)))
    assert.ok(output.includes('A – Baseline'))
  })

  it('shows FAILED for errored variant', () => {
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    reportModule.generateReport(sampleReport)
    console.log = orig
    assert.ok(lines.join('\n').includes('FAILED'))
  })

  it('falls back to variant key when label is absent in branch listing', () => {
    const reportWithBranch = {
      ...sampleReport,
      variants: {
        baseline: {
          ...sampleReport.variants.baseline,
          branch: 'agent-benchmark/abc/baseline',
        },
        variant_b: {
          label: 'B – Variant',
          branch: 'agent-benchmark/abc/variant_b',
          error: null,
          metrics: sampleReport.variants.baseline.metrics,
          diffStats: sampleReport.variants.baseline.diffStats,
          events: [],
        },
      },
    }
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    reportModule.generateReport(reportWithBranch)
    console.log = orig
    const output = lines.join('\n')
    assert.ok(output.includes('agent-benchmark/abc/baseline'))
    assert.ok(output.includes('agent-benchmark/abc/variant_b'))
  })
})

describe('resolveTimestamp', () => {
  let tmpDir
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-ts-'))
    process.cwd = () => tmpDir
    // Pre-create the timestamp dir used in tests below
    await fs.mkdir(path.join(tmpDir, '.agent-benchmark-results', '2026-05-01T00-00-00-000Z'), {
      recursive: true,
    })
  })
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns the given timestamp if it exists', async () => {
    const result = await reportModule.resolveTimestamp('2026-05-01T00-00-00-000Z')
    assert.equal(result, '2026-05-01T00-00-00-000Z')
  })

  it('throws if given timestamp does not exist', async () => {
    await assert.rejects(() => reportModule.resolveTimestamp('9999-nonexistent'), /No result found/)
  })

  it('returns latest timestamp when none specified', async () => {
    const result = await reportModule.resolveTimestamp(null)
    assert.equal(result, '2026-05-01T00-00-00-000Z')
  })

  it('throws when no results exist and no timestamp given', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-ts-empty-'))
    const savedCwd = process.cwd
    process.cwd = () => emptyDir
    try {
      await assert.rejects(() => reportModule.resolveTimestamp(null), /No results found/)
    } finally {
      process.cwd = savedCwd
      await fs.rm(emptyDir, { recursive: true, force: true })
    }
  })
})

describe('loadResultSet', () => {
  let tmpDir
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-load-'))
    process.cwd = () => tmpDir
    const dir = path.join(tmpDir, '.agent-benchmark-results', '2026-05-01T00-00-00-000Z')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'results.json'),
      JSON.stringify({ prompt: 'Fix the bug', variants: {} }),
    )
  })
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns parsed results.json', async () => {
    const result = await reportModule.loadResultSet('2026-05-01T00-00-00-000Z')
    assert.equal(result.prompt, 'Fix the bug')
  })

  it('throws when results.json does not exist', async () => {
    await assert.rejects(
      () => reportModule.loadResultSet('nonexistent-timestamp'),
      /Cannot read results.json/,
    )
  })
})

describe('showResult', () => {
  let tmpDir
  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-report-show-'))
    process.cwd = () => tmpDir
    const dir = path.join(tmpDir, '.agent-benchmark-results', '2026-05-01T00-00-00-000Z')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'results.md'), 'Fix the bug\n')
  })
  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('prints results.md content', async () => {
    const lines = []
    const orig = console.log
    console.log = (...a) => lines.push(a.join(' '))
    await reportModule.showResult('2026-05-01T00-00-00-000Z')
    console.log = orig
    assert.ok(lines.join('\n').includes('Fix the bug'))
  })

  it('throws when results.md does not exist', async () => {
    await assert.rejects(() => reportModule.showResult('nonexistent-timestamp'), /No result found/)
  })
})
