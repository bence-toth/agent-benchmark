import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseMetrics, parseStreamLine, createCollector } from '../lib/metrics.js'

const makeResultEvent = (overrides = {}) => ({
  type: 'result',
  duration_ms: 5000,
  num_turns: 3,
  total_cost_usd: 0.42,
  usage: {
    input_tokens: 1000,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 50,
    output_tokens: 300,
  },
  ...overrides,
})

const makeAssistantEvent = (toolNames = []) => ({
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'hello' },
      ...toolNames.map((name) => ({ type: 'tool_use', name, id: 'x' })),
    ],
  },
})

describe('parseMetrics', () => {
  it('extracts all fields from result event', () => {
    const events = [makeResultEvent()]
    const m = parseMetrics(events)
    assert.equal(m.durationMs, 5000)
    assert.equal(m.inputTokens, 1250) // 1000 + 200 + 50
    assert.equal(m.outputTokens, 300)
    assert.equal(m.totalCostUsd, 0.42)
    assert.equal(m.numTurns, 3)
    assert.equal(m.cacheCreationTokens, 200)
    assert.equal(m.cacheReadTokens, 50)
  })

  it('returns error when no result event', () => {
    const m = parseMetrics([{ type: 'system' }])
    assert.ok(m.error)
  })

  it('counts tool calls per tool name', () => {
    const events = [
      makeAssistantEvent(['Bash', 'Edit']),
      makeAssistantEvent(['Bash']),
      makeResultEvent(),
    ]
    const m = parseMetrics(events)
    assert.equal(m.toolCalls['Bash'], 2)
    assert.equal(m.toolCalls['Edit'], 1)
  })

  it('handles missing usage fields gracefully', () => {
    const events = [{ type: 'result', duration_ms: 1000, usage: {} }]
    const m = parseMetrics(events)
    assert.equal(m.inputTokens, 0)
    assert.equal(m.outputTokens, 0)
  })
})

describe('parseStreamLine', () => {
  it('parses valid JSON', () => {
    const obj = parseStreamLine('{"type":"system"}')
    assert.deepEqual(obj, { type: 'system' })
  })

  it('returns null for empty lines', () => {
    assert.equal(parseStreamLine(''), null)
    assert.equal(parseStreamLine('   '), null)
  })

  it('returns null for invalid JSON', () => {
    assert.equal(parseStreamLine('not json'), null)
  })
})

describe('createCollector', () => {
  it('collects and returns events', () => {
    const c = createCollector()
    c.push({ type: 'a' })
    c.push({ type: 'b' })
    assert.deepEqual(c.getEvents(), [{ type: 'a' }, { type: 'b' }])
  })
})
