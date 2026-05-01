import { initBenchmark } from '../init.js'
import { parseInitArgs } from '../args.js'

export async function init(args) {
  const opts = parseInitArgs(args)
  await initBenchmark(opts)
}
