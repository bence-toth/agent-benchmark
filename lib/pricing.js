// Cache write = 1.25x input, cache read = 0.10x input (consistent across all Claude models).
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER = 0.1

export function normalizedCost(metrics) {
  if (!metrics || metrics.totalCostUsd === null || metrics.totalCostUsd === undefined) return null

  const input = metrics.inputTokens ?? 0
  const output = metrics.outputTokens ?? 0
  const cacheWrite = metrics.cacheCreationTokens ?? 0
  const cacheRead = metrics.cacheReadTokens ?? 0

  if (cacheWrite === 0 && cacheRead === 0) return metrics.totalCostUsd

  // inputTokens already includes cacheWrite + cacheRead (see metrics.js)
  const standardInput = input - cacheWrite - cacheRead

  const actualWeighted =
    standardInput + CACHE_WRITE_MULTIPLIER * cacheWrite + CACHE_READ_MULTIPLIER * cacheRead + output
  if (actualWeighted === 0) return metrics.totalCostUsd

  const normalizedWeighted = standardInput + cacheWrite + cacheRead + output

  return metrics.totalCostUsd * (normalizedWeighted / actualWeighted)
}
