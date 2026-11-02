import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { transformWithEsbuild } from 'vite'
import { createDom, fakeYouTube } from './helpers/playback-dom.js'

// Build 133 — "Smart Queue / Radio Mode" integration contract.
//
// The REAL App is compiled; only network + native + database boundaries are
// mocked. The fixtures model the user's bug report: a search for
// "dooriyan - love aaj kal" returns the song plus unrelated versions, and the
// song's primary category is "sad love". After it plays, auto-advance must
// come from the sad-love radio pool — never from search result #2.

let importId = 0
async function loadApp() {
  const cache = path.resolve('node_modules/.cache/maxmusic-smartqueue-tests')
  await mkdir(cache, { recursive: true })
  let source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const api = {
    apiBase: '()=>null',
    trendingByCategory: 'async(cat)=>globalThis.__queueFixture.pools[cat]||[]',
    unifiedSearch: 'async()=>globalThis.__queueFixture.search',
    searchSuggestions: 'async()=>[]',
    searchPiped: 'async()=>({tracks:[],nextpage:null})',
    unifiedSearchPaginated: 'async()=>({tracks:[],nextpage:null})',
    fetchCategoryPage: 'async()=>({tracks:[],nextCursor:null,total:null})',
    artistSongsPaginated: 'async()=>({tracks:[],nextpage:null})',
    getRelatedTracks: 'async()=>[]',
    artistSongs: 'async()=>[]',
    searchSaavn: 'async()=>[]',
    mergeDedup: '(old,fresh)=>(fresh||[]).filter(x=>!(old||[]).some(y=>String(y.id)===String(x.id)))',
    isAuthEnabled: '()=>false', getAuthToken: '()=>null', getLastSearchNextpage: '()=>null',
    resolveDirectAudio: 'async()=>null',
    resolvePipedAudio: 'async()=>null',
    findSaavnRecording: 'async()=>null',
  }
  const native = {
    isNativeApp: '()=>false',
    npStart: '()=>()=>{}', npUpdate: 'meta=>{ window.__np=meta }', npStop: '()=>{}',
    npDisabled: '()=>false', npLastCrash: 'async()=>""', npNotifGranted: 'async()=>true',
    npAskNotif: 'async()=>true', npAskBattery: 'async()=>true', npOpenNotifSettings: '()=>{}',
    npPing: 'async()=>({plugin:true,service:true,notif:true})',
    npBridgeMode: '()=>"test"', hasNativeBridge: '()=>false', wvGuess: '()=>false',
  }
  for (const lib of ['api', 'db', 'nowplaying', 'updater']) {
    const match = source.match(new RegExp(`import \\{ ([^\\n]+) \\} from '\\./lib/${lib}\\.js'`))
    assert.ok(match, `App import missing: ${lib}`)
    const code = match[1].split(',').map(name => {
      name = name.trim()
      if (name === 'APP_BUILD_NO') return 'export const APP_BUILD_NO=133;'
      const fn = lib === 'api' ? api[name] : lib === 'nowplaying' ? native[name] : undefined
      if (name === 'checkAppUpdate') return 'export const checkAppUpdate=async()=>({version:"1.0.0",build:133,hasUpdate:false,notes:[]});'
      return `export const ${name}=${fn || 'async()=>[]'};`
    }).join('\n')
    const file = path.join(cache, `${lib}.mjs`)
    await writeFile(file, code)
    source = source.replace(`'./lib/${lib}.js'`, JSON.stringify(pathToFileURL(file).href))
  }
  // Real, dependency-free sources: identity/metadata + the new context model.
  for (const mod of ['trackmeta', 'pager', 'themes', 'artistsearch', 'pro', 'playbackcontext']) {
    const src = await readFile(new URL(`../src/lib/${mod}.js`, import.meta.url), 'utf8')
    await mkdir(path.join(cache, 'lib'), { recursive: true })
    const file = path.join(cache, 'lib', `${mod}.js`)
    await writeFile(file, src)
    source = source.replace(`'./lib/${mod}.js'`, JSON.stringify(pathToFileURL(file).href))
  }
  const controls = await readFile(new URL('../src/components/ApkUpdateControls.jsx', import.meta.url), 'utf8')
  const controlsSource = controls.replace("'../lib/apkupdate.js'", JSON.stringify(new URL('../src/lib/apkupdate.js', import.meta.url).href))
  const compiledControls = await transformWithEsbuild(controlsSource, 'ApkUpdateControls.jsx', { loader: 'jsx', jsx: 'automatic' })
  const controlsFile = path.join(cache, 'ApkUpdateControls.mjs')
  await writeFile(controlsFile, compiledControls.code)
  source = source.replace("'./components/ApkUpdateControls.jsx'", JSON.stringify(pathToFileURL(controlsFile).href))
  const { code } = await transformWithEsbuild(source, 'App.jsx', {
    loader: 'jsx', jsx: 'automatic', jsxImportSource: 'react',
    define: { 'import.meta.env': '{"BASE_URL":"/","VITE_APP_BUILD_NO":"133"}' },
  })
  const file = path.join(cache, 'App.mjs')
  await writeFile(file, code)
  return (await import(pathToFileURL(file).href + `?run=${++importId}`)).default
}

