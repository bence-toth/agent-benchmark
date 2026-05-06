import fs from 'fs/promises'
import path from 'path'
import yaml from 'js-yaml'

const PLACEHOLDER_PROMPT = 'TODO: describe the task'

const DEFAULT_AXES = [
  { name: 'accessible', description: 'a11y was adequately considered' },
  { name: 'clear', description: 'Easy to understand what was changed' },
  { name: 'concise', description: 'Minimal but still effective' },
  { name: 'conventional', description: 'Follows conventions of the repo' },
  {
    name: 'documented',
    description: 'Changes to public APIs or complex logic are documented where needed',
  },
  { name: 'focused', description: "Doesn't do stuff outside of the requested changes" },
  { name: 'idiomatic', description: 'Follows language/framework idioms' },
  { name: 'localized', description: 'i18n was considered' },
  { name: 'modular', description: 'Clear separation of concerns' },
  { name: 'nonbreaking', description: "Doesn't break existing contracts or APIs" },
  { name: 'performant', description: 'Performance was adequately considered' },
  { name: 'robust', description: 'Handles edge cases' },
  { name: 'secure', description: 'Security was adequately considered' },
  {
    name: 'tested',
    description: 'Meaningful change in test coverage, broken tests are patched',
  },
]

export { DEFAULT_AXES }

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
  const prBaseBranch = doc.pr_base_branch ?? 'main'

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

  const review = parseReviewSection(doc.review, globalModel)

  return {
    prompt: doc.prompt.trim(),
    model: globalModel,
    maxBudgetUsd,
    repo,
    variants,
    configDir,
    review,
    prBaseBranch,
  }
}

function parseReviewSection(reviewDoc, globalModel) {
  if (!reviewDoc) {
    return {
      axes: DEFAULT_AXES,
      model: globalModel,
      maxBudgetUsd: 0.5,
    }
  }

  if (typeof reviewDoc !== 'object') {
    throw new Error('Config "review" must be a mapping')
  }

  const model = reviewDoc.model ?? globalModel
  const maxBudgetUsd = reviewDoc.max_budget_usd ?? 0.5

  let axes
  if (!reviewDoc.axes) {
    axes = DEFAULT_AXES
  } else {
    if (!Array.isArray(reviewDoc.axes)) {
      throw new Error('Config "review.axes" must be a list')
    }
    const builtinByName = Object.fromEntries(DEFAULT_AXES.map((a) => [a.name, a]))
    const seen = new Set()
    axes = []
    for (const entry of reviewDoc.axes) {
      if (typeof entry === 'string') {
        if (seen.has(entry)) continue
        seen.add(entry)
        const builtin = builtinByName[entry]
        axes.push(builtin ?? { name: entry, description: entry })
      } else if (entry && typeof entry === 'object') {
        if (!entry.name || typeof entry.name !== 'string') {
          throw new Error('Each review axis object must have a "name" string field')
        }
        if (seen.has(entry.name)) continue
        seen.add(entry.name)
        const builtin = builtinByName[entry.name]
        const description = entry.description ?? builtin?.description ?? entry.name
        axes.push({ name: entry.name, description })
      } else {
        throw new Error('Each review axis must be a string or an object with a "name" field')
      }
    }
    if (axes.length === 0) {
      throw new Error('Config "review.axes" must contain at least one axis')
    }
  }

  return { axes, model, maxBudgetUsd }
}
