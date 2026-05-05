import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseReviewOutput, computeAggregates } from '../lib/reviewer.js'
import { buildReviewPrompt } from '../lib/review-prompt.js'

// ── parseReviewOutput ────────────────────────────────────────────────────────

describe('parseReviewOutput', () => {
  it('parses a well-formed JSON response', () => {
    const text = JSON.stringify({
      scores: {
        focused: { score: 85, rationale: 'Stays on task.' },
        clear: { score: 70, rationale: 'Mostly readable.' },
      },
    })
    const result = parseReviewOutput(text)
    assert.equal(result.focused.score, 85)
    assert.equal(result.focused.rationale, 'Stays on task.')
    assert.equal(result.clear.score, 70)
  })

  it('accepts null scores', () => {
    const text = JSON.stringify({
      scores: {
        localized: { score: null, rationale: 'Not applicable.' },
      },
    })
    const result = parseReviewOutput(text)
    assert.equal(result.localized.score, null)
    assert.equal(result.localized.rationale, 'Not applicable.')
  })

  it('strips markdown code fences', () => {
    const text =
      '```json\n' +
      JSON.stringify({ scores: { focused: { score: 90, rationale: 'Good.' } } }) +
      '\n```'
    const result = parseReviewOutput(text)
    assert.equal(result.focused.score, 90)
  })

  it('returns null for empty text', () => {
    assert.equal(parseReviewOutput(''), null)
    assert.equal(parseReviewOutput(null), null)
  })

  it('returns null for invalid JSON', () => {
    assert.equal(parseReviewOutput('not json at all'), null)
  })

  it('returns null when scores field is missing', () => {
    assert.equal(parseReviewOutput(JSON.stringify({ result: 42 })), null)
  })

  it('treats non-numeric score as null', () => {
    const text = JSON.stringify({
      scores: { focused: { score: 'high', rationale: 'Qualitative.' } },
    })
    const result = parseReviewOutput(text)
    assert.equal(result.focused.score, null)
  })

  it('skips malformed axis entries', () => {
    const text = JSON.stringify({
      scores: {
        focused: { score: 80, rationale: 'Fine.' },
        badEntry: null,
      },
    })
    const result = parseReviewOutput(text)
    assert.ok(result.focused)
    assert.equal(result.badEntry, undefined)
  })
})

// ── computeAggregates ────────────────────────────────────────────────────────

describe('computeAggregates', () => {
  it('computes min, max, avg, median for odd-length input', () => {
    const scores = {
      a: { score: 60, rationale: '' },
      b: { score: 80, rationale: '' },
      c: { score: 100, rationale: '' },
    }
    const agg = computeAggregates(scores)
    assert.equal(agg.min, 60)
    assert.equal(agg.max, 100)
    assert.equal(agg.avg, 80)
    assert.equal(agg.median, 80)
  })

  it('computes median for even-length input', () => {
    const scores = {
      a: { score: 60, rationale: '' },
      b: { score: 80, rationale: '' },
      c: { score: 90, rationale: '' },
      d: { score: 100, rationale: '' },
    }
    const agg = computeAggregates(scores)
    assert.equal(agg.median, 85)
    assert.equal(agg.min, 60)
    assert.equal(agg.max, 100)
    assert.equal(agg.avg, 82.5)
  })

  it('excludes null scores', () => {
    const scores = {
      a: { score: 50, rationale: '' },
      b: { score: null, rationale: 'N/A' },
      c: { score: 100, rationale: '' },
    }
    const agg = computeAggregates(scores)
    assert.equal(agg.min, 50)
    assert.equal(agg.max, 100)
    assert.equal(agg.avg, 75)
    assert.equal(agg.median, 75)
  })

  it('returns all nulls when all scores are null', () => {
    const scores = {
      a: { score: null, rationale: '' },
      b: { score: null, rationale: '' },
    }
    const agg = computeAggregates(scores)
    assert.equal(agg.min, null)
    assert.equal(agg.max, null)
    assert.equal(agg.avg, null)
    assert.equal(agg.median, null)
  })

  it('handles a single score', () => {
    const scores = { a: { score: 75, rationale: '' } }
    const agg = computeAggregates(scores)
    assert.equal(agg.min, 75)
    assert.equal(agg.max, 75)
    assert.equal(agg.avg, 75)
    assert.equal(agg.median, 75)
  })
})

// ── buildReviewPrompt ────────────────────────────────────────────────────────

describe('buildReviewPrompt', () => {
  it('includes the task prompt', () => {
    const axes = [{ name: 'focused', description: 'Stays on task.' }]
    const prompt = buildReviewPrompt('Fix the auth bug', axes)
    assert.ok(prompt.includes('Fix the auth bug'))
  })

  it('includes all axes with descriptions', () => {
    const axes = [
      { name: 'focused', description: 'Stays on task.' },
      { name: 'clear', description: 'Easy to read.' },
    ]
    const prompt = buildReviewPrompt('Do the thing', axes)
    assert.ok(prompt.includes('- focused: Stays on task.'))
    assert.ok(prompt.includes('- clear: Easy to read.'))
  })

  it('instructs Claude to respond with ONLY JSON', () => {
    const axes = [{ name: 'focused', description: 'Stays on task.' }]
    const prompt = buildReviewPrompt('task', axes)
    assert.ok(prompt.includes('Respond with ONLY a JSON object'))
  })
})
