import { loadConfig } from '../config.js'
import { createInterface } from 'readline'
import { removeWorktree, discardChanges, worktreePath } from '../worktree.js'

export async function reviewCleanup(args) {
  if (args.length === 0) {
    throw new Error('Usage: agent-bench review-cleanup <benchmark.yaml> [<timestamp>] [--yes]')
  }

  const configFile = args[0]
  const yes = args.includes('--yes')

  const config = await loadConfig(configFile)
  const variantKeys = Object.keys(config.variants)

  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise((resolve) => {
      rl.question(`Remove review worktrees for ${variantKeys.length} variant(s)? [Y/n] `, resolve)
    })
    rl.close()

    if (answer.trim().toLowerCase() === 'n') {
      console.log('Aborted.')
      return
    }
  }

  for (const key of variantKeys) {
    try {
      const wtPath = worktreePath(config.repo, `review-${key}`)
      await discardChanges(wtPath)
      await removeWorktree(config.repo, `review-${key}`)
    } catch {
      // ignore cleanup failures
    }
  }
  console.log('Review worktrees cleaned up.')
}
