import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { worktreePath, branchName } from '../lib/worktree.js'

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
