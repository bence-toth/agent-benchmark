import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { createInterface } from 'readline'

const execFileAsync = promisify(execFile)

const DOC_FILES = ['README.md', 'CONTRIBUTING.md']

const VARIANT_LABELS = ['baseline', 'variant_b', 'variant_c', 'variant_d', 'variant_e']

export async function initBenchmark({ repoPath, variants, name }) {
  const absRepo = path.resolve(repoPath)
  await verifyGitRepo(absRepo)
  const headCommit = await getHeadCommit(absRepo)

  const foundFiles = await discoverConfigFiles(absRepo)
  if (foundFiles.length === 0) {
    console.log('No recognized config files found in the target repo.')
  } else {
    console.log(`Found config files: ${foundFiles.join(', ')}`)
  }

  const benchDir = await resolveBenchDir(name)
  await fs.mkdir(path.join(benchDir, 'variants'), { recursive: true })

  const variantKeys = VARIANT_LABELS.slice(0, variants)
  for (const key of variantKeys) {
    const variantDir = path.join(benchDir, 'variants', key)
    await fs.mkdir(variantDir, { recursive: true })
    for (const file of foundFiles) {
      const src = path.join(absRepo, file)
      const dest = path.join(variantDir, file)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.copyFile(src, dest)
    }
  }

  const id = randomBytes(4).toString('hex')
  const yaml = generateYaml(absRepo, variantKeys, foundFiles, headCommit, id)
  await fs.writeFile(path.join(benchDir, 'benchmark.yaml'), yaml)

  console.log(`\nScaffolded benchmark at: ${benchDir}`)
  console.log('Next steps:')
  console.log('  1. Edit variant files in variants/variant_b/, etc.')
  console.log('  2. Fill in the prompt in benchmark.yaml')
  console.log('  3. Customize review axes if needed (optional)')
  console.log(`  4. Run: agent-benchmark run ${benchDir}/benchmark.yaml`)
  console.log(`  5. Then: agent-benchmark review ${benchDir}/benchmark.yaml`)
}

async function verifyGitRepo(repoPath) {
  try {
    await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--git-dir'])
  } catch {
    throw new Error(`Not a git repository: ${repoPath}`)
  }
}

async function getHeadCommit(repoPath) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', 'HEAD'])
  return stdout.trim()
}

async function discoverConfigFiles(repoPath) {
  const found = []

  // Find CLAUDE.md and AGENTS.md from any location (including subfolders)
  for (const filename of ['CLAUDE.md', 'AGENTS.md']) {
    const matches = await findFileRecursive(repoPath, filename)
    found.push(...matches)
  }

  // Copy entire .claude/ folder contents
  try {
    const claudeDir = path.join(repoPath, '.claude')
    const entries = await collectDir(claudeDir, '.claude')
    found.push(...entries)
  } catch {
    // .claude/ doesn't exist
  }

  // .github/copilot-instructions.md
  try {
    await fs.access(path.join(repoPath, '.github', 'copilot-instructions.md'))
    found.push('.github/copilot-instructions.md')
  } catch {
    // doesn't exist
  }

  // Repo documentation
  for (const file of DOC_FILES) {
    try {
      await fs.access(path.join(repoPath, file))
      found.push(file)
    } catch {
      // doesn't exist
    }
  }

  return found
}

async function findFileRecursive(base, filename, rel = '') {
  const results = []
  const dir = rel ? path.join(base, rel) : base
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const relPath = rel ? path.join(rel, entry.name) : entry.name
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    if (entry.isFile() && entry.name === filename) {
      // Skip if already covered by .claude/ folder copy
      if (!relPath.startsWith('.claude' + path.sep)) {
        results.push(relPath)
      }
    } else if (entry.isDirectory() && entry.name !== '.claude') {
      results.push(...(await findFileRecursive(base, filename, relPath)))
    }
  }
  return results
}

async function collectDir(dirPath, relPrefix) {
  const results = []
  let entries
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const rel = path.join(relPrefix, entry.name)
    if (entry.isFile()) {
      results.push(rel)
    } else if (entry.isDirectory()) {
      results.push(...(await collectDir(path.join(dirPath, entry.name), rel)))
    }
  }
  return results
}

async function resolveBenchDir(name) {
  const base = name ?? 'agent-benchmark'
  const cwd = process.cwd()

  const candidate = path.join(cwd, base)
  try {
    await fs.access(candidate)
    // Directory exists – ask user what to do
    return await handleExistingDir(candidate, base, cwd)
  } catch {
    return candidate
  }
}

async function handleExistingDir(existing, base, cwd) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => {
    rl.question(
      `Directory "${existing}" already exists.\n` +
        '  (1) Use a new suffix  (2) Delete existing  (3) Cancel\nChoice: ',
      resolve,
    )
  })
  rl.close()

  if (answer.trim() === '1') {
    for (let i = 1; i <= 99; i++) {
      const next = path.join(cwd, `${base}-${i}`)
      try {
        await fs.access(next)
      } catch {
        return next
      }
    }
    throw new Error('Could not find an available benchmark directory name')
  } else if (answer.trim() === '2') {
    await fs.rm(existing, { recursive: true, force: true })
    return existing
  } else {
    process.exit(0)
  }
}

function generateYaml(repoPath, variantKeys, foundFiles, headCommit, id) {
  const variantBlocks = variantKeys
    .map((key, i) => {
      const label =
        i === 0 ? 'A – Baseline (repo as-is)' : `${String.fromCharCode(65 + i)} – Variant ${key}`
      if (foundFiles.length === 0) {
        return `  ${key}:\n    label: "${label}"\n`
      }
      const filesBlock = foundFiles.map((f) => `      ${f}: ./variants/${key}/${f}`).join('\n')
      return `  ${key}:\n    label: "${label}"\n    config_files:\n${filesBlock}\n`
    })
    .join('\n')

  return `# Generated by agent-benchmark init
# Base commit: ${headCommit}

id: ${id}

prompt: "TODO: describe the task"

model: opusplan

max_budget_usd: 1.00

repo: ${repoPath}

variants:
${variantBlocks}
review:
  axes:
    - focused
    - clear
    - conventional
    - documented
    - robust
    - concise
    - tested
    - secure

  max_budget_usd: 0.50`
}
