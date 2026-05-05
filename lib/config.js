import fs from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'

const PLACEHOLDER_PROMPT = 'TODO: describe the task'

export async function loadConfig(configFile) {
  const absConfig = path.resolve(configFile)
  let raw
  try {
    raw = await fs.readFile(absConfig, 'utf8')
  } catch {
    throw new Error(`Cannot read config file: ${absConfig}`)
  }

  let doc
  try {
    doc = yaml.load(raw)
  } catch (err) {
    throw new Error(`Invalid YAML in ${absConfig}: ${err.message}`)
  }

  return validate(doc, path.dirname(absConfig))
}

function validate(doc, configDir) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Config must be a YAML mapping')
  }

  if (!doc.prompt || typeof doc.prompt !== 'string') {
    throw new Error('Config must have a "prompt" string field')
  }
  if (doc.prompt.trim() === PLACEHOLDER_PROMPT) {
    throw new Error('Replace the placeholder prompt before running')
  }

  if (!doc.variants || typeof doc.variants !== 'object') {
    throw new Error('Config must have a "variants" mapping with at least two entries')
  }
  const variantEntries = Object.entries(doc.variants)
  if (variantEntries.length < 2) {
    throw new Error('At least two variants are required')
  }

  const globalModel = doc.model ?? 'opusplan'
  const maxBudgetUsd = doc.max_budget_usd ?? 1.0
  const repo = doc.repo ? path.resolve(doc.repo) : process.cwd()

  const variants = {}
  for (const [key, v] of variantEntries) {
    if (!v || typeof v !== 'object') {
      throw new Error(`Variant "${key}" must be a mapping`)
    }
    const label = v.label ?? key
    const model = v.model ?? globalModel
    const configFiles = {}
    if (v.config_files) {
      if (typeof v.config_files !== 'object') {
        throw new Error(`Variant "${key}".config_files must be a mapping`)
      }
      for (const [dest, src] of Object.entries(v.config_files)) {
        configFiles[dest] = path.resolve(configDir, src)
      }
    }
    variants[key] = { label, model, configFiles }
  }

  return { prompt: doc.prompt.trim(), model: globalModel, maxBudgetUsd, repo, variants, configDir }
}
