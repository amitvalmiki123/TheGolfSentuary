import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupeRecordings, mergeRecordings, isSameRecording, creditNames } from '../src/lib/recording.js'

const apnaOriginal = { id:'saavn-1-a', providerId:'saavn-111', title:'Apna Bana Le', artist:'Arijit Singh, Pritam', album:'Bhediya', durationSec:261, audio:'https://cdn.test/apna.mp3', source:'Saavn • Full', cover:'https://img.test/apna.jpg' }
const apnaCompilation = { id:'saavn-2-b', providerId:'saavn-222', title:'Apna Bana Le', artist:'Pritam, Arijit Singh', album:'Romantic Hits Collection', durationSec:260, audio:'https://cdn.test/apna2.mp3', source:'Saavn • Full', cover:'https://img.test/comp.jpg' }

test('recording: compilation copy with reordered credits collapses, original album preferred', () => {
  const out = dedupeRecordings([apnaCompilation, apnaOriginal])
  assert.equal(out.length, 1)
  assert.equal(out[0].album, 'Bhediya')
})

test('recording: subset credits + same duration is the same recording', () => {
  const singerOnly = { ...apnaOriginal, id:'x1', providerId:'saavn-999', artist:'Arijit Singh', album:'Best of Arijit' }
  assert.equal(isSameRecording(apnaOriginal, singerOnly), true)
})

test('recording: distinct versions are never merged by title alone', () => {
  const reprise = { ...apnaOriginal, id:'r1', providerId:'saavn-r', title:'Apna Bana Le (Reprise)' }
  const live = { ...apnaOriginal, id:'l1', providerId:'saavn-l', title:'Apna Bana Le (Live)' }
  const remix = { ...apnaOriginal, id:'m1', providerId:'saavn-m', title:'Apna Bana Le (Remix)' }
  const acoustic = { ...apnaOriginal, id:'a1', providerId:'saavn-a', title:'Apna Bana Le (Acoustic)' }
  assert.equal(isSameRecording(apnaOriginal, reprise), false)
  assert.equal(isSameRecording(apnaOriginal, live), false)
  assert.equal(isSameRecording(apnaOriginal, remix), false)
  assert.equal(isSameRecording(apnaOriginal, acoustic), false)
  assert.equal(dedupeRecordings([apnaOriginal, reprise, live, remix, acoustic]).length, 5)
})

test('recording: same title by a different artist with different duration stays separate', () => {
  const other = { title:'Apna Bana Le', artist:'Someone Else', album:'Other Album', durationSec:180, audio:'https://cdn.test/o.mp3' }
  assert.equal(isSameRecording(apnaOriginal, other), false)
})

test('recording: ISRC identity merges across provider rows', () => {
  const a = { title:'Song X', artist:'Artist One', durationSec:200, isrc:'INABC1234567', audio:'https://cdn.test/1.mp3' }
  const b = { title:'Song X', artist:'Artist One, Composer Two', durationSec:201, isrc:'INABC1234567', audio:'https://cdn.test/2.mp3', album:'Compilation' }
  assert.equal(isSameRecording(a, b), true)
})

test('recording: credit ordering normalizes to the same credit set', () => {
  assert.deepEqual(creditNames({ artist:'Pritam, Arijit Singh' }), creditNames({ artist:'Arijit Singh, Pritam' }))
})

test('recording: mergeRecordings returns only genuinely new recordings', () => {
  const added = mergeRecordings([apnaOriginal], [apnaCompilation, { ...apnaOriginal, id:'n1', providerId:'saavn-n', title:'New Song', durationSec:100 }])
  assert.equal(added.length, 1)
  assert.equal(added[0].title, 'New Song')
})
