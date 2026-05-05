import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { loadConfig } from '../lib/config.js'

let tmpDir

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-bench-test-'))
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
prompt: "Test task"
model: opusplan
variants:
  baseline:
    label: "A -- opus"
  variant_b:
    label: "B -- sonnet"
    model: sonnet
  variant_c:
    label: "C -- inherit default"
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
})