const mk = (id, title, category, extra = {}) => ({
  id, title, artist: 'Fixture artist', album: 'Fixture album', cover: '',
  audio: `https://maxmusic.test/${id}.mp3`, videoId: null,
  durationSec: 180, durationLabel: '3:00', source: 'Saavn • Full', category, ...extra,
})

function fixtures() {
  return {
    search: [
      mk('search-1', 'Dooriyan', ['sad love', 'Hindi']),
      mk('search-2', 'Dooriyan (Remix by other artist)', ['Hindi']),
      mk('search-3', 'Dooriyan Lofi Flip', ['Hindi']),
    ],
    pools: {
      Trending: [mk('home-1', 'Home track one', ['Hindi']), mk('home-2', 'Home track two', ['Hindi'])],
      'sad love': [
        mk('radio-1', 'Sad love one', ['sad love']),
        mk('radio-2', 'Sad love two', ['sad love']),
        mk('radio-3', 'Sad love three', ['sad love']),
        mk('radio-4', 'Sad love four', ['sad love']),
      ],
      Love: [mk('love-1', 'Love fallback one', ['Love'])],
    },
    playlist: {
      id: 'pl-test',
      title: 'Road Trip',
      subtitle: 'Test playlist',
      cover: '',
      count: '3 songs',
      songs: ['trip-1', 'trip-2', 'trip-3'],
      tracks: [
        mk('trip-1', 'Trip one', ['Punjabi']),
        mk('trip-2', 'Trip two', ['Punjabi']),
        mk('trip-3', 'Trip three', ['Punjabi']),
      ],
    },
  }
}

async function mount({ beforeRender } = {}) {
  const env = await createDom()
  globalThis.__queueFixture = fixtures()
  globalThis.__queueFixture.native = false
  fakeYouTube(env.window)
  const App = await loadApp()
  env.clock.install()
  if (beforeRender) beforeRender(env)
  const root = env.root()
  await act(async () => root.render(React.createElement(App)))
  await flush()
  const buttons = (label) => [...env.document.querySelectorAll(`button[aria-label="${label}"]`)]
  const click = async (button) => {
    assert.ok(button, 'button must exist')
    await act(async () => button.dispatchEvent(new env.window.MouseEvent('click', { bubbles: true })))
    await flush()
  }
  const clickText = async (text, exact = true) => {
    const button = [...env.document.querySelectorAll('button')].find(b => {
      const value = (b.textContent || '').trim()
      return exact ? value === text : value.includes(text)
    })
    await click(button)
  }
  const typeSearch = async (value) => {
    const input = env.document.querySelector('input[type="search"]')
    assert.ok(input, 'search input must exist')
    const setter = Object.getOwnPropertyDescriptor(env.window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(input, value)
      input.dispatchEvent(new env.window.Event('input', { bubbles: true }))
    })
    await act(async () => { env.clock.tick(400) })
    await flush()
  }
  const chips = () => [...env.document.querySelectorAll('[data-source-chip]')].map(el => el.getAttribute('data-source-chip'))
  const nextUpRows = () => {
    const heading = [...env.document.querySelectorAll('div')].find(el => el.textContent.trim() === 'NEXT UP')
    if (!heading) return []
    const list = heading.nextElementSibling
    return [...(list ? list.querySelectorAll('button') : [])].map(b => ({
      text: b.textContent.trim(),
      chip: (b.querySelector('[data-source-chip]') || {}).getAttribute?.('data-source-chip') || '',
    }))
  }
  const npTitle = () => String((env.window.__np && env.window.__np.title) || '')
  const openQueue = async () => {
    const toggle = buttons('Open queue')[0]
    await click(toggle)
  }
  const close = () => { env.close(); delete globalThis.__queueFixture }
  return { env, buttons, click, clickText, typeSearch, chips, nextUpRows, npTitle, openQueue, close }
}

