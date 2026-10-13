// Appearance themes. The default Midnight Gold theme and the Daylight
// (day/night) theme are free for everyone; the custom colour themes are a
// Pro perk. Themes only restyle the app's own chrome (background, glows,
// glass panels, accent) — track artwork and playback are never touched.
export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight Gold',
    tagline: 'The signature look',
    mode: 'dark',
    pro: false,
    accent: '#D5AA55',
    accent2: '#C35445',
    bg: '#060306',
    glow1: '#A154D6',
    glow2: '#C35445',
    swatch: ['#060306', '#6A418E', '#D5AA55'],
  },
  {
    id: 'daylight',
    name: 'Daylight',
    tagline: 'Light and easy on the eyes',
    mode: 'light',
    pro: false,
    accent: '#B07C2E',
    accent2: '#C35445',
    bg: '#F5EFE7',
    glow1: '#E8B04B',
    glow2: '#E07856',
    swatch: ['#F5EFE7', '#E8B04B', '#C35445'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Northern lights in violet and teal',
    mode: 'dark',
    pro: true,
    accent: '#2DD4BF',
    accent2: '#A78BFA',
    bg: '#041210',
    glow1: '#0D9488',
    glow2: '#7C3AED',
    swatch: ['#041210', '#0D9488', '#A78BFA'],
  },
  {
    id: 'ember',
    name: 'Sunset Ember',
    tagline: 'Warm ember, rose and amber',
    mode: 'dark',
    pro: true,
    accent: '#FB923C',
    accent2: '#F43F5E',
    bg: '#120607',
    glow1: '#EA580C',
    glow2: '#BE123C',
    swatch: ['#120607', '#EA580C', '#F43F5E'],
  },
  {
    id: 'ocean',
    name: 'Ocean Depth',
    tagline: 'Deep sea blue with a cyan spark',
    mode: 'dark',
    pro: true,
    accent: '#38BDF8',
    accent2: '#818CF8',
    bg: '#040914',
    glow1: '#0369A1',
    glow2: '#4338CA',
    swatch: ['#040914', '#0369A1', '#38BDF8'],
  },
]

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0]
}

export function canUseTheme(themeOrId, isPro) {
  const theme = typeof themeOrId === 'string' ? themeById(themeOrId) : themeOrId
  if (!theme) return false
  return !theme.pro || !!isPro
}

// The theme that should actually render: a locked (Pro) theme falls back
// to the free default instead of leaving the app in a state the user can
// no longer change back from.
export function effectiveTheme(id, isPro) {
  const theme = themeById(id)
  return canUseTheme(theme, isPro) ? theme : THEMES[0]
}
