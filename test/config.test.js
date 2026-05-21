import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { loadConfig, DEFAULT_AXES } from '../lib/config.js'

let tmpDir

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-benchmark-test-'))
})

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function writeConfig(filename, content) {
  const filepath = path.join(tmpDir, filename)
  await fs.writeFile(filepath, content)
  return filepath
}

describe('loadConfig', () => {
  it('loads a valid config', async () => {
    const p = await writeConfig(
      'valid.yaml',
      `
id: test1234
prompt: "Fix the bug"
model: sonnet
max_budget_usd: 0.5
repo: /some/repo
variants:
  baseline:
    label: "A"
  variant_b:
    label: "B"
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.prompt, 'Fix the bug')
    assert.equal(config.model, 'sonnet')
    assert.equal(config.maxBudgetUsd, 0.5)
    assert.equal(Object.keys(config.variants).length, 2)
    assert.equal(config.variants.baseline.model, 'sonnet')
    assert.equal(config.variants.variant_b.model, 'sonnet')
  })

  it('defaults model and budget', async () => {
    const p = await writeConfig(
      'defaults.yaml',
      `
id: test1234
prompt: "Do something"
variants:
  a:
    label: "A"
  b:
    label: "B"
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.model, 'opusplan')
    assert.equal(config.maxBudgetUsd, 1.0)
  })

  it('rejects placeholder prompt', async () => {
    const p = await writeConfig(
      'placeholder.yaml',
      `
id: test1234
prompt: "TODO: describe the task"
variants:
  a:
    label: A
  b:
    label: B
`,
    )
    await assert.rejects(() => loadConfig(p), /placeholder/)
  })

  it('rejects fewer than two variants', async () => {
    const p = await writeConfig(
      'onevariants.yaml',
      `
id: test1234
prompt: "Do something"
variants:
  a:
    label: A
`,
    )
    await assert.rejects(() => loadConfig(p), /two variants/)
  })

  it('resolves config_files paths relative to config dir', async () => {
    const subDir = path.join(tmpDir, 'bench')
    await fs.mkdir(subDir, { recursive: true })
    const p = await writeConfig(
      'bench/rel.yaml',
      `
id: test1234
prompt: "Fix it"
variants:
  baseline:
    label: A
    config_files:
      CLAUDE.md: ./variants/baseline/CLAUDE.md
  b:
    label: B
`,
    )
    const config = await loadConfig(p)
    const expected = path.join(subDir, 'variants', 'baseline', 'CLAUDE.md')
    assert.equal(config.variants.baseline.configFiles['CLAUDE.md'], expected)
  })

  it('allows per-variant model overrides', async () => {
    const p = await writeConfig(
      'variant-models.yaml',
      `
id: test1234
prompt: "Test task"
model: opusplan
variants:
  baseline:
    label: "A – opus"
  variant_b:
    label: "B – sonnet"
    model: sonnet
  variant_c:
    label: "C – inherit default"
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.model, 'opusplan')
    assert.equal(config.variants.baseline.model, 'opusplan')
    assert.equal(config.variants.variant_b.model, 'sonnet')
    assert.equal(config.variants.variant_c.model, 'opusplan')
  })

  it('throws if config file does not exist', async () => {
    await assert.rejects(() => loadConfig('/nonexistent/path.yaml'), /Cannot read/)
  })

  it('throws on invalid YAML', async () => {
    const p = await writeConfig('invalid.yaml', ': bad: yaml: {{{')
    await assert.rejects(() => loadConfig(p), /Invalid YAML/)
  })

  it('throws when doc is not a mapping', async () => {
    const p = await writeConfig('scalar.yaml', '"just a string"')
    await assert.rejects(() => loadConfig(p), /Config must be a YAML mapping/)
  })

  it('throws when prompt is missing', async () => {
    const p = await writeConfig(
      'no-prompt.yaml',
      `
id: test1234
variants:
  a:
    label: A
  b:
    label: B
`,
    )
    await assert.rejects(() => loadConfig(p), /prompt/)
  })

  it('throws when variants is not a mapping', async () => {
    const p = await writeConfig(
      'bad-variants.yaml',
      `
id: test1234
prompt: "Do something"
variants: "not a mapping"
`,
    )
    await assert.rejects(() => loadConfig(p), /variants/)
  })

  it('throws when a variant entry is not a mapping', async () => {
    const p = await writeConfig(
      'bad-variant-entry.yaml',
      `
id: test1234
prompt: "Do something"
variants:
  a: "not a mapping"
  b:
    label: B
`,
    )
    await assert.rejects(() => loadConfig(p), /must be a mapping/)
  })

  it('throws when variant config_files is not a mapping', async () => {
    const p = await writeConfig(
      'bad-config-files.yaml',
      `
id: test1234
prompt: "Do something"
variants:
  a:
    label: A
    config_files: "not a mapping"
  b:
    label: B
`,
    )
    await assert.rejects(() => loadConfig(p), /config_files must be a mapping/)
  })
})

describe('loadConfig review section', () => {
  it('defaults to all 14 axes and $0.50 budget when review is omitted', async () => {
    const p = await writeConfig(
      'no-review.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.axes.length, DEFAULT_AXES.length)
    assert.equal(config.review.maxBudgetUsd, 0.5)
    assert.equal(config.review.model, config.model)
  })

  it('uses global model for review when no review.model specified', async () => {
    const p = await writeConfig(
      'review-no-model.yaml',
      `
id: test1234
prompt: "Fix the bug"
model: sonnet
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - focused
    - clear
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.model, 'sonnet')
  })

  it('parses review.model and review.max_budget_usd', async () => {
    const p = await writeConfig(
      'review-full.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  model: opus
  max_budget_usd: 1.0
  axes:
    - focused
    - clear
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.model, 'opus')
    assert.equal(config.review.maxBudgetUsd, 1.0)
    assert.equal(config.review.axes.length, 2)
    assert.equal(config.review.axes[0].name, 'focused')
    assert.equal(config.review.axes[1].name, 'clear')
  })

  it('uses built-in descriptions for named axes', async () => {
    const p = await writeConfig(
      'review-builtin-desc.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - secure
`,
    )
    const config = await loadConfig(p)
    const secure = DEFAULT_AXES.find((a) => a.name === 'secure')
    assert.equal(config.review.axes[0].description, secure.description)
  })

  it('allows object axis with custom description overriding built-in', async () => {
    const p = await writeConfig(
      'review-custom-desc.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - name: secure
      description: 'Custom security description'
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.axes[0].name, 'secure')
    assert.equal(config.review.axes[0].description, 'Custom security description')
  })

  it('allows custom axes not in built-in list', async () => {
    const p = await writeConfig(
      'review-custom-axis.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - name: domain-correct
      description: 'Correct with respect to business domain'
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.axes[0].name, 'domain-correct')
    assert.equal(config.review.axes[0].description, 'Correct with respect to business domain')
  })

  it('deduplicates axes (first occurrence wins)', async () => {
    const p = await writeConfig(
      'review-dedupe.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - focused
    - clear
    - focused
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.axes.length, 2)
    assert.equal(config.review.axes[0].name, 'focused')
    assert.equal(config.review.axes[1].name, 'clear')
  })

  it('rejects empty axes list', async () => {
    const p = await writeConfig(
      'review-empty-axes.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes: []
`,
    )
    await assert.rejects(() => loadConfig(p), /at least one axis/)
  })

  it('uses default axes when review section has no axes key', async () => {
    const p = await writeConfig(
      'review-no-axes-key.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  model: opus
  max_budget_usd: 0.75
`,
    )
    const config = await loadConfig(p)
    assert.equal(config.review.axes.length, DEFAULT_AXES.length)
    assert.equal(config.review.model, 'opus')
    assert.equal(config.review.maxBudgetUsd, 0.75)
  })

  it('throws when review is not a mapping', async () => {
    const p = await writeConfig(
      'review-not-mapping.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review: "not a mapping"
`,
    )
    await assert.rejects(() => loadConfig(p), /review.*must be a mapping/)
  })

  it('throws when review.axes is not a list', async () => {
    const p = await writeConfig(
      'review-axes-not-list.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes: "not a list"
`,
    )
    await assert.rejects(() => loadConfig(p), /review\.axes.*must be a list/)
  })

  it('throws when an axis entry is invalid (not string or object)', async () => {
    const p = await writeConfig(
      'review-axes-bad-entry.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - 42
`,
    )
    await assert.rejects(() => loadConfig(p), /axis must be a string or an object/)
  })

  it('rejects axis object without name', async () => {
    const p = await writeConfig(
      'review-no-name.yaml',
      `
id: test1234
prompt: "Fix the bug"
variants:
  a:
    label: A
  b:
    label: B
review:
  axes:
    - description: 'Missing name'
`,
    )
    await assert.rejects(() => loadConfig(p), /"name"/)
  })
})
