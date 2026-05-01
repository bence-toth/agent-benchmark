import { runBenchmark } from '../runner.js'
import { loadConfig } from '../config.js'
import { parseRunArgs } from '../args.js'

export async function run(args) {
  const opts = parseRunArgs(args)
  const config = await loadConfig(opts.configFile)
  await runBenchmark(config, opts)
}
