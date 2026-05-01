import { listResults, showResult } from '../report.js'

export async function results(args) {
  const timestamp = args[0]
  if (timestamp) {
    await showResult(timestamp)
  } else {
    await listResults()
  }
}
