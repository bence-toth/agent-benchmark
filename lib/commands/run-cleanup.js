import { loadConfig } from '../config.js'
import { createInterface } from 'readline'
import { removeWorktree } from '../worktree.js'

export async function runCleanup(args) {
  if (args.length === 0) {
    throw new Error('Usage: agent-bench run-cleanup <benchmark.yaml> [--yes]')
  }

  const configFile = args[0]
  const yes = args.includes('--yes')

  const config = await loadConfig(configFile)
  const variantKeys = Object.keys(config.variants)

  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise((resolve) => {
      rl.question(
        `Remove worktrees and branches for ${variantKeys.length} variant(s)? [Y/n] `,
        resolve,
      )
    })
    rl.close()

    if (answer.trim().toLowerCase() === 'n') {
      console.log('Aborted.')
      return
    }
  }

  for (const key of variantKeys) {
    await removeWorktree(config.repo, key)
  }
  console.log('Worktrees cleaned up.')
}
