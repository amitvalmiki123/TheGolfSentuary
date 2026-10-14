import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { checkAppUpdate } from '../src/lib/updater.js'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const features = JSON.parse(await readFile(new URL('../docs/release-features.json', import.meta.url), 'utf8'))
const sidebar = app.slice(app.indexOf('{/* Sidebar */}'), app.indexOf('</aside>'))
const header = app.slice(app.indexOf('<header className='), app.indexOf('</header>'))
const popup = app.slice(app.indexOf('{/* itrace-27: app update popup */}'), app.indexOf('{/* Full player */}'))

test('sidebar respects dynamic viewport and scrolls both navigation and shrinking mixes', () => {
  assert.match(sidebar, /h-dvh max-h-dvh min-h-0/)
  assert.match(sidebar, /shrink min-h-0 overflow-y-auto/)
  assert.match(sidebar, /flex-1 shrink min-h-0 overflow-hidden flex flex-col/)
  assert.match(sidebar, /overflow-y-auto overscroll-contain[^"\n]*flex-1 min-h-0/)
  assert.match(sidebar, /min-w-0 flex-1[^\n]*truncate/)
  assert.match(sidebar, /No mixes yet/)
  assert.doesNotMatch(sidebar, /₹119|Go Premium|Try 1 month free/)
})

test('header uses the active theme for all chrome, and has labelled local picker but no dead bell', () => {
  assert.match(header, /activeTheme\.bg.*activeTheme\.accent.*boxShadow/)
  assert.match(header, /backgroundColor: activeTheme\.mode === 'light'/)
  assert.match(header, /backgroundColor: `\$\{activeTheme\.bg\}F5`/)
  assert.match(header, /setShowProfileMenu[^\n]*activeTheme\.accent/)
  assert.match(header, /linear-gradient\(135deg, \$\{activeTheme\.accent\}, \$\{activeTheme\.accent2\}\)/)
  assert.match(header, /title="Add local songs from this device" aria-label="Add local songs from this device"><PlusIcon\/>Add Local/)
  assert.doesNotMatch(header, /<BellIcon|title="Add Local Songs"/)
  assert.match(css, /\.theme-light \.placeholder\\:text-white\\\/50::placeholder \{ color: rgba\(33,24,39,0\.5\) !important; \}/)
})

test('category chips row hint never squeezes and native scrollbar is hidden', () => {
  const hintLine = app.split('\n').find(l => l.includes('Tap category → auto-queue'))
  assert.ok(hintLine, 'chips row hint span is present')
  assert.match(hintLine, /<span className="ml-auto shrink-0 whitespace-nowrap hidden lg:flex items-center gap-2 text-xs text-white\/40">/)
  assert.match(app, /pb-3 flex items-center gap-2 overflow-x-auto scrollbar-none/)
  assert.match(css, /\.scrollbar-none \{ scrollbar-width: none; -ms-overflow-style: none; \}/)
  assert.match(css, /\.scrollbar-none::-webkit-scrollbar \{ display: none; \}/)
})

test('native update popup uses app icon and remains centred with independent notes scroll', () => {
  assert.match(popup, /fixed inset-0 z-\[80\] overflow-y-auto overscroll-contain/)
  assert.match(popup, /fixed inset-0 bg-black\/75 backdrop-blur-md/)
  assert.match(popup, /relative min-h-full flex p-4 sm:p-6/)
  assert.match(popup, /relative m-auto w-full max-w-sm/)
  assert.match(popup, /<img src=\{`\$\{BASE\}icon-512\.png`\} alt="MaxMusic app icon"/)
  assert.doesNotMatch(popup, /⬆/)
  assert.match(popup, /max-h-\[38dvh\] overflow-y-auto overscroll-contain/)
  assert.match(popup, /Download update/)
  assert.match(popup, /Maybe later/)
  assert.equal(features[0], 'Your theme now colours the whole screen — top bar, search and category tabs match too')
})

test('web/PWA never offers an Android APK; native updater retains the curated feed', async () => {
  const oldWindow = globalThis.window
  const oldFetch = globalThis.fetch
  let requests = 0
  globalThis.window = { Capacitor: { isNativePlatform: () => false } }
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ build: 99999, apk: 'https://example.com/app.apk', features: ['New songs'] }) } }
  try {
    assert.equal(await checkAppUpdate(), null)
    assert.equal(requests, 0)
    globalThis.window.Capacitor.isNativePlatform = () => true
    const result = await checkAppUpdate()
    assert.equal(requests, 1)
    assert.equal(result.hasUpdate, true)
    assert.deepEqual(result.features, ['New songs.'])
    assert.match(app, /if\(!isNativeApp\(\) \|\| updChecking\) return/)
    assert.match(app, /if\(!isNativeApp\(\)\) return\n    let alive/)
    assert.match(app, /The web app updates automatically\./)
    assert.match(app, /\{X\.nativeUpdates && <button onClick=\{\(\)=> X\.onCheckUpdate/)
  } finally {
    globalThis.window = oldWindow
    globalThis.fetch = oldFetch
  }
})
