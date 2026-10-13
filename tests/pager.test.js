import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPager } from '../src/lib/pager.js'

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

test('pager: concurrent triggers share one in-flight request', async () => {
  const pager = createPager()
  const gate = deferred()
  let fetches = 0
  const appended = []
  const first = pager.run('c1', async () => { fetches += 1; await gate.promise; return { added: [{ id: 1 }], nextCursor: 'c2' } }, rows => appended.push(...rows))
  const second = await pager.run('c1', async () => { fetches += 1; return { added: [{ id: 2 }], nextCursor: 'c3' } }, rows => appended.push(...rows))
  assert.equal(second.status, 'busy')
  gate.resolve()
  const result = await first
  assert.equal(fetches, 1)
  assert.deepEqual(appended, [{ id: 1 }])
  assert.equal(result.done, false)
})

test('pager: real successive pages keep loading until provider ends', async () => {
  const pager = createPager()
  const pages = {
    c1: { added: [{ id: 1 }], nextCursor: 'c2' },
    c2: { added: [{ id: 2 }], nextCursor: 'c3' },
    c3: { added: [{ id: 3 }], nextCursor: null },
  }
  const seen = []
  let cursor = 'c1'
  let result
  do {
    result = await pager.run(cursor, async cur => { seen.push(cur); return pages[cur] }, () => {})
    cursor = result.nextCursor
  } while (!result.done)
  assert.deepEqual(seen, ['c1', 'c2', 'c3'])
  assert.equal(result.done, true)
})

test('pager: null cursor latches done and later triggers never fetch again', async () => {
  const pager = createPager()
  let fetches = 0
  const fetchPage = async () => { fetches += 1; return { added: [{ id: fetches }], nextCursor: null } }
  const first = await pager.run('c1', fetchPage, () => {})
  const second = await pager.run(null, fetchPage, () => {})
  assert.equal(first.done, true)
  assert.equal(second.status, 'done')
  assert.equal(fetches, 1)
})

test('pager: repeated cursor terminates instead of looping', async () => {
  const pager = createPager()
  let fetches = 0
  const result = await pager.run('same', async cursor => { fetches += 1; return { added: [], nextCursor: cursor } }, () => {})
  assert.equal(result.done, true)
  assert.equal(fetches, 1)
})

test('pager: duplicate-only page with a DIFFERENT valid cursor is not exhaustion', async () => {
  const pager = createPager()
  const appended = []
  const pages = [
    { added: [], nextCursor: 'c2' },               // all duplicates, but provider has more
    { added: [{ id: 9 }], nextCursor: null },      // real new rows on the next page
  ]
  let i = 0
  const result = await pager.run('c1', async () => pages[i++], rows => appended.push(...rows))
  assert.equal(i, 2, 'pager must advance through the duplicate-only page')
  assert.deepEqual(appended, [{ id: 9 }])
  assert.equal(result.done, true)
})

test('pager: advance bound returns latest cursor WITHOUT claiming the end', async () => {
  const pager = createPager({ maxEmptyAdvance: 3 })
  let n = 0
  const result = await pager.run('c0', async () => { n += 1; return { added: [], nextCursor: `c${n}` } }, () => {})
  assert.equal(result.status, 'advanced')
  assert.equal(result.done, false)
  assert.equal(result.nextCursor, 'c3')
})

test('pager: errors never latch done and keep the cursor', async () => {
  const pager = createPager()
  const fail = async () => { throw new Error('offline') }
  const first = await pager.run('c1', fail, () => {})
  const second = await pager.run(first.nextCursor, fail, () => {})
  assert.equal(first.status, 'error')
  assert.equal(first.done, false)
  assert.equal(first.nextCursor, 'c1')
  assert.equal(second.done, false)
})

test('pager: reset restores loading for a new list', async () => {
  const pager = createPager()
  await pager.run('c1', async () => ({ added: [{ id: 1 }], nextCursor: null }), () => {})
  assert.equal(pager.done, true)
  pager.reset()
  const again = await pager.run('fresh', async () => ({ added: [{ id: 2 }], nextCursor: null }), () => {})
  assert.equal(again.status, 'ok')
  assert.equal(again.added, 1)
})
