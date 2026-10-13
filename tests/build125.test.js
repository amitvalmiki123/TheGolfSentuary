import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('build125: mobile keyboard gets a real Search action that dismisses it', () => {
  assert.match(app, /type="search" enterKeyHint="search" inputMode="search"/)
  assert.match(app, /if\(e\.key==='Enter'\)\{ e\.preventDefault\(\); commitHistory\(search\); setSuggOpen\(false\); e\.currentTarget\.blur\(\) \}/)
})

test('build125: welcome/login page uses the real app icon and developer credit', () => {
  const start = app.indexOf('{showWelcome && (')
  const body = app.slice(start, start + 6500)
  assert.match(body, /icon-512\.png/)
  assert.match(body, /Feel every beat — full songs, smooth background play & lock-screen controls\./)
  assert.match(body, /Developed by/)
  assert.match(body, /Max Amit/)
  assert.ok(!body.includes('>🎵</div>'), 'welcome page must not use the generic music emoji as its logo')
})