async function flush() {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() })
}

const playSearchResult = async (app, title) => {
  const row = [...app.env.document.querySelectorAll('button')].find(b => {
    if (b.getAttribute('aria-label')) return false
    return (b.textContent || '').includes(title)
  })
  assert.ok(row, `search result "${title}" must be tappable`)
  await app.click(row)
}

const RADIO_TITLES = ['Sad love one', 'Sad love two', 'Sad love three', 'Sad love four']
const clickPlayNextOnResult = async (app, title) => {
  const button = [...app.env.document.querySelectorAll('button[aria-label="Play next"]')].find(b => {
    const row = b.closest('.group')
    return row && (row.textContent || '').includes(title)
  })
  assert.ok(button, `"Play next" must exist on the "${title}" row`)
  await app.click(button)
}

test('search play switches auto-advance to the track category radio (never search result #2)', async () => {
  const random = Math.random
  Math.random = () => 0 // deterministic radio shuffle for this mount
  const app = await mount()
  try {
    await app.typeSearch('dooriyan - love aaj kal')
    await playSearchResult(app, 'Dooriyan')
    assert.equal(app.npTitle(), 'Dooriyan')

    // The chosen song's row carries the SEARCH chip; the radio rows that follow
    // carry the seeded category chip.
    await app.openQueue()
    const chips = app.chips()
    assert.ok(chips.includes('Search: dooriyan - love aaj kal'), `queue should show the search chip, got ${JSON.stringify(chips)}`)
    assert.ok(chips.includes('Sad Love radio'), `queue should show the radio chip, got ${JSON.stringify(chips)}`)
    assert.ok(!chips.some(c => c.includes('Dooriyan (Remix')), 'search results must not become queue rows')

    // Auto-advance (skip) lands inside the sad-love radio pool.
    await app.click(app.buttons('Next track')[0])
    assert.ok(RADIO_TITLES.includes(app.npTitle()), `skip must stay in the seeded radio, got ${app.npTitle()}`)
    assert.notEqual(app.npTitle(), 'Dooriyan (Remix by other artist)')

    // And the next chip on the newly playing radio row is the radio label.
    const rows = app.nextUpRows()
    assert.ok(rows.length >= 1)
    assert.ok(rows.every(r => r.chip === 'Sad Love radio'), `radio rows keep their chip: ${JSON.stringify(rows)}`)
    assert.deepEqual(app.env.errors, [])
  } finally {
    Math.random = random
    app.close()
  }
})

test('when the search-played track ENDS, radio takes over automatically', async () => {
  const random = Math.random
  Math.random = () => 0
  const app = await mount()
  try {
    await app.typeSearch('dooriyan - love aaj kal')
    await playSearchResult(app, 'Dooriyan')
    await app.openQueue()
    assert.ok(app.chips().includes('Sad Love radio'))

    // Same ENDED path the <audio>/YT engines use.
    const audio = app.env.document.querySelector('audio')
    assert.ok(audio, 'audio element must exist')
    await act(async () => {
      audio.__playing = false
      audio.dispatchEvent(new app.env.window.Event('ended'))
    })
    await flush()

    assert.ok(RADIO_TITLES.includes(app.npTitle()), `end must advance into radio, got ${app.npTitle()}`)
    assert.ok(!app.npTitle().includes('Remix'), 'the old bug continued the raw search list')
    assert.equal(app.env.window.__np.state, 'playing')
    assert.deepEqual(app.env.errors, [])
  } finally {
    Math.random = random
    app.close()
  }
})

