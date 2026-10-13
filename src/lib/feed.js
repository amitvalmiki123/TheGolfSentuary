// feed.js — category definitions built on PROVIDER metadata, not guesses.
//
// Rules (phone feedback batch):
//  - Hindi/Punjabi are LANGUAGES: a track only belongs when its provider
//    language metadata says so. A Bengali Arijit track is not Hindi, and an
//    unknown-language track is never confidently relabelled into a language.
//  - Love is a MOOD: it follows the user's music-language preference instead
//    of silently becoming "Hindi".
//  - 90s uses provider year metadata. Bollywood requires Hindi/film metadata.
//  - Unknown metadata stays unknown: strict categories drop it rather than
//    mislabel it; only curated/unknown-total feeds (All/Trending) keep it.

export const CATEGORY_IDS = ['All', 'Hindi', 'Punjabi', 'Love', '90s', 'Bollywood', 'Indie', 'Trending', 'New']

const KNOWN_LANGS = ['hindi', 'punjabi', 'bengali', 'english', 'tamil', 'telugu', 'marathi', 'gujarati', 'kannada', 'malayalam', 'haryanvi', 'rajasthani', 'bhojpuri', 'urdu', 'odia', 'assamese']

function norm(v) { return String(v == null ? '' : v).trim().toLowerCase() }

export function trackLanguage(track) {
  const t = track || {}
  const direct = norm(t.language || t.lang)
  if (direct) return direct
  const cats = Array.isArray(t.category) ? t.category : (t.category ? [t.category] : [])
  for (const c of cats) { const l = norm(c); if (KNOWN_LANGS.includes(l)) return l }
  const orig = t.original || {}
  return norm(orig.language || (orig.more_info && orig.more_info.language) || '')
}

export function trackYear(track) {
  const t = track || {}
  const raw = t.year || t.releaseYear || t.releaseDate ||
    (t.original && (t.original.year || t.original.releaseDate ||
      (t.original.more_info && (t.original.more_info.year || t.original.more_info.release_date)))) || ''
  const m = String(raw).match(/(?:19|20)\d{2}/)
  return m ? Number(m[0]) : 0
}

function trackCategories(track) {
  const t = track || {}
  const cats = Array.isArray(t.category) ? t.category : (t.category ? [t.category] : [])
  return cats.map(norm)
}

function selLangs(langs) {
  return (Array.isArray(langs) ? langs : []).map(norm).filter(Boolean)
}

export function categoryMatches(track, cat, langs = [], nowYear = new Date().getFullYear()) {
  const lang = trackLanguage(track)
  const year = trackYear(track)
  const cats = trackCategories(track)
  const sel = selLangs(langs)
  switch (cat) {
    case 'Hindi':
      return lang === 'hindi'
    case 'Punjabi':
      return lang === 'punjabi'
    case 'Bollywood':
      return lang === 'hindi' || cats.includes('bollywood')
    case 'Love':
      // Mood, not a language: keep known languages inside the user's
      // preference; unknown-language rows from a romantic curated feed stay.
      if (lang && sel.length && !sel.includes(lang)) return false
      return true
    case '90s':
      return year >= 1990 && year <= 1999
    case 'Indie': {
      if (cats.includes('indie') || norm(track && track.genre).includes('indie')) return true
      if (lang && sel.length && !sel.includes(lang)) return false
      return true // curated indie feed; never relabelled as a language
    }
    case 'New':
      if (year && year < nowYear - 1) return false
      return true
    case 'All':
    case 'Trending':
    default:
      return true
  }
}

export function filterCategoryTracks(tracks, cat, langs = [], nowYear) {
  return (tracks || []).filter(t => t && categoryMatches(t, cat, langs, nowYear))
}

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// Ordered provider search queries for a category. Pagination walks these in
// order; a query ending means THAT query ended — never "the whole catalog".
export function categoryQueries(cat, langs = []) {
  const sel = selLangs(langs)
  const picked = sel.length ? sel : ['hindi', 'punjabi']
  switch (cat) {
    case 'Hindi':
      return ['Hindi songs', 'Bollywood Hindi songs', 'Hindi romantic songs']
    case 'Punjabi':
      return ['Punjabi songs', 'Punjabi romantic songs', 'Punjabi sad songs']
    case 'Love':
      return [...new Set(picked.map(l => `${cap(l)} romantic love songs`))]
    case '90s':
      return [...new Set(picked.map(l => `90s ${cap(l)} songs`)), '90s Bollywood songs']
    case 'Bollywood':
      return ['Bollywood songs', 'Hindi film songs', 'Bollywood romantic songs']
    case 'Indie':
      return ['Indian indie songs', ...picked.map(l => `${cap(l)} indie songs`)]
    case 'New':
      return [...picked.map(l => `New ${cap(l)} songs`), 'New Hindi Punjabi songs']
    case 'Trending':
      return ['Trending songs India', ...picked.map(l => `Trending ${cap(l)} songs`)]
    case 'All':
    default:
      return [...picked.map(l => `${cap(l)} songs`), 'Top songs India']
  }
}
