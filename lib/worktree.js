import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execFileAsync = promisify(execFile)

const WORKTREE_BASE = '.agent-bench-worktrees'
const BRANCH_PREFIX = 'agent-bench'

export function worktreePath(repoPath, variantKey) {
  return path.join(repoPath, WORKTREE_BASE, variantKey)
}

export function branchName(variantKey) {
  return `${BRANCH_PREFIX}/${variantKey}`
}

export async function createWorktree(repoPath, variantKey) {
  const wtPath = worktreePath(repoPath, variantKey)
  const branch = branchName(variantKey)
  await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', wtPath, '-b', branch, 'HEAD'])
  return wtPath
}

export async function applyConfigOverlay(worktreePath_, configFiles) {
  for (const [dest, src] of Object.entries(configFiles)) {
    const destAbs = path.join(worktreePath_, dest)
    await fs.mkdir(path.dirname(destAbs), { recursive: true })
    await fs.copyFile(src, destAbs)
  }
}

export async function removeWorktree(repoPath, variantKey) {
  const wtPath = worktreePath(repoPath, variantKey)
  const branch = branchName(variantKey)

  try {
    await execFileAsync('git', ['-C', repoPath, 'worktree', 'remove', wtPath, '--force'])
  } catch {
    // already removed or never created
  }
  try {
    await execFileAsync('git', ['-C', repoPath, 'branch', '-D', branch])
  } catch {
    // branch may not exist
  }
}

export async function getBaseCommit(repoPath) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', 'HEAD'])
  return stdout.trim()
}

export async function getDiffStats(worktreePath_, baseCommit) {
  // Committed + uncommitted changes relative to base
  const { stdout: statOut } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'diff',
    '--stat',
    baseCommit,
  ])

  const { stdout: logOut } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'log',
    '--oneline',
    `${baseCommit}..HEAD`,
  ])

  const { stdout: unstagedStat } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'diff',
    '--stat',
  ])

  const { stdout: stagedStat } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'diff',
    '--cached',
    '--stat',
  ])

  const { stdout: patchOut } = await execFileAsync('git', ['-C', worktreePath_, 'diff', baseCommit])

  const commits = logOut.trim().split('\n').filter(Boolean)

  const { insertions, deletions } = parseDiffStat(statOut)

  return {
    commits,
    insertions,
    deletions,
    diffStat: statOut.trim(),
    unstagedStat: unstagedStat.trim(),
    stagedStat: stagedStat.trim(),
    patch: patchOut,
  }
}

function parseDiffStat(statOutput) {
  // Last line of --stat is like "3 files changed, 45 insertions(+), 12 deletions(-)"
  const summary = statOutput.trim().split('\n').pop() ?? ''
  const ins = summary.match(/(\d+) insertion/)
  const del = summary.match(/(\d+) deletion/)
  return {
    insertions: ins ? parseInt(ins[1], 10) : 0,
    deletions: del ? parseInt(del[1], 10) : 0,
  }
}
