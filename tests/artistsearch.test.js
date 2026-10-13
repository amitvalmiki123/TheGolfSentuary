import assert from 'node:assert/strict'
import { test } from 'node:test'
import { creditedArtistNames, findArtistForSearch } from '../src/lib/artistsearch.js'

const known = [{ name: 'Arijit Singh' }, { name: 'Diljit Dosanjh' }, { name: 'Shreya Ghoshal' }]
const arijitTracks = [
  { title: 'Gehra Hua', artist: 'Shashwat Sachdev, Arijit Singh, Irshad Kamil', artistCredits: [{ name: 'Shashwat Sachdev' }, { name: 'Arijit Singh' }, { name: 'Irshad Kamil' }] },
  { title: 'Tum Hi Ho', artist: 'Mithoon, Arijit Singh', album: 'Aashiqui 2', artistCredits: [{ name: 'Mithoon' }, { name: 'Arijit Singh' }] },
  { title: 'Apna Bana Le', artist: 'Arijit Singh', artistCredits: [{ name: 'Arijit Singh' }] },
]

test('artist search: full artist name resolves to that artist profile', () => {
  assert.equal(findArtistForSearch('Arijit singh', arijitTracks, known)?.name, 'Arijit Singh')
})

test('artist search: one-word artist keyword resolves using result credits', () => {
  assert.equal(findArtistForSearch('Arijit', arijitTracks, known)?.name, 'Arijit Singh')
  assert.equal(findArtistForSearch('Mithoon', arijitTracks, known)?.name, 'Mithoon')
})

test('artist search: artist name plus generic words still shows the artist', () => {
  assert.equal(findArtistForSearch('Arijit Singh songs', arijitTracks, known)?.name, 'Arijit Singh')
  assert.equal(findArtistForSearch('Diljit latest songs', [], known)?.name, 'Diljit Dosanjh')
})

test('artist search: a song-title search does not promote its singer', () => {
  assert.equal(findArtistForSearch('Tum Hi Ho', arijitTracks, known), null)
  assert.equal(findArtistForSearch('Gehra Hua', arijitTracks, known), null)
  assert.equal(findArtistForSearch('Punjabi', arijitTracks, known), null)
})

test('artist search: credited names strip only a real trailing album suffix', () => {
  assert.deepEqual(
    creditedArtistNames({ artist: 'Mithoon, Arijit Singh - Aashiqui 2', album: 'Aashiqui 2' }),
    ['Mithoon', 'Arijit Singh'],
  )
  assert.deepEqual(
    creditedArtistNames({ artist: 'Javed - Mohsin', album: 'Jalebi' }),
    ['Javed - Mohsin'],
  )
})
