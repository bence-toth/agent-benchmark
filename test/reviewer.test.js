import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseReviewScores, computeAggregates, runReview, extractFinalText } from '../lib/reviewer.js'
import { buildReviewPrompt } from '../lib/review-prompt.js'

// ── runReview dry-run ────────────────────────────────────────────────────────

describe('runReview', () => {
  it('returns null and prints dry-run info without spawning processes', async () => {
    const config = {
      prompt: 'Fix the auth bug',
      repo: '/repo',
      variants: {
        baseline: { label: 'Baseline' },
        variant_b: { label: 'Variant B' },
      },
      review: {
        axes: [{ name: 'focused', description: 'Stays on task.' }],
        model: 'claude-opus-4-7',
        maxBudgetUsd: 0.5,
      },
    }
    const resultSet = {
      variants: {
        baseline: { error: null },
        variant_b: { error: null },
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    const result = await runReview(config, resultSet, { dryRun: true })
    console.log = orig

    assert.equal(result, null)
    const output = lines.join('\n')
    assert.ok(output.includes('Dry run'))
    assert.ok(output.includes('Baseline'))
    assert.ok(output.includes('Variant B'))
    assert.ok(output.includes('focused'))
  })

  it('skips errored variants in dry-run output', async () => {
    const config = {
      prompt: 'Fix the auth bug',
      repo: '/repo',
      variants: {
        baseline: { label: 'Baseline' },
        variant_b: { label: 'Variant B' },
      },
      review: {
        axes: [{ name: 'focused', description: 'Stays on task.' }],
        model: 'claude-opus-4-7',
        maxBudgetUsd: 0.5,
      },
    }
    const resultSet = {
      variants: {
        baseline: { error: null },
        variant_b: { error: 'budget exceeded' },
      },
    }

    const lines = []
    const orig = console.log
    console.log = (...args) => lines.push(args.join(' '))
    await runReview(config, resultSet, { dryRun: true })
    console.log = orig

    const output = lines.join('\n')
    assert.ok(output.includes('Baseline'))
    assert.ok(output.includes('Skipped'))
    assert.ok(output.includes('budget exceeded'))
  })
})

// ── parseReviewScores ────────────────────────────────────────────────────────

describe('parseReviewScores', () => {
  it('parses a well-formed scores object', () => {
    const obj = {
      scores: {
        focused: { score: 85, rationale: 'Stays on task.' },
        clear: { score: 70, rationale: 'Mostly readable.' },
      },
    }
    const result = parseReviewScores(obj)
    assert.equal(result.focused.score, 85)
    assert.equal(result.focused.rationale, 'Stays on task.')
    assert.equal(result.clear.score, 70)
  })

  it('accepts null scores', () => {
    const obj = {
      scores: {
        localized: { score: null, rationale: 'Not applicable.' },
      },
    }
    const result = parseReviewScores(obj)
    assert.equal(result.localized.score, null)
    assert.equal(result.localized.rationale, 'Not applicable.')
  })

  it('returns null for invalid object', () => {
    assert.equal(parseReviewScores(null), null)
    assert.equal(parseReviewScores({}), null)
    assert.equal(parseReviewScores({ scores: null }), null)
  })

  it('returns null when scores field is missing', () => {
    assert.equal(parseReviewScores({ result: 42 }), null)
  })

  it('treats non-numeric score as null', () => {
    const obj = {
      scores: { focused: { score: 'high', rationale: 'Qualitative.' } },
    }
    const result = parseReviewScores(obj)
    assert.equal(result.focused.score, null)
  })

  it('skips malformed axis entries', () => {
    const obj = {
      scores: {
        focused: { score: 80, rationale: 'Fine.' },
        badEntry: null,
      },
    }
    const result = parseReviewScores(obj)
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

// ── extractFinalText ─────────────────────────────────────────────────────────

describe('extractFinalText', () => {
  it('returns result text from the last result event', () => {
    const events = [
      { type: 'result', result: 'Final answer' },
    ]
    assert.equal(extractFinalText(events), 'Final answer')
  })

  it('prefers the last result event when multiple exist', () => {
    const events = [
      { type: 'result', result: 'First' },
      { type: 'result', result: 'Last' },
    ]
    assert.equal(extractFinalText(events), 'Last')
  })

  it('falls back to last assistant message text block when no result event', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello from assistant' },
          ],
        },
      },
    ]
    assert.equal(extractFinalText(events), 'Hello from assistant')
  })

  it('prefers the last assistant message with text when result event has no result field', () => {
    const events = [
      { type: 'result' },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Fallback text' }],
        },
      },
    ]
    assert.equal(extractFinalText(events), 'Fallback text')
  })

  it('skips assistant events with non-array content', () => {
    const events = [
      { type: 'assistant', message: { content: 'not an array' } },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Valid block' }] },
      },
    ]
    assert.equal(extractFinalText(events), 'Valid block')
  })

  it('skips non-text content blocks', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'text', text: 'After tool' },
          ],
        },
      },
    ]
    assert.equal(extractFinalText(events), 'After tool')
  })

  it('returns empty string when no usable events exist', () => {
    assert.equal(extractFinalText([]), '')
    assert.equal(extractFinalText([{ type: 'system' }]), '')
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

  it('instructs Claude to use Write tool', () => {
    const axes = [{ name: 'focused', description: 'Stays on task.' }]
    const prompt = buildReviewPrompt('task', axes)
    assert.ok(prompt.includes('Write tool'))
    assert.ok(prompt.includes('.review-scores.json'))
  })
})
