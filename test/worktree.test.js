import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  worktreePath,
  branchName,
  applyConfigOverlay,
  createWorktree,
  removeWorktree,
  getBaseCommit,
  getDiffStats,
  discardChanges,
  commitChanges,
} from '../lib/worktree.js'

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

  async function makeRepo() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-repo-'))
    await execFileAsync('git', ['-C', dir, 'init'])
    await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'])
    await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'Test'])
    await fs.writeFile(path.join(dir, 'readme.txt'), 'hello\n')
    await execFileAsync('git', ['-C', dir, 'add', '.'])
    await execFileAsync('git', ['-C', dir, 'commit', '-m', 'init'])
    return dir
  }

  describe('getBaseCommit', () => {
    it('returns the HEAD commit SHA', async () => {
      const repo = await makeRepo()
      try {
        const sha = await getBaseCommit(repo)
        assert.match(sha, /^[0-9a-f]{40}$/)
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })
  })

  describe('createWorktree and removeWorktree', () => {
    it('creates a new worktree at a fresh branch then removes it', async () => {
      const repo = await makeRepo()
      try {
        const wtPath = await createWorktree(repo, 'testid', 'variant_b')
        const stat = await fs.stat(wtPath)
        assert.ok(stat.isDirectory())
        // The file from the base commit should be present
        const content = await fs.readFile(path.join(wtPath, 'readme.txt'), 'utf8')
        assert.equal(content, 'hello\n')

        await removeWorktree(repo, 'variant_b')
        await assert.rejects(() => fs.stat(wtPath))
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })

    it('removeWorktree is a no-op when worktree does not exist', async () => {
      const repo = await makeRepo()
      try {
        // Should not throw
        await removeWorktree(repo, 'nonexistent-variant')
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })
  })

  describe('getDiffStats', () => {
    it('returns zero insertions/deletions when nothing changed', async () => {
      const repo = await makeRepo()
      try {
        const baseCommit = await getBaseCommit(repo)
        const stats = await getDiffStats(repo, baseCommit)
        assert.equal(stats.insertions, 0)
        assert.equal(stats.deletions, 0)
        assert.deepEqual(stats.commits, [])
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })

    it('reports insertions and commits after a new commit', async () => {
      const repo = await makeRepo()
      try {
        const baseCommit = await getBaseCommit(repo)
        await fs.writeFile(path.join(repo, 'new.txt'), 'line1\nline2\n')
        await execFileAsync('git', ['-C', repo, 'add', '.'])
        await execFileAsync('git', ['-C', repo, 'commit', '-m', 'add file'])

        const stats = await getDiffStats(repo, baseCommit)
        assert.equal(stats.insertions, 2)
        assert.equal(stats.deletions, 0)
        assert.equal(stats.commits.length, 1)
        assert.ok(stats.patch.includes('new.txt'))
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })
  })

  describe('discardChanges', () => {
    it('reverts uncommitted modifications and untracked files', async () => {
      const repo = await makeRepo()
      try {
        await fs.writeFile(path.join(repo, 'readme.txt'), 'modified\n')
        await fs.writeFile(path.join(repo, 'untracked.txt'), 'new file\n')

        await discardChanges(repo)

        const content = await fs.readFile(path.join(repo, 'readme.txt'), 'utf8')
        assert.equal(content, 'hello\n')
        await assert.rejects(() => fs.stat(path.join(repo, 'untracked.txt')))
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })
  })

  describe('commitChanges', () => {
    it('commits all changes when no overlay commit is given', async () => {
      const repo = await makeRepo()
      try {
        const baseSha = await getBaseCommit(repo)
        await fs.writeFile(path.join(repo, 'new.txt'), 'added\n')

        await commitChanges(repo, undefined)

        const { stdout } = await execFileAsync('git', [
          '-C', repo, 'log', '--oneline', `${baseSha}..HEAD`,
        ])
        assert.ok(stdout.trim().length > 0)
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })

    it('is a no-op when nothing changed', async () => {
      const repo = await makeRepo()
      try {
        const baseSha = await getBaseCommit(repo)
        await commitChanges(repo, undefined)
        const headSha = await getBaseCommit(repo)
        assert.equal(headSha, baseSha)
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
      }
    })

    it('squashes overlay commit when Claude makes no changes', async () => {
      const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-src-'))
      const repo = await makeRepo()
      try {
        await fs.writeFile(path.join(srcDir, 'CLAUDE.md'), '# config\n')
        const overlaySha = await applyConfigOverlay(repo, {
          'CLAUDE.md': path.join(srcDir, 'CLAUDE.md'),
        })
        const baseSha = await getBaseCommit(repo)
        // Overlay commit is HEAD; parent is the real base
        const { stdout: parentSha } = await execFileAsync('git', [
          '-C', repo, 'rev-parse', `${overlaySha}~1`,
        ])
        // No additional changes -- commitChanges should remove overlay
        await commitChanges(repo, overlaySha)
        const headSha = await getBaseCommit(repo)
        assert.equal(headSha, parentSha.trim())
        assert.notEqual(headSha, baseSha)
      } finally {
        await fs.rm(repo, { recursive: true, force: true })
        await fs.rm(srcDir, { recursive: true, force: true })
      }
    })
  })
})
