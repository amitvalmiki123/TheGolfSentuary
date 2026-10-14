import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPager } from '../src/lib/pager.js'

// Models the App's rapid-switch pattern: a stale async completion must not
// write into the new selection. The pager's in-flight latch + replacing the
// pager instance on selection change is what the UI guards on.
test('late response: stale pager completion cannot mark the new selection done', async () => {
  let resolveOld
  const oldPager = createPager()
  const oldRun = oldPager.run('c1', () => new Promise(r => { resolveOld = r }), () => {})
  // User switches category/query: App replaces the pager instance.
  const newPager = createPager()
  resolveOld({ added: [], nextCursor: null })
  const oldResult = await oldRun
  assert.equal(oldResult.done, true, 'old pager finishes on its own state')
  assert.equal(newPager.done, false, 'new selection pager is unaffected')
  const fresh = await newPager.run('n1', async () => ({ added: [{ id: 1 }], nextCursor: null }), () => {})
  assert.equal(fresh.status, 'ok')
})

test('late response: busy latch prevents a second fetch for the same selection', async () => {
  const pager = createPager()
  let fetches = 0
  let release
  const gate = new Promise(r => { release = r })
  const a = pager.run('c1', async () => { fetches += 1; await gate; return { added: [{ id: 1 }], nextCursor: null } }, () => {})
  const b = await pager.run('c1', async () => { fetches += 1; return { added: [], nextCursor: null } }, () => {})
  assert.equal(b.status, 'busy')
  release()
  await a
  assert.equal(fetches, 1)
})
