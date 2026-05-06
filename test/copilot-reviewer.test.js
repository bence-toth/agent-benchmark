import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('copilot-reviewer', () => {
  describe('runCopilotReview dry-run', () => {
    it('prints dry-run info without executing commands', async () => {
      const { runCopilotReview } = await import('../lib/copilot-reviewer.js')

      const config = {
        prompt: 'Fix the bug',
        repo: '/repo',
        variants: {
          baseline: { label: 'Baseline', model: 'claude-opus-4-7' },
          variant_a: { label: 'Variant A', model: 'claude-opus-4-7' },
        },
        prBaseBranch: 'main',
      }

      const resultSet = {
        baseCommit: 'abc1234',
        timestamp: '2026-05-01T00-00-00Z',
        variants: {
          baseline: { error: null },
          variant_a: { error: null },
        },
      }

      const lines = []
      const orig = console.log
      console.log = (...args) => lines.push(args.join(' '))

      await runCopilotReview(config, resultSet, { dryRun: true })

      console.log = orig

      const output = lines.join('\n')
      assert.ok(output.includes('Dry run'))
      assert.ok(output.includes('Baseline'))
      assert.ok(output.includes('Variant A'))
    })
  })

  describe('runCopilotReview filters errored variants', () => {
    it('skips variants with errors in resultSet', async () => {
      const { runCopilotReview } = await import('../lib/copilot-reviewer.js')

      const config = {
        prompt: 'Fix the bug',
        repo: '/repo',
        variants: {
          baseline: { label: 'Baseline', model: 'claude-opus-4-7' },
          variant_a: { label: 'Variant A', model: 'claude-opus-4-7' },
        },
        prBaseBranch: 'main',
      }

      const resultSet = {
        baseCommit: 'abc1234',
        timestamp: '2026-05-01T00-00-00Z',
        variants: {
          baseline: { error: null },
          variant_a: { error: 'timeout' },
        },
      }

      const lines = []
      const orig = console.log
      console.log = (...args) => lines.push(args.join(' '))

      await runCopilotReview(config, resultSet, { dryRun: true })

      console.log = orig

      const output = lines.join('\n')
      assert.ok(output.includes('Baseline'))
      assert.ok(output.includes('Skipped'))
    })
  })
})
