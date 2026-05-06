import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('runner', () => {
  describe('runBenchmark dry-run', () => {
    it('prints dry-run info without spawning processes', async () => {
      const { runBenchmark } = await import('../lib/runner.js')

      const config = {
        prompt: 'Fix the bug',
        maxBudgetUsd: 10,
        repo: '/repo',
        model: 'claude-opus-4-7',
        variants: {
          baseline: {
            label: 'Baseline',
            model: 'claude-opus-4-7',
            configFiles: {},
          },
          variant_a: {
            label: 'Variant A',
            model: 'claude-sonnet-4-6',
            configFiles: { '.claude.json': '/config/variant-a.json' },
          },
        },
      }

      const lines = []
      const orig = console.log
      console.log = (...args) => lines.push(args.join(' '))

      await runBenchmark(config, { dryRun: true })

      console.log = orig

      const output = lines.join('\n')
      assert.ok(output.includes('Dry run'))
      assert.ok(output.includes('Fix the bug'))
      assert.ok(output.includes('$10'))
      assert.ok(output.includes('/repo'))
      assert.ok(output.includes('Baseline'))
      assert.ok(output.includes('Variant A'))
    })

    it('shows variant config files in dry-run', async () => {
      const { runBenchmark } = await import('../lib/runner.js')

      const config = {
        prompt: 'Test',
        maxBudgetUsd: 5,
        repo: '/repo',
        model: 'claude-opus-4-7',
        variants: {
          v1: {
            label: 'V1',
            model: 'claude-opus-4-7',
            configFiles: {
              '.claude.json': '/configs/file1.json',
              'settings.yaml': '/configs/settings.yaml',
            },
          },
        },
      }

      const lines = []
      const orig = console.log
      console.log = (...args) => lines.push(args.join(' '))

      await runBenchmark(config, { dryRun: true })

      console.log = orig

      const output = lines.join('\n')
      assert.ok(output.includes('.claude.json'))
      assert.ok(output.includes('settings.yaml'))
    })

    it('indicates repo-as-is for variants with no config', async () => {
      const { runBenchmark } = await import('../lib/runner.js')

      const config = {
        prompt: 'Test',
        maxBudgetUsd: 5,
        repo: '/repo',
        model: 'claude-opus-4-7',
        variants: {
          baseline: {
            label: 'Baseline',
            model: 'claude-opus-4-7',
            configFiles: {},
          },
        },
      }

      const lines = []
      const orig = console.log
      console.log = (...args) => lines.push(args.join(' '))

      await runBenchmark(config, { dryRun: true })

      console.log = orig

      const output = lines.join('\n')
      assert.ok(output.includes('repo as-is'))
    })
  })
})
