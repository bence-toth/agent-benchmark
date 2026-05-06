import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizedCost } from '../lib/pricing.js'

describe('normalizedCost', () => {
  it('returns totalCostUsd unchanged when no cache tokens', () => {
    const metrics = {
      totalCostUsd: 0.5,
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    assert.equal(normalizedCost(metrics), 0.5)
  })

  it('adjusts cost upward when cache reads dominate', () => {
    // 900 tokens came from cache read (cheap), normalized treats them as standard
    const metrics = {
      totalCostUsd: 1.0,
      inputTokens: 1000, // includes cacheCreation + cacheRead
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 900,
    }
    // actual weighted: 100 + 0.10*900 + 0 = 190
    // normalized weighted: 100 + 900 + 0 = 1000
    // result: 1.0 * (1000 / 190)
    const result = normalizedCost(metrics)
    assert.ok(result > 1.0)
    assertClose(result, 1000 / 190)
  })

  it('adjusts cost downward when cache writes dominate', () => {
    // 900 tokens were cache writes (expensive), normalized treats them as standard
    const metrics = {
      totalCostUsd: 1.0,
      inputTokens: 1000,
      outputTokens: 0,
      cacheCreationTokens: 900,
      cacheReadTokens: 0,
    }
    // actual weighted: 100 + 1.25*900 + 0 = 1225
    // normalized weighted: 100 + 900 + 0 = 1000
    // result: 1.0 * (1000 / 1225)
    const result = normalizedCost(metrics)
    assert.ok(result < 1.0)
    assertClose(result, 1000 / 1225)
  })

  it('handles mixed cache creation and read tokens', () => {
    const metrics = {
      totalCostUsd: 2.0,
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 300,
      cacheReadTokens: 200,
    }
    // standardInput = 1000 - 300 - 200 = 500
    // actual weighted: 500 + 1.25*300 + 0.10*200 + 500 = 500 + 375 + 20 + 500 = 1395
    // normalized weighted: 500 + 300 + 200 + 500 = 1500
    // result: 2.0 * (1500 / 1395)
    const result = normalizedCost(metrics)
    assertClose(result, 2.0 * (1500 / 1395))
  })

  it('works regardless of model (no model param needed)', () => {
    const metrics = {
      totalCostUsd: 3.0,
      inputTokens: 2000,
      outputTokens: 1000,
      cacheCreationTokens: 500,
      cacheReadTokens: 500,
    }
    // Just verify it returns a number without needing a model
    const result = normalizedCost(metrics)
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
  })

  it('returns null when metrics is null', () => {
    assert.equal(normalizedCost(null), null)
  })

  it('returns null when totalCostUsd is undefined', () => {
    const metrics = {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    assert.equal(normalizedCost(metrics), null)
  })

  it('returns null when totalCostUsd is null', () => {
    const metrics = {
      totalCostUsd: null,
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    assert.equal(normalizedCost(metrics), null)
  })

  it('handles zero tokens gracefully', () => {
    const metrics = {
      totalCostUsd: 0.1,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    assert.equal(normalizedCost(metrics), 0.1)
  })
})

function assertClose(actual, expected, tolerance = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `Expected ${actual} to be close to ${expected}`,
  )
}
