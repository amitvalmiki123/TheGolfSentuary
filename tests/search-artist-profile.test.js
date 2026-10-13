import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('search artist profile: query detection feeds a top-of-results artist card', () => {
  assert.match(app, /findArtistForSearch\(queryAtStart, tracks \|\| \[\], allArtists\)/)
  assert.match(app, /fetchArtistProfile\(found\.name\)/)
  assert.match(app, /searchArtist\.query===search/)
  assert.match(app, /Open artist page for all credited songs/)
})

test('search artist profile: card opens the existing dedicated artist page', () => {
  assert.match(app, /onClick=\{\(\)=> handleArtistClick\(searchArtist\)\}/)
  assert.match(app, /View artist →/)
})

test('search artist profile: normal results stay below the artist card', () => {
  const card = app.indexOf('Open artist page for all credited songs')
  const results = app.indexOf('Top Results — Online', card)
  assert.ok(card >= 0 && results > card, 'artist card must render before the normal music list')
})
