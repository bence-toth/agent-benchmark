export function createCollector() {
  const events = []
  return {
    push(event) {
      events.push(event)
    },
    getEvents() {
      return events
    },
  }
}

export function parseMetrics(events) {
  const resultEvent = events.findLast((e) => e.type === 'result')

  if (!resultEvent) {
    return { error: 'no result event in stream output' }
  }

  const usage = resultEvent.usage ?? {}
  const inputTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)

  const toolCalls = countToolCalls(events)

  return {
    durationMs: resultEvent.duration_ms ?? null,
    inputTokens,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    totalCostUsd: resultEvent.total_cost_usd ?? null,
    numTurns: resultEvent.num_turns ?? null,
    toolCalls,
  }
}

function countToolCalls(events) {
  const counts = {}
  for (const event of events) {
    if (event.type !== 'assistant') continue
    const content = event.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type === 'tool_use') {
        counts[block.name] = (counts[block.name] ?? 0) + 1
      }
    }
  }
  return counts
}

export function parseStreamLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}
