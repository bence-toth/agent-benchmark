export function parseInitArgs(args) {
  const opts = { repoPath: null, variants: 2, name: null }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--variants') {
      opts.variants = parseInt(args[++i], 10)
      if (isNaN(opts.variants) || opts.variants < 2) {
        throw new Error('--variants must be an integer >= 2')
      }
    } else if (args[i] === '--name') {
      opts.name = args[++i]
    } else if (!opts.repoPath) {
      opts.repoPath = args[i]
    }
  }

  if (!opts.repoPath) throw new Error('Usage: agent-bench init <repo-path>')
  return opts
}

export function parseRunArgs(args) {
  const opts = {
    configFile: null,
    dryRun: false,
    yes: false,
    concurrency: null,
    noCleanup: false,
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      opts.dryRun = true
    } else if (args[i] === '--yes') {
      opts.yes = true
    } else if (args[i] === '--no-cleanup') {
      opts.noCleanup = true
    } else if (args[i] === '--concurrency') {
      opts.concurrency = parseInt(args[++i], 10)
      if (isNaN(opts.concurrency) || opts.concurrency < 1) {
        throw new Error('--concurrency must be an integer >= 1')
      }
    } else if (!opts.configFile) {
      opts.configFile = args[i]
    }
  }

  if (!opts.configFile) throw new Error('Usage: agent-bench run <benchmark.yaml>')
  return opts
}

export function parseReviewArgs(args) {
  const opts = {
    configFile: null,
    timestamp: null,
    dryRun: false,
    yes: false,
    concurrency: null,
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      opts.dryRun = true
    } else if (args[i] === '--yes') {
      opts.yes = true
    } else if (args[i] === '--concurrency') {
      opts.concurrency = parseInt(args[++i], 10)
      if (isNaN(opts.concurrency) || opts.concurrency < 1) {
        throw new Error('--concurrency must be an integer >= 1')
      }
    } else if (!opts.configFile) {
      opts.configFile = args[i]
    } else if (!opts.timestamp) {
      opts.timestamp = args[i]
    }
  }

  if (!opts.configFile) throw new Error('Usage: agent-bench review <benchmark.yaml> [<timestamp>]')
  return opts
}
