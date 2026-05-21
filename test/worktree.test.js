import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { worktreePath, branchName, applyConfigOverlay } from '../lib/worktree.js'

const execFileAsync = promisify(execFile)

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
    it('copies config files and creates an overlay commit', async () => {
      const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-src-'))
      const wtDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-dest-'))
      try {
        // Initialize a git repo in the worktree dir
        await execFileAsync('git', ['-C', wtDir, 'init'])
        await execFileAsync('git', ['-C', wtDir, 'config', 'user.email', 'test@example.com'])
        await execFileAsync('git', ['-C', wtDir, 'config', 'user.name', 'Test'])
        await execFileAsync('git', ['-C', wtDir, 'commit', '--allow-empty', '-m', 'init'])

        await fs.writeFile(path.join(srcDir, 'CLAUDE.md'), '# My Config\n')
        await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true })
        await fs.writeFile(path.join(srcDir, 'sub', 'settings.json'), '{"key":"value"}')

        const sha = await applyConfigOverlay(wtDir, {
          'CLAUDE.md': path.join(srcDir, 'CLAUDE.md'),
          '.claude/settings.json': path.join(srcDir, 'sub', 'settings.json'),
        })

        const claude = await fs.readFile(path.join(wtDir, 'CLAUDE.md'), 'utf8')
        assert.ok(claude.includes('My Config'))

        const settings = await fs.readFile(path.join(wtDir, '.claude', 'settings.json'), 'utf8')
        assert.ok(settings.includes('value'))

        // Returns a valid commit SHA
        assert.match(sha, /^[0-9a-f]{40}$/)

        // The overlay is committed
        const { stdout: status } = await execFileAsync('git', [
          '-C',
          wtDir,
          'status',
          '--porcelain',
        ])
        assert.equal(status.trim(), '')
      } finally {
        await fs.rm(srcDir, { recursive: true, force: true })
        await fs.rm(wtDir, { recursive: true, force: true })
      }
    })
  })

  describe('branchName', () => {
    it('prefixes with agent-benchmark and includes id', () => {
      const branch = branchName('a1b2c3d4', 'baseline')
      assert.equal(branch, 'agent-benchmark/a1b2c3d4/baseline')
    })

    it('works with variant keys containing dashes', () => {
      const branch = branchName('a1b2c3d4', 'variant-a-1')
      assert.equal(branch, 'agent-benchmark/a1b2c3d4/variant-a-1')
    })

    it('works with numeric variant keys', () => {
      const branch = branchName('a1b2c3d4', 'variant_2')
      assert.equal(branch, 'agent-benchmark/a1b2c3d4/variant_2')
    })
  })
})
