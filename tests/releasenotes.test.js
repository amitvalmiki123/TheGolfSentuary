import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanReleaseNotes } from '../src/lib/releasenotes.js'

test('curated features are preferred and tidied for the update popup', () => {
  const out = cleanReleaseNotes(
    ['feat: internal provider pagination'],
    ['new artist pages', 'Faster playback.'],
  )
  assert.deepEqual(out, ['New artist pages.', 'Faster playback.'])
})

test('technical git notes never reach users', () => {
  const out = cleanReleaseNotes([
    "Merge branch 'arena/45833986-thegolfsentuary'",
    'chore: bump version.json to build 109 [skip ci]',
    'itrace-28 notification identity in NowPlayingService.java',
    'feat: lock screen controls respond instantly',
    'Publish Build 115',
  ], [])
  assert.deepEqual(out, ['Lock screen controls respond instantly.'])
  assert.equal(/merge|chore|itrace|arena|\.java|Publish Build/i.test(out.join(' ')), false)
})

test('empty or fully technical feeds produce no fake highlights', () => {
  assert.deepEqual(cleanReleaseNotes([], []), [])
  assert.deepEqual(cleanReleaseNotes(['Merge pull request #12'], null), [])
})

test('highlights are capped at six points', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Useful improvement ${i + 1}`)
  assert.equal(cleanReleaseNotes([], many).length, 6)
})
