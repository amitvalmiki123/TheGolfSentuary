import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

// Static contract for the notification seekbar fix. The native service
// cannot be compiled or run in this sandbox (no Android SDK) and the OEM
// panel behaviour was only ever visible on the phone, so these assertions
// pin the publication SEQUENCE in source; the behaviour itself is verified
// by the user's phone test. playwright-free source contract tests.
const java = await readFile(new URL('../brand/android-native/NowPlayingService.java', import.meta.url), 'utf8')

function bodyOf(fnName) {
  const start = java.indexOf(fnName)
  assert.ok(start >= 0, `${fnName} must exist`)
  return java.slice(start, start + 2200)
}

test('seekbar: first valid duration publishes metadata, reposts, then re-publishes state', () => {
  const b = bodyOf('private void publishSeekbarOnce()')
  const iSession = b.indexOf('updateSession()')
  const iPost = b.indexOf('startForegroundNow()')
  const iStateAfter = b.indexOf('updatePos()', iPost)
  assert.ok(iSession >= 0 && iPost > iSession, 'metadata must be published before the repost')
  assert.ok(iStateAfter > iPost, 'playback state must be re-published AFTER the repost')
})

test('seekbar: exactly one delayed refresh, guarded by the same track duration', () => {
  const b = bodyOf('private void publishSeekbarOnce()')
  assert.match(b, /postDelayed\(/)
  assert.match(b, /durAnnouncedFor != \(long\)\(durSec \* 1000\)/)
  // The delayed block repeats the full publication once, no loop constructs.
  const delayed = b.slice(b.indexOf('postDelayed('))
  assert.equal((delayed.match(/startForegroundNow\(\)/g) || []).length, 1)
  assert.ok(!/while\s*\(|for\s*\(/.test(delayed), 'delayed refresh must be one-shot')
})

test('seekbar: announcement resets on real track change, never reuses previous duration', () => {
  const b = bodyOf('private void onTrackChangedNative()')
  assert.match(b, /durPosted = -1/)
  assert.match(b, /durAnnouncedFor = -1/)
  assert.match(b, /durSec = 0/)
})

test('seekbar: first-duration branch routes through publishSeekbarOnce, position ticks stay state-only', () => {
  const b = bodyOf('private void updatePos()')
  assert.match(b, /publishSeekbarOnce\(\)/)
  // After the first-duration branch returns, the ordinary tick path still
  // only sets PlaybackState (with ACTION_SEEK_TO) and never re-delivers
  // metadata every tick — the marquee/flicker guard.
  const tick = b.slice(b.indexOf('publishSeekbarOnce()'))
  assert.match(tick, /ACTION_SEEK_TO/)
  assert.ok(!tick.slice(tick.indexOf('long posMs')).includes('setMetadata'), 'ticks must not re-post metadata')
})

test('seekbar: metadata duration and playback state stay in milliseconds', () => {
  const s = bodyOf('private void updateSession()')
  assert.match(s, /METADATA_KEY_DURATION, \(long\)\(durSec \* 1000\)/)
  const u = bodyOf('private void updatePos()')
  assert.match(u, /\(long\)\(posSec \* 1000\)/)
})
