import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { worktreePath, branchName, applyConfigOverlay } from '../lib/worktree.js'

describe('worktree utilities', () => {
  describe('worktreePath', () => {
    it('constructs path with WORKTREE_BASE and variant key', () => {
      const wtPath = worktreePath('/repo', 'baseline')
      assert.equal(wtPath, path.join('/repo', '.agent-benchmark-worktrees', 'baseline'))
    })

    it('works with nested variant keys', () => {
      const wtPath = worktreePath('/repo', 'variant-1')
      assert.ok(wtPath.includes('variant-1'))
      assert.ok(wtPath.includes('.agent-benchmark-worktrees'))
    })

    it('preserves absolute path', () => {
      const wtPath = worktreePath('/absolute/repo/path', 'key')
      assert.ok(path.isAbsolute(wtPath))
    })
  })

  describe('applyConfigOverlay', () => {
    it('copies config files into the worktree at the specified destinations', async () => {
      const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-src-'))
      const wtDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-dest-'))
      try {
        await fs.writeFile(path.join(srcDir, 'CLAUDE.md'), '# My Config\n')
        await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true })
        await fs.writeFile(path.join(srcDir, 'sub', 'settings.json'), '{"key":"value"}')

        await applyConfigOverlay(wtDir, {
          'CLAUDE.md': path.join(srcDir, 'CLAUDE.md'),
          '.claude/settings.json': path.join(srcDir, 'sub', 'settings.json'),
        })

        const claude = await fs.readFile(path.join(wtDir, 'CLAUDE.md'), 'utf8')
        assert.ok(claude.includes('My Config'))

        const settings = await fs.readFile(path.join(wtDir, '.claude', 'settings.json'), 'utf8')
        assert.ok(settings.includes('value'))
      } finally {
        await fs.rm(srcDir, { recursive: true, force: true })
        await fs.rm(wtDir, { recursive: true, force: true })
      }
    })
  })

  describe('branchName', () => {
    it('prefixes with agent-benchmark', () => {
      const branch = branchName('baseline')
      assert.equal(branch, 'agent-benchmark/baseline')
    })

    it('works with variant keys containing dashes', () => {
      const branch = branchName('variant-a-1')
      assert.equal(branch, 'agent-benchmark/variant-a-1')
    })

    it('works with numeric variant keys', () => {
      const branch = branchName('variant_2')
      assert.equal(branch, 'agent-benchmark/variant_2')
    })
  })
})
