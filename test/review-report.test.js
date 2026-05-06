import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

let tmpDir
let originalCwd

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-review-report-'))
  originalCwd = process.cwd
  process.cwd = () => tmpDir
})

after(async () => {
  process.cwd = originalCwd
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function importReviewReport() {
  const { printReviewReport, writeReviewFiles } = await import('../lib/review-report.js')
  return { printReviewReport, writeReviewFiles }
}

describe('printReviewReport', () => {
  it('prints review report with scores', async () => {
    const { printReviewReport } = await importReviewReport()

    const axes = [{ name: 'correctness' }, { name: 'efficiency' }]
    const variantScores = {
      baseline: {
        label: 'Baseline',
        scores: {
          correctness: { score: 8 },
          efficiency: { score: 7 },
        },
        aggregates: { min: 7, max: 8, avg: 7.5, median: 7.5 },
      },
      variant_a: {
        label: 'Variant A',
        scores: {
          correctness: { score: 9 },
          efficiency: { score: null },
        },
        aggregates: { min: 9, max: 9, avg: 9, median: 9 },
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    await printReviewReport('2026-05-01T00-00-00Z', axes, variantScores)
    console.log = orig

    const output = lines.join('\n')
    assert.ok(output.includes('Review scores for run 2026-05-01T00-00-00Z'))
    assert.ok(output.includes('Baseline'))
    assert.ok(output.includes('Variant A'))
    assert.ok(output.includes('Aggregate scores'))
  })

  it('prints ERR for variant with error', async () => {
    const { printReviewReport } = await importReviewReport()

    const axes = [{ name: 'correctness' }]
    const variantScores = {
      failed: {
        label: 'Failed Variant',
        error: 'timeout',
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    await printReviewReport('2026-05-01T00-00-00Z', axes, variantScores)
    console.log = orig

    const output = lines.join('\n')
    assert.ok(output.includes('ERR'))
  })
})

describe('writeReviewFiles', () => {
  it('writes review.json and review.md', async () => {
    const { writeReviewFiles } = await importReviewReport()

    const axes = [{ name: 'code_quality' }, { name: 'performance' }]
    const variantScores = {
      test_variant: {
        label: 'Test Variant',
        scores: {
          code_quality: { score: 8 },
          performance: { score: 6 },
        },
        aggregates: { min: 6, max: 8, avg: 7, median: 7 },
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    await writeReviewFiles('2026-05-01T00-00-00Z', axes, variantScores)
    console.log = orig

    // Check files were created
    const resultsDir = path.join(tmpDir, '.agent-benchmark-results', '2026-05-01T00-00-00Z')
    const jsonPath = path.join(resultsDir, 'review.json')
    const mdPath = path.join(resultsDir, 'review.md')

    const json = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    assert.equal(json.timestamp, '2026-05-01T00-00-00Z')
    assert.deepEqual(json.axes, ['code_quality', 'performance'])
    assert.ok(json.variants.test_variant.scores)

    const md = await fs.readFile(mdPath, 'utf8')
    assert.ok(md.includes('Review scores for run 2026-05-01T00-00-00Z'))
    assert.ok(md.includes('Test Variant'))
  })

  it('handles variant with null scores', async () => {
    const { writeReviewFiles } = await importReviewReport()

    const axes = [{ name: 'axis1' }]
    const variantScores = {
      variant: {
        label: 'Variant',
        scores: { axis1: { score: null } },
        aggregates: { min: null, max: null, avg: null, median: null },
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    await writeReviewFiles('2026-05-01T00-00-00Z', axes, variantScores)
    console.log = orig

    const resultsDir = path.join(tmpDir, '.agent-benchmark-results', '2026-05-01T00-00-00Z')
    const json = JSON.parse(await fs.readFile(path.join(resultsDir, 'review.json'), 'utf8'))
    assert.equal(json.variants.variant.scores.axis1.score, null)
  })
})
