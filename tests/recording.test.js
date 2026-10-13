import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupeRecordings, mergeRecordings, isSameRecording, creditNames, findRecordingMatch, findSaavnMatch } from '../src/lib/recording.js'

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

test('recording: Indie YouTube rows match their exact Saavn recordings', () => {
  const lastLetterYt = { id:'piped-CLbret6z8l8', videoId:'CLbret6z8l8', title:'The Last Letter', artist:'Maan Panu', durationSec:170, audio:null, source:'YouTube • Full' }
  const lastLetterSv = { id:'saavn-nTqRmH0j-x', providerId:'saavn-nTqRmH0j', title:'The Last Letter', artist:'Maan panu, Mazaak - The Last Letter', durationSec:170, audio:'https://aac.saavncdn.com/last-letter_320.mp4', source:'Saavn • Full' }
  assert.equal(findRecordingMatch(lastLetterYt, [lastLetterSv]), lastLetterSv)

  const arzYt = { id:'piped--BJt4fCAtZE', videoId:'-BJt4fCAtZE', title:'Arz Kiya Hai | Coke Studio Bharat', artist:'Anuv Jain', durationSec:295, audio:null, source:'YouTube • Full' }
  const arzSv = { id:'saavn-cli-P2pu-x', providerId:'saavn-cli-P2pu', title:'Arz Kiya Hai | Coke Studio Bharat', artist:'Anuv Jain - Arz Kiya Hai | Coke Studio Bharat', durationSec:294, audio:'https://aac.saavncdn.com/arz_320.mp4', source:'Saavn • Full' }
  assert.equal(findRecordingMatch(arzYt, [arzSv]), arzSv)
})

test('recording: Saavn title-suffix singer still matches, a lofi cover never collapses to the original', () => {
  const findingHerYt = { id:'piped-PZtSnQBsBW0', videoId:'PZtSnQBsBW0', title:'Finding Her', artist:'Kushagra', durationSec:207, audio:null, source:'YouTube • Full' }
  const findingHerSv = { id:'saavn-DC89eVcO-x', providerId:'saavn-DC89eVcO', title:'Finding Her, Kushagra', artist:'Mohamed Alien - Finding Her, Kushagra', album:'Finding Her, Kushagra', durationSec:206, audio:'https://aac.saavncdn.com/finding-her_320.mp4', source:'Saavn • Full' }
  assert.equal(findRecordingMatch(findingHerYt, [findingHerSv]), findingHerSv)

  const HusnCoverYt = { id:'piped-wGeb5RP-riE', videoId:'wGeb5RP-riE', title:'Husn( Lofi ) (Cover)', artist:'SS Lofis Voice', durationSec:146, audio:null, source:'YouTube • Full' }
  const HusnOriginalSv = { id:'saavn-X0zxHHfs-x', providerId:'saavn-X0zxHHfs', title:'Husn', artist:'Anuv Jain - Husn', durationSec:217, audio:'https://aac.saavncdn.com/Husn_320.mp4', source:'Saavn • Full' }
  assert.equal(findRecordingMatch(HusnCoverYt, [HusnOriginalSv]), null)
  assert.equal(isSameRecording(HusnCoverYt, HusnOriginalSv), false)
})

test('recording: Saavn replacement tolerates provider artist spelling and video-length differences', () => {
  const nasheYt = { id:'piped-ZI3R0Gn5sa8', videoId:'ZI3R0Gn5sa8', title:'Nashe Si Chadh Gayi (From "Befikre")', artist:'Vishal and Sheykhar', durationSec:238, audio:null, source:'YouTube • Full' }
  const nasheSv = { id:'saavn-yshGBwsU-x', providerId:'saavn-yshGBwsU', title:'Nashe Si Chadh Gayi', artist:'Vishal & Shekhar, Arijit Singh, Caralisa Monteiro, Jaideep Sahni - Befikre', album:'Befikre', durationSec:237, audio:'https://aac.saavncdn.com/nashe_320.mp4', source:'Saavn • Full' }
  assert.equal(findSaavnMatch(nasheYt, [nasheSv]), nasheSv)

  const pehliYt = { id:'piped-pehli', videoId:'pehli-video', title:'Pehli Dafa', artist:'Atif Aslam', durationSec:290, audio:null, source:'YouTube • Full' }
  const pehliSv = { id:'saavn-pehli-x', providerId:'saavn-pehli', title:'Pehli Dafa', artist:'Atif Aslam', album:'Pehli Dafa', durationSec:274, audio:'https://aac.saavncdn.com/pehli_320.mp4', source:'Saavn • Full' }
  assert.equal(findSaavnMatch(pehliYt, [pehliSv]), pehliSv)
})

test('recording: Saavn replacement still rejects different singers and remix versions', () => {
  const samjhawanYt = { id:'piped-samjhawan', videoId:'samjhawan-video', title:'Samjhawan', artist:'Jawad Ahmed', durationSec:260, audio:null, source:'YouTube • Full' }
  const filmSamjhawanSv = { id:'saavn-samjhawan-x', providerId:'saavn-samjhawan', title:'Samjhawan', artist:'Arijit Singh, Shreya Ghoshal', album:'Humpty Sharma Ki Dulhania', durationSec:269, audio:'https://aac.saavncdn.com/samjhawan_320.mp4', source:'Saavn • Full' }
  assert.equal(findSaavnMatch(samjhawanYt, [filmSamjhawanSv]), null)

  const nasheRemixSv = { id:'saavn-nashe-remix-x', providerId:'saavn-nashe-remix', title:'Nashe Si Chadh Gayi - Remix', artist:'Vishal & Shekhar, Arijit Singh', album:'Nashe Si Chadh Gayi - Remix', durationSec:238, audio:'https://aac.saavncdn.com/nashe-remix_320.mp4', source:'Saavn • Full' }
  const nasheYt = { id:'piped-ZI3R0Gn5sa8', videoId:'ZI3R0Gn5sa8', title:'Nashe Si Chadh Gayi (From "Befikre")', artist:'Vishal and Sheykhar', durationSec:238, audio:null, source:'YouTube • Full' }
  assert.equal(findSaavnMatch(nasheYt, [nasheRemixSv]), null)
})
