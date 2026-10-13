import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THEMES, themeById, canUseTheme, effectiveTheme } from '../src/lib/themes.js'

test('themes include free day/night modes and three Pro custom themes', () => {
  assert.ok(THEMES.length >= 5)
  assert.equal(THEMES.filter((t) => !t.pro).length, 2)
  assert.equal(THEMES.filter((t) => t.pro).length, 3)
  assert.ok(themeById('daylight').mode === 'light')
  assert.ok(themeById('midnight').mode === 'dark')
})

test('custom themes are locked for free users and available to Pro', () => {
  for (const theme of THEMES.filter((t) => t.pro)) {
    assert.equal(canUseTheme(theme, false), false, theme.id)
    assert.equal(canUseTheme(theme, true), true, theme.id)
    assert.equal(effectiveTheme(theme.id, false).id, 'midnight', theme.id)
    assert.equal(effectiveTheme(theme.id, true).id, theme.id, theme.id)
  }
})

test('unknown theme ids fall back safely to the default theme', () => {
  assert.equal(themeById('missing-theme').id, 'midnight')
  assert.equal(effectiveTheme('missing-theme', false).id, 'midnight')
})
