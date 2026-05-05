export function buildReviewPrompt(taskPrompt, axes) {
  const axesBlock = axes.map((a) => `- ${a.name}: ${a.description}`).join('\n')

  return `You are reviewing a code change made by an AI coding assistant in a repository you have full access to.

## Task that was given to the assistant
${taskPrompt}

## Your context
You have access to the full repository. Use \`git diff HEAD~1\` or \`git log --oneline\` to find the base commit, then \`git diff <base>\` to see the exact changes. Inspect related files to understand the codebase conventions, patterns, and context.

## Scoring instructions
Score the change on each axis below from 0 to 100.
- 0 means the change completely fails on this axis.
- 50 means acceptable but unremarkable.
- 100 means exceptional.

If an axis is not applicable to this change (e.g., "localized" for a change that touches no user-facing strings), score it as null.

For each axis, respond with a score and a one-sentence justification.

## Axes
${axesBlock}

## Response format
Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "scores": {
    "<axis>": { "score": <0-100 | null>, "rationale": "<one sentence>" }
  }
}`
}
