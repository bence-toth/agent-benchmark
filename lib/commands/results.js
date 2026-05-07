import { resolveTimestamp, listResults, showResult } from '../report.js'

export async function results(args) {
  const timestamp = args[0]
  if (timestamp === '--list' || timestamp === '-l') {
    await listResults()
  } else {
    const resolved = await resolveTimestamp(timestamp)
    await showResult(resolved)
  }
}
