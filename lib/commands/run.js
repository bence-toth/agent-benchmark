import { runBenchmark } from '../runner.js'
import { loadConfig } from '../config.js'
import { parseRunArgs } from '../args.js'

export async function run(args) {
  const opts = parseRunArgs(args)
  const config = await loadConfig(opts.configFile)
  const timestamp = await runBenchmark(config, opts)
  if (timestamp) {
    console.log('\nNext steps:')
    console.log(`  agent-benchmark review ${opts.configFile} ${timestamp}`)
    console.log(`  agent-benchmark copilot-review ${opts.configFile} ${timestamp}`)
  }
}
