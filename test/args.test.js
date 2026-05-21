import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseInitArgs,
  parseRunArgs,
  parseReviewArgs,
  parseCopilotReviewArgs,
} from '../lib/args.js'

describe('parseInitArgs', () => {
  it('parses repo path', () => {
    const opts = parseInitArgs(['/some/repo'])
    assert.equal(opts.repoPath, '/some/repo')
    assert.equal(opts.variants, 2)
    assert.equal(opts.name, null)
  })

  it('parses --variants', () => {
    const opts = parseInitArgs(['/repo', '--variants', '4'])
    assert.equal(opts.variants, 4)
  })

  it('parses --name', () => {
    const opts = parseInitArgs(['/repo', '--name', 'my-bench'])
    assert.equal(opts.name, 'my-bench')
  })

  it('throws if no repo path', () => {
    assert.throws(() => parseInitArgs([]), /Usage/)
  })

  it('throws if --variants < 2', () => {
    assert.throws(() => parseInitArgs(['/repo', '--variants', '1']), /integer >= 2/)
  })
})

describe('parseRunArgs', () => {
  it('parses config file', () => {
    const opts = parseRunArgs(['benchmark.yaml'])
    assert.equal(opts.configFile, 'benchmark.yaml')
    assert.equal(opts.dryRun, false)
    assert.equal(opts.yes, false)
  })

  it('parses flags', () => {
    const opts = parseRunArgs(['bench.yaml', '--dry-run', '--yes'])
    assert.equal(opts.dryRun, true)
    assert.equal(opts.yes, true)
  })

  it('parses --concurrency', () => {
    const opts = parseRunArgs(['bench.yaml', '--concurrency', '2'])
    assert.equal(opts.concurrency, 2)
  })

  it('throws if no config file', () => {
    assert.throws(() => parseRunArgs([]), /Usage/)
  })

  it('throws if --concurrency < 1', () => {
    assert.throws(() => parseRunArgs(['bench.yaml', '--concurrency', '0']), /integer >= 1/)
  })
})

describe('parseReviewArgs', () => {
  it('parses config file only', () => {
    const opts = parseReviewArgs(['benchmark.yaml'])
    assert.equal(opts.configFile, 'benchmark.yaml')
    assert.equal(opts.timestamp, null)
    assert.equal(opts.dryRun, false)
    assert.equal(opts.yes, false)
    assert.equal(opts.concurrency, null)
  })

  it('parses config file and timestamp', () => {
    const opts = parseReviewArgs(['benchmark.yaml', '2026-05-01T12-00-00Z'])
    assert.equal(opts.configFile, 'benchmark.yaml')
    assert.equal(opts.timestamp, '2026-05-01T12-00-00Z')
  })

  it('parses --dry-run, --yes, --concurrency', () => {
    const opts = parseReviewArgs(['bench.yaml', '--dry-run', '--yes', '--concurrency', '3'])
    assert.equal(opts.dryRun, true)
    assert.equal(opts.yes, true)
    assert.equal(opts.concurrency, 3)
  })

  it('throws if no config file', () => {
    assert.throws(() => parseReviewArgs([]), /Usage/)
  })

  it('throws if --concurrency < 1', () => {
    assert.throws(() => parseReviewArgs(['bench.yaml', '--concurrency', '0']), /integer >= 1/)
  })
})

describe('parseCopilotReviewArgs', () => {
  it('parses config file only', () => {
    const opts = parseCopilotReviewArgs(['benchmark.yaml'])
    assert.equal(opts.configFile, 'benchmark.yaml')
    assert.equal(opts.timestamp, null)
    assert.equal(opts.dryRun, false)
    assert.equal(opts.yes, false)
    assert.equal(opts.concurrency, null)
  })

  it('parses config file and timestamp', () => {
    const opts = parseCopilotReviewArgs(['benchmark.yaml', '2026-05-01T12-00-00Z'])
    assert.equal(opts.configFile, 'benchmark.yaml')
    assert.equal(opts.timestamp, '2026-05-01T12-00-00Z')
  })

  it('parses --dry-run, --yes, --concurrency', () => {
    const opts = parseCopilotReviewArgs(['bench.yaml', '--dry-run', '--yes', '--concurrency', '2'])
    assert.equal(opts.dryRun, true)
    assert.equal(opts.yes, true)
    assert.equal(opts.concurrency, 2)
  })

  it('throws if no config file', () => {
    assert.throws(() => parseCopilotReviewArgs([]), /Usage/)
  })

  it('throws if --concurrency < 1', () => {
    assert.throws(
      () => parseCopilotReviewArgs(['bench.yaml', '--concurrency', '0']),
      /integer >= 1/,
    )
  })
})
