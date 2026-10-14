import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

// Static contract for the earbuds/Bluetooth-pause regression. The OEM
// Bluetooth/QS routing is only observable on the phone, so these assertions
// pin the native delivery/publication sequence in source; the behaviour
// itself is verified by the user's phone test. playwright-free tests.
const java = await readFile(new URL('../brand/android-native/NowPlayingService.java', import.meta.url), 'utf8')

function bodyOf(marker) {
  const start = java.indexOf(marker)
  assert.ok(start >= 0, `${marker} must exist`)
  return java.slice(start, start + 2600)
}

test('transport: media-session callbacks use the eager transport dispatcher', () => {
  assert.match(java, /public void onPlay\(\)\s*\{\s*dispatchTransportAction\("play"\);/)
  assert.match(java, /public void onPause\(\)\s*\{\s*dispatchTransportAction\("pause"\);/)
  assert.match(java, /public void onSkipToNext\(\)\s*\{\s*dispatchTransportAction\("next"\);/)
  assert.match(java, /public void onSkipToPrevious\(\)\s*\{\s*dispatchTransportAction\("prev"\);/)
})

test('transport: play/pause publishes native state before relying on the JS round-trip', () => {
  const b = bodyOf('private void dispatchTransportAction(String a)')
  const iPlaying = b.indexOf('playing = "play".equals(a);')
  const iSend = b.indexOf('send(a);')
  const iPublish = b.indexOf('updateStateOnly();', iSend)
  assert.ok(iPlaying >= 0 && iSend > iPlaying, 'native playing flag must be set before forwarding the action')
  assert.ok(iPublish > iSend, 'session/notification state must be re-published for external controls')
  assert.match(b, /mediaSession\.setActive\(true\)/)
})

test('transport: every action wakes the WebView before both delivery channels', () => {
  const b = bodyOf('private void send(String a)')
  const iWake = b.indexOf('wakeWebView();')
  const iListener = b.indexOf('l.onAction(a);')
  const iEval = b.indexOf('w.evaluateJavascript(')
  assert.ok(iWake >= 0 && iListener > iWake, 'WebView must be resumed before the plugin-listener delivery')
  assert.ok(iEval > iListener, 'zero-bridge eval remains the second, bridge-independent delivery')
  const wake = bodyOf('private void wakeWebView()')
  assert.match(wake, /resumeTimers\(\)/)
  assert.match(wake, /onResume\(\)/)
})

test('transport: an unconfirmed play/pause is retried only inside a bounded window', () => {
  assert.match(java, /pendingTransportUntil = SystemClock\.elapsedRealtime\(\) \+ 4000;/)
  const b = bodyOf('private void reconcilePendingTransport(boolean jsPlaying)')
  assert.match(b, /jsPlaying == wantPlaying/)
  assert.match(b, /SystemClock\.elapsedRealtime\(\) > pendingTransportUntil/)
  assert.match(b, /pendingTransportAction = "";/)
  assert.match(b, /send\(pending\);/)
  assert.ok(!/while\s*\(|for\s*\(/.test(b), 'retry must be ticker-driven and bounded, never a loop')
})

test('transport: both WebView state mirrors feed the pending-action reconciliation', () => {
  assert.equal((java.match(/reconcilePendingTransport\(pl\)/g) || []).length, 2)
})

test('transport: notification buttons keep their explicit eager actions', () => {
  assert.match(java, /ACTION_PLAY\.equals\(a\)\)\s*\{\s*dispatchTransportAction\("play"\);/)
  assert.match(java, /ACTION_PAUSE\.equals\(a\)\)\s*\{\s*dispatchTransportAction\("pause"\);/)
  assert.match(java, /ACTION_PREV\.equals\(a\)\)\s*\{\s*dispatchTransportAction\("prev"\);/)
  assert.match(java, /ACTION_NEXT\.equals\(a\)\)\s*\{\s*dispatchTransportAction\("next"\);/)
})
