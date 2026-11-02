import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

// Build 133 "Smart Queue / Radio Mode" — static contract for the parts that
// are structural rather than behavioural: the frozen backend, the additive
// IndexedDB migration, the settings toggle and the source chips.
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const db = await readFile(new URL('../src/lib/db.js', import.meta.url), 'utf8')
const model = await readFile(new URL('../src/lib/playbackcontext.js', import.meta.url), 'utf8')
const pro = await readFile(new URL('../src/lib/pro.js', import.meta.url), 'utf8')
const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8')
const capacitor = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'))

test('build133: no backend route is added or changed (production API frozen)', () => {
  // Radio seeds through the EXISTING /api/tracks?category= client helper.
  assert.match(app, /trendingByCategory\(category, 30\)/)
  assert.ok(!/\/api\/radio/i.test(app), 'no new radio endpoint may be introduced')
  assert.ok(!/playbackcontext|smartqueue|radio/i.test(server), 'the server must stay untouched by this build')
})

test('build133: IndexedDB migration is additive and versioned', () => {
  assert.match(db, /const DB_VERSION = 2/)
  assert.match(db, /const PLAYBACK_STORE = 'playback'/)
  assert.match(db, /if\(!db\.objectStoreNames\.contains\(PLAYBACK_STORE\)\)\{\s*db\.createObjectStore\(PLAYBACK_STORE, \{ keyPath: 'id' \}\)/)
  // Existing stores are only created when missing, never dropped/renamed.
  assert.ok(!/deleteObjectStore/.test(db), 'an upgrade must never drop an existing store')
  assert.match(db, /export const PLAYBACK_SCHEMA = 1/)
  assert.match(db, /export function sanitizePlaybackState/)
  assert.match(app, /await loadPlaybackState\(\)/)
  assert.match(app, /savePlaybackState\(\{ queue, index: currentIndex, context: playbackCtx, afterSearch \}\)/)
})

test('build133: search rows opt into the search context; play-next/queue-add are wired', () => {
  assert.match(app, /contextForPlay\('search', \{ id: search \}\)/)
  assert.match(app, /playNextInQueue/)
  assert.match(app, /addToQueueManual/)
  assert.match(app, /insertPlayNext\(base, at, track, 'Play next'\)/)
  assert.match(app, /appendToQueue\(prev, track, 'Added to queue'\)/)
  // the model keeps the radio seed and the origin surface
  assert.match(model, /export function resolvePlaySession/)
  assert.match(model, /export function pickRadioTracks/)
  assert.match(model, /export function radioCategoryOrder/)
})

test('build133: queue screens render a source chip and Settings exposes the toggle', () => {
  assert.equal((app.match(/<QueueSourceChip label=\{queueChip\((?:t|current)\)\}/g) || []).length, 3)
  assert.match(app, /aria-label="After search: Related radio"/)
  assert.match(app, /aria-label="After search: Continue search list"/)
  assert.match(app, /After search play/)
  assert.match(app, /normalizeAfterSearch\(localStorage\.getItem\('sur_after_search'\)\)/)
})

test('build133: guarded behaviours are untouched', () => {
  // MAXMUSIC79 pro code + UPI approval flow + updater/web gating
  assert.match(app, /const PRO_CODES = \['MAXMUSIC79'\]/)
  assert.match(pro, /UPI_ID = 'amitvalmiki502@paytm'|amitvalmiki502@paytm/)
  assert.match(app, /if\(!isNativeApp\(\) \|\| updChecking\) return/)
  assert.match(app, /The web app updates automatically\./)
  // the in-app Android downloader stays
  assert.match(app, /handleDownload/)
  // signing key / package id untouched
  assert.equal(capacitor.appId, 'com.sursangam.app')
})
