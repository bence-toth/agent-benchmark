import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execFileAsync = promisify(execFile)

const WORKTREE_BASE = '.agent-benchmark-worktrees'
const BRANCH_PREFIX = 'agent-benchmark'

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
  await execFileAsync('git', ['-C', worktreePath_, 'add', '-A'])
  const { stdout: staged } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'diff',
    '--cached',
    '--name-only',
  ])
  if (staged.trim()) {
    await execFileAsync('git', [
      '-C',
      worktreePath_,
      'commit',
      '-m',
      'agent-benchmark: config overlay',
    ])
  }
  const { stdout } = await execFileAsync('git', ['-C', worktreePath_, 'rev-parse', 'HEAD'])
  return stdout.trim()
}

export async function commitChanges(worktreePath_, overlayCommitSha) {
  try {
    if (!overlayCommitSha) {
      return await commitAll(worktreePath_)
    }

    const { stdout: status } = await execFileAsync('git', [
      '-C',
      worktreePath_,
      'status',
      '--porcelain',
    ])

    if (!status.trim()) {
      // No changes from Claude -- remove the overlay commit
      await execFileAsync('git', ['-C', worktreePath_, 'reset', '--hard', 'HEAD~1'])
      return
    }

    // Get the list of files touched by the overlay commit
    const { stdout: overlayFiles } = await execFileAsync('git', [
      '-C',
      worktreePath_,
      'diff-tree',
      '--no-commit-id',
      '-r',
      '--name-only',
      overlayCommitSha,
    ])
    const overlayFileList = overlayFiles.trim().split('\n').filter(Boolean)

    // Stage all of Claude's changes
    await execFileAsync('git', ['-C', worktreePath_, 'add', '-A'])

    // Soft reset to base (parent of overlay) -- keeps index and working tree
    const { stdout: baseCommit } = await execFileAsync('git', [
      '-C',
      worktreePath_,
      'rev-parse',
      `${overlayCommitSha}~1`,
    ])
    await execFileAsync('git', ['-C', worktreePath_, 'reset', '--soft', baseCommit.trim()])

    // For each overlay file, check if Claude modified it relative to the overlay version
    for (const file of overlayFileList) {
      let overlayContent
      try {
        const { stdout } = await execFileAsync('git', [
          '-C',
          worktreePath_,
          'show',
          `${overlayCommitSha}:${file}`,
        ])
        overlayContent = stdout
      } catch {
        continue
      }

      let currentContent
      try {
        currentContent = await fs.readFile(path.join(worktreePath_, file), 'utf8')
      } catch {
        // Claude deleted the overlay file -- leave the deletion staged
        continue
      }

      if (currentContent === overlayContent) {
        // Claude didn't modify this file -- restore to base state
        try {
          await execFileAsync('git', ['-C', worktreePath_, 'checkout', 'HEAD', '--', file])
        } catch {
          // File didn't exist in base -- remove from index and working tree
          await execFileAsync('git', ['-C', worktreePath_, 'rm', '-f', '--cached', file])
          await fs.unlink(path.join(worktreePath_, file))
        }
      }
    }

    // Check if anything remains to commit
    const { stdout: finalStatus } = await execFileAsync('git', [
      '-C',
      worktreePath_,
      'status',
      '--porcelain',
    ])
    if (!finalStatus.trim()) return

    await execFileAsync('git', [
      '-C',
      worktreePath_,
      'commit',
      '-m',
      'agent-benchmark: commit workspace changes',
    ])
  } catch {
    // Ignore commit failures
  }
}

async function commitAll(worktreePath_) {
  const { stdout: status } = await execFileAsync('git', [
    '-C',
    worktreePath_,
    'status',
    '--porcelain',
  ])
  if (!status.trim()) return

  await execFileAsync('git', ['-C', worktreePath_, 'add', '-A'])
  await execFileAsync('git', [
    '-C',
    worktreePath_,
    'commit',
    '-m',
    'agent-benchmark: commit workspace changes',
  ])
}

export async function discardChanges(worktreePath_) {
  try {
    // Discard all uncommitted changes
    await execFileAsync('git', ['-C', worktreePath_, 'clean', '-fd'])
    await execFileAsync('git', ['-C', worktreePath_, 'checkout', '.'])
  } catch {
    // Ignore errors if there's nothing to discard
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

export async function pushBranch(repoPath, variantKey) {
  const branch = branchName(variantKey)
  await execFileAsync('git', ['-C', repoPath, 'push', '-u', 'origin', branch])
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
