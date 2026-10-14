import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categoryMatches, categoryQueries } from '../src/lib/feed.js'

const bengaliArijit = { title:'Bengali Song', artist:'Arijit Singh', language:'bengali', durationSec:200 }
const hindiArijit = { title:'Hindi Song', artist:'Arijit Singh', language:'hindi', durationSec:200 }
const punjabiTrack = { title:'Punjabi Song', artist:'Diljit Dosanjh', language:'punjabi', durationSec:200 }
const unknownLang = { title:'Mystery Song', artist:'Arijit Singh', durationSec:200 }

test('category: Hindi excludes known Bengali tracks even by a Hindi-famous singer', () => {
  assert.equal(categoryMatches(bengaliArijit, 'Hindi', ['hindi']), false)
  assert.equal(categoryMatches(hindiArijit, 'Hindi', ['hindi']), true)
})

test('category: unknown language is never relabelled into a language category', () => {
  assert.equal(categoryMatches(unknownLang, 'Hindi', ['hindi']), false)
  assert.equal(categoryMatches(unknownLang, 'Punjabi', ['punjabi']), false)
})

test('category: Punjabi is a language, not an artist-name guess', () => {
  assert.equal(categoryMatches(punjabiTrack, 'Punjabi', ['punjabi']), true)
  assert.equal(categoryMatches(hindiArijit, 'Punjabi', ['punjabi']), false)
  assert.equal(categoryMatches(punjabiTrack, 'Hindi', ['hindi']), false)
})

test('category: Love is a mood following language preference, not automatically Hindi', () => {
  assert.equal(categoryMatches(punjabiTrack, 'Love', ['punjabi']), true)
  assert.equal(categoryMatches(punjabiTrack, 'Love', ['hindi']), false)
  assert.equal(categoryMatches(bengaliArijit, 'Love', ['hindi','punjabi']), false)
  assert.ok(categoryQueries('Love', ['punjabi']).every(q => /punjabi/i.test(q)))
})

test('category: 90s uses provider year metadata only', () => {
  assert.equal(categoryMatches({ title:'Old', year:1995 }, '90s', ['hindi'], 2026), true)
  assert.equal(categoryMatches({ title:'Newer', year:2005 }, '90s', ['hindi'], 2026), false)
  assert.equal(categoryMatches({ title:'Unknown year' }, '90s', ['hindi'], 2026), false)
})

test('category: New drops old-year tracks, keeps current ones', () => {
  assert.equal(categoryMatches({ title:'Fresh', year:2026 }, 'New', ['hindi'], 2026), true)
  assert.equal(categoryMatches({ title:'Old', year:2010 }, 'New', ['hindi'], 2026), false)
})