test('explicit "play next" outranks radio and keeps its priority on skip', async () => {
  const random = Math.random
  Math.random = () => 0
  const app = await mount()
  try {
    await app.typeSearch('dooriyan - love aaj kal')
    await playSearchResult(app, 'Dooriyan')
    await app.openQueue()
    assert.ok(app.chips().includes('Sad Love radio'), 'radio should already be queued')

    // Ask for a search row to play next.
    await clickPlayNextOnResult(app, 'Dooriyan (Remix by other artist)')
    const rows = app.nextUpRows()
    assert.ok(rows.length >= 2, `queue rows expected, got ${JSON.stringify(rows)}`)
    assert.ok(rows[0].text.includes('Dooriyan (Remix by other artist)'), `play next must be first: ${JSON.stringify(rows)}`)
    assert.equal(rows[0].chip, 'Play next')
    assert.equal(rows[1].chip, 'Sad Love radio', 'radio stays behind the explicit request')

    await app.click(app.buttons('Next track')[0])
    assert.equal(app.npTitle(), 'Dooriyan (Remix by other artist)')
    await app.click(app.buttons('Next track')[0])
    assert.ok(RADIO_TITLES.includes(app.npTitle()), `after the explicit track, radio resumes (got ${app.npTitle()})`)
    assert.deepEqual(app.env.errors, [])
  } finally {
    Math.random = random
    app.close()
  }
})

test('playlist play keeps advancing inside that playlist with a playlist chip', async () => {
  const app = await mount({
    beforeRender: (env) => {
      env.window.localStorage.setItem('sur_playlists', JSON.stringify([globalThis.__queueFixture.playlist]))
    },
  })
  try {
    await app.clickText('Your Library', false)
    const card = app.env.document.querySelector('[data-playlist-id="pl-test"]')
    assert.ok(card, 'seeded playlist card must render')
    const play = [...card.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Play')
    await app.click(play)
    assert.equal(app.npTitle(), 'Trip one')

    await app.openQueue()
    assert.ok(app.chips().includes('Road Trip'), `playlist chip expected, got ${JSON.stringify(app.chips())}`)
    const rows = app.nextUpRows()
    assert.equal(rows[0].text.includes('Trip two'), true)
    assert.equal(rows[0].chip, 'Road Trip')

    await app.click(app.buttons('Next track')[0])
    assert.equal(app.npTitle(), 'Trip two')
    await app.click(app.buttons('Next track')[0])
    assert.equal(app.npTitle(), 'Trip three')
    assert.deepEqual(app.env.errors, [])
  } finally {
    app.close()
  }
})

test('settings toggle restores the old "continue search list" behaviour', async () => {
  const random = Math.random
  Math.random = () => 0
  const app = await mount()
  try {
    await app.clickText('Profile', false)
    await app.clickText('Settings')
    const radioToggle = app.buttons('After search: Related radio')[0]
    assert.ok(radioToggle, 'the radio option must exist in Settings')
    assert.equal(radioToggle.getAttribute('aria-pressed'), 'true', 'radio is the default')
    await app.click(app.buttons('After search: Continue search list')[0])
    assert.equal(app.env.window.localStorage.getItem('sur_after_search'), 'continue')
    assert.equal(app.buttons('After search: Continue search list')[0].getAttribute('aria-pressed'), 'true')

    await app.typeSearch('dooriyan - love aaj kal')
    await playSearchResult(app, 'Dooriyan')
    await app.openQueue()
    assert.ok(app.chips().includes('Search: dooriyan - love aaj kal'))
    assert.ok(!app.chips().includes('Sad Love radio'), 'old behaviour: no radio rows')

    const rows = app.nextUpRows()
    assert.ok(rows[0].text.includes('Dooriyan (Remix by other artist)'), `search list continues: ${JSON.stringify(rows)}`)
    await app.click(app.buttons('Next track')[0])
    assert.equal(app.npTitle(), 'Dooriyan (Remix by other artist)')
    assert.deepEqual(app.env.errors, [])
  } finally {
    Math.random = random
    app.close()
  }
})

test('radio falls back to a related category when the seed pool is exhausted', async () => {
  const random = Math.random
  Math.random = () => 0
  const app = await mount({
    beforeRender: (env) => {
      env.window.localStorage.setItem('sur_after_search', 'radio')
    },
  })
  try {
    // The fixture's "sad love" pool is emptied for this mount, so only the
    // related "Love" category can supply radio.
    globalThis.__queueFixture.pools['sad love'] = []
    await app.typeSearch('dooriyan - love aaj kal')
    await playSearchResult(app, 'Dooriyan')
    await app.openQueue()
    assert.ok(app.chips().includes('Love radio'), `fallback chip expected, got ${JSON.stringify(app.chips())}`)
    await app.click(app.buttons('Next track')[0])
    assert.equal(app.npTitle(), 'Love fallback one')
    assert.deepEqual(app.env.errors, [])
  } finally {
    Math.random = random
    app.close()
  }
})
