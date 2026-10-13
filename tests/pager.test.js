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

  const first = pager.run('cursor-1', async () => {
    fetches += 1
    await gate.promise
    return { added: [{ id: 1 }], nextCursor: 'cursor-2' }
  }, rows => appended.push(...rows))
  const second = await pager.run('cursor-1', async () => {
    fetches += 1
    return { added: [{ id: 2 }], nextCursor: 'cursor-3' }
  }, rows => appended.push(...rows))

  assert.deepEqual(second, { status: 'busy', nextCursor: 'cursor-1', added: 0, done: false })
  gate.resolve()
  const result = await first
  assert.equal(fetches, 1)
  assert.deepEqual(appended, [{ id: 1 }])
  assert.equal(result.nextCursor, 'cursor-2')
  assert.equal(result.done, false)
})

test('pager: null cursor latches done and later triggers never fetch again', async () => {
  const pager = createPager()
  let fetches = 0
  const fetchPage = async () => {
    fetches += 1
    return { added: [{ id: fetches }], nextCursor: null }
  }

  const first = await pager.run('cursor-1', fetchPage, () => {})
  const second = await pager.run(null, fetchPage, () => {})

  assert.equal(first.done, true)
  assert.deepEqual(second, { status: 'done', nextCursor: null, added: 0, done: true })
  assert.equal(fetches, 1)
})

test('pager: repeated cursor with no new tracks terminates instead of blinking forever', async () => {
  const pager = createPager()
  let fetches = 0
  const result = await pager.run('same-cursor', async cursor => {
    fetches += 1
    return { added: [], nextCursor: cursor }
  }, () => {})

  assert.equal(result.done, true)
  assert.equal(fetches, 1)
})

test('pager: different cursors with no new unique tracks stop after the empty limit', async () => {
  const pager = createPager({ emptyLimit: 2 })
  const cursors = []

  const first = await pager.run('c1', async cursor => {
    cursors.push(cursor)
    return { added: [], nextCursor: 'c2' }
  }, () => {})
  const second = await pager.run(first.nextCursor, async cursor => {
    cursors.push(cursor)
    return { added: [], nextCursor: 'c3' }
  }, () => {})
  const third = await pager.run(second.nextCursor, async () => {
    throw new Error('must not fetch after done')
  }, () => {})

  assert.deepEqual(cursors, ['c1', 'c2'])
  assert.equal(second.done, true)
  assert.equal(third.status, 'done')
})

test('pager: a productive page resets the no-progress streak', async () => {
  const pager = createPager({ emptyLimit: 2 })
  const pages = [
    { added: [], nextCursor: 'c2' },
    { added: [{ id: 1 }], nextCursor: 'c3' },
    { added: [], nextCursor: 'c4' },
    { added: [], nextCursor: 'c5' },
  ]
  let cursor = 'c1'
  let result
  for (const page of pages) {
    result = await pager.run(cursor, async () => page, () => {})
    cursor = result.nextCursor
  }

  assert.equal(result.done, true)
  assert.equal(cursor, 'c5')
})

test('pager: repeated errors stop after the empty limit and keep the cursor for diagnosis', async () => {
  const pager = createPager({ emptyLimit: 2 })
  const fail = async () => { throw new Error('offline') }

  const first = await pager.run('c1', fail, () => {})
  const second = await pager.run(first.nextCursor, fail, () => {})

  assert.equal(first.status, 'error')
  assert.equal(first.done, false)
  assert.equal(first.nextCursor, 'c1')
  assert.equal(second.status, 'error')
  assert.equal(second.done, true)
})

test('pager: page cap and reset restore loading for a new list', async () => {
  const pager = createPager({ pageCap: 2, emptyLimit: 10 })
  let page = 0
  const fetchPage = async () => ({ added: [{ id: ++page }], nextCursor: `c${page + 1}` })

  const first = await pager.run('c1', fetchPage, () => {})
  const second = await pager.run(first.nextCursor, fetchPage, () => {})
  assert.equal(second.done, true)

  pager.reset()
  const third = await pager.run('fresh', fetchPage, () => {})
  assert.equal(third.status, 'ok')
  assert.equal(third.done, false)
})
