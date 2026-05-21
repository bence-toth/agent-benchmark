import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createStatusBoard } from '../lib/runner.js'

function makeFakeOut(isTTY, columns = 80) {
  const chunks = []
  return {
    isTTY,
    columns,
    write(s) { chunks.push(s) },
    output() { return chunks.join('') },
    chunks,
  }
}

describe('createStatusBoard', () => {
  describe('non-TTY mode', () => {
    it('emits one line per set() call', () => {
      const out = makeFakeOut(false)
      const board = createStatusBoard(['A', 'B'], out)

      board.set('A', 'starting...')
      board.set('B', 'starting...')
      board.set('A', 'running... 5s')

      assert.deepEqual(out.chunks, [
        '[A] starting...\n',
        '[B] starting...\n',
        '[A] running... 5s\n',
      ])
    })

    it('done() is a no-op in non-TTY mode', () => {
      const out = makeFakeOut(false)
      const board = createStatusBoard(['A'], out)
      board.set('A', 'done (10s)')
      const countBefore = out.chunks.length
      board.done()
      assert.equal(out.chunks.length, countBefore)
    })
  })

  describe('TTY mode', () => {
    it('draws all labels on first set()', () => {
      const out = makeFakeOut(true, 40)
      const board = createStatusBoard(['Alpha', 'Beta'], out)

      board.set('Alpha', 'starting...')

      const output = out.output()
      assert.ok(output.includes('[Alpha] starting...'))
      assert.ok(output.includes('[Beta] waiting...'))
      assert.ok(!output.includes('\x1b['), 'no cursor-up on first draw')
    })

    it('emits cursor-up before redraw on subsequent set() calls', () => {
      const out = makeFakeOut(true, 40)
      const board = createStatusBoard(['A', 'B'], out)

      board.set('A', 'starting...')
      out.chunks.length = 0  // clear first draw

      board.set('B', 'starting...')

      const output = out.output()
      assert.ok(output.startsWith('\x1b[2A'), 'cursor moves up by label count')
      assert.ok(output.includes('[A] starting...'))
      assert.ok(output.includes('[B] starting...'))
    })

    it('only the updated label changes between redraws', () => {
      const out = makeFakeOut(true, 40)
      const board = createStatusBoard(['X', 'Y', 'Z'], out)

      board.set('X', 'starting...')
      board.set('Y', 'starting...')
      out.chunks.length = 0

      board.set('X', 'done (3s)')

      const output = out.output()
      assert.ok(output.includes('[X] done (3s)'))
      assert.ok(output.includes('[Y] starting...'))
      assert.ok(output.includes('[Z] waiting...'))
    })

    it('done() redraws without trailing padding', () => {
      const out = makeFakeOut(true, 40)
      const board = createStatusBoard(['A', 'B'], out)

      board.set('A', 'done (1s)')
      board.set('B', 'done (2s)')
      out.chunks.length = 0

      board.done()

      const output = out.output()
      // Lines should not be padded to column width in the final render
      const lines = output.split('\n').filter(Boolean)
      for (const line of lines) {
        assert.ok(line.trimEnd() === line, `line should not have trailing spaces: "${line}"`)
      }
    })
  })
})

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
