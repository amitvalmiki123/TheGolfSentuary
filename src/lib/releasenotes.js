// User-facing "What's New" notes for the in-app update popup.
//
// The public feed may carry curated `features` (preferred — written for
// users) and/or raw `notes` derived from git history. Only clean,
// user-facing points may ever reach the popup: merge messages, branch
// names, conventional-commit prefixes and internal trace labels are
// filtered out here so users never see developer jargon.

const TECHNICAL = [
  /merge (branch|pull request)/i,
  /^merge\b/i,
  /^(chore|ci|build|docs|test|refactor|style|fixup|squash)(\(|:)/i,
  /^publish build/i,
  /^build \d+/i,
  /\bitrace-\d+\b/i,
  /\bWIP\b/,
  /arena\//i,
  /\.java\b|\.jsx?\b|\.py\b|\.ya?ml\b/,
  /\b(commit|sha|hash)\b/i,
  /^v?\d+\.\d+(\.\d+)?\b/,
]

function tidy(line) {
  let s = String(line || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  // Drop a leading conventional-commit prefix if one survived.
  s = s.replace(/^(feat|fix|perf|ui|app)(\([^)]*\))?:\s*/i, '')
  s = s.replace(/^[-*•·\d.)\s]+/, '').trim()
  if (!s) return ''
  if (!/[.!?]$/.test(s)) s += '.'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isTechnical(line) {
  const s = String(line || '')
  return TECHNICAL.some((re) => re.test(s))
}

// Returns up to `limit` clean, user-facing highlight lines.
// Curated features always win; raw notes are only used after filtering.
export function cleanReleaseNotes(notes, features, limit = 6) {
  const fromFeatures = (Array.isArray(features) ? features : [])
    .map(tidy)
    .filter((s) => s && !isTechnical(s))
  if (fromFeatures.length) return fromFeatures.slice(0, limit)
  return (Array.isArray(notes) ? notes : [])
    .map(tidy)
    .filter((s) => s && !isTechnical(s))
    .slice(0, limit)
}
