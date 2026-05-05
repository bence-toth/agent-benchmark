import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { initBenchmark } from '../lib/init.js'

const execFileAsync = promisify(execFile)

let repoDir
let benchCwd

async function git(...args) {
  return execFileAsync('git', ['-C', repoDir, ...args])
}

before(async () => {
  repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-bench-repo-'))
  benchCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-bench-cwd-'))

  await git('init')
  await git('config', 'user.email', 'test@test.com')
  await git('config', 'user.name', 'Test')

  // Create some config files
  await fs.writeFile(path.join(repoDir, 'CLAUDE.md'), '# Instructions\n')
  await fs.writeFile(path.join(repoDir, 'README.md'), '# My Repo\n')
  await fs.mkdir(path.join(repoDir, '.github'), { recursive: true })
  await fs.writeFile(path.join(repoDir, '.github', 'copilot-instructions.md'), '# Copilot\n')

  await git('add', '.')
  await git('commit', '-m', 'init')
})

after(async () => {
  await fs.rm(repoDir, { recursive: true, force: true })
  await fs.rm(benchCwd, { recursive: true, force: true })
})

describe('initBenchmark', () => {
  it('creates benchmark directory with variants and yaml', async () => {
    const savedCwd = process.cwd
    process.cwd = () => benchCwd
    try {
      await initBenchmark({ repoPath: repoDir, variants: 2, name: 'my-bench' })
    } finally {
      process.cwd = savedCwd
    }

    const benchDir = path.join(benchCwd, 'my-bench')
    const stat = await fs.stat(benchDir)
    assert.ok(stat.isDirectory())

    // benchmark.yaml should exist
    const yaml = await fs.readFile(path.join(benchDir, 'benchmark.yaml'), 'utf8')
    assert.ok(yaml.includes('repo:'))
    assert.ok(yaml.includes('TODO: describe the task'))
    assert.ok(yaml.includes('baseline'))
    assert.ok(yaml.includes('variant_b'))

    // baseline variant should contain copied files
    const claudeMd = await fs.readFile(
      path.join(benchDir, 'variants', 'baseline', 'CLAUDE.md'),
      'utf8',
    )
    assert.ok(claudeMd.includes('Instructions'))

    const readme = await fs.readFile(
      path.join(benchDir, 'variants', 'baseline', 'README.md'),
      'utf8',
    )
    assert.ok(readme.includes('My Repo'))

    const copilot = await fs.readFile(
      path.join(benchDir, 'variants', 'baseline', '.github', 'copilot-instructions.md'),
      'utf8',
    )
    assert.ok(copilot.includes('Copilot'))
  })

  it('creates the requested number of variant directories', async () => {
    const savedCwd = process.cwd
    process.cwd = () => benchCwd
    try {
      await initBenchmark({ repoPath: repoDir, variants: 3, name: 'three-variants' })
    } finally {
      process.cwd = savedCwd
    }

    const variantsDir = path.join(benchCwd, 'three-variants', 'variants')
    const entries = await fs.readdir(variantsDir)
    assert.equal(entries.length, 3)
    assert.ok(entries.includes('baseline'))
    assert.ok(entries.includes('variant_b'))
    assert.ok(entries.includes('variant_c'))
  })

  it('throws for non-git repo', async () => {
    const notRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'not-a-repo-'))
    try {
      await assert.rejects(
        () => initBenchmark({ repoPath: notRepo, variants: 2, name: 'x' }),
        /Not a git repository/,
      )
    } finally {
      await fs.rm(notRepo, { recursive: true, force: true })
    }
  })
})
