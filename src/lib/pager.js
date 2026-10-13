// pager.js — load-more controller for infinite lists.
//
// Rules learned from the phone tests (builds 111–112):
//  - ATOMIC in-flight: a second run() while one is pending is a no-op
//    ({status:'busy'}), never a duplicate request.
//  - A duplicate-only / filtered-empty page is NOT provider exhaustion when
//    the provider returned a DIFFERENT valid next cursor. The pager advances
//    boundedly through such pages inside one run (maxEmptyAdvance) instead
//    of latching "End" — the 51-row Hindi feed died exactly that way.
//  - "End" (done) means REAL provider exhaustion only: next cursor is null,
//    or the cursor failed to advance (same cursor returned). Reaching the
//    per-run advance bound is NOT done — it returns the latest cursor with
//    done:false so the next scroll/button trigger continues from there.
//  - Errors never latch done: the cursor is kept and a later trigger retries.
//  - Once done, run() never fetches again until reset() (new query/category).
//
// The caller supplies fetchPage(cursor) -> { added:[...], nextCursor } with
// `added` already deduped against the visible list, and onAdd(added).
export function createPager({ maxEmptyAdvance = 8, maxPagesPerRun = 12 } = {}) {
  let inFlight = false
  let done = false
  let pages = 0
  return {
    get inFlight() { return inFlight },
    get done() { return done },
    get pages() { return pages },
    reset() { inFlight = false; done = false; pages = 0 },
    async run(cursor, fetchPage, onAdd) {
      if (inFlight) return { status: 'busy', nextCursor: cursor, added: 0, done }
      if (done) return { status: 'done', nextCursor: cursor, added: 0, done: true }
      inFlight = true
      let cur = cursor
      let totalAdded = 0
      try {
        for (let hop = 0; hop < maxPagesPerRun; hop++) {
          let r
          try {
            r = await fetchPage(cur)
          } catch (e) {
            return { status: 'error', nextCursor: cur, added: totalAdded, done: false }
          }
          pages += 1
          const added = (r && Array.isArray(r.added)) ? r.added : []
          const next = r && 'nextCursor' in r ? r.nextCursor : null
          const repeated = next != null && cur != null && String(next) === String(cur)
          if (added.length) {
            totalAdded += added.length
            if (typeof onAdd === 'function') onAdd(added)
            if (next == null || repeated) done = true
            return { status: 'ok', nextCursor: next, added: totalAdded, done }
          }
          // No new unique rows on this page.
          if (next == null || repeated) {
            done = true
            return { status: 'ok', nextCursor: next, added: totalAdded, done: true }
          }
          // Different valid cursor: advance (bounded) and keep looking.
          cur = next
          if (hop + 1 >= maxEmptyAdvance) {
            return { status: 'advanced', nextCursor: cur, added: totalAdded, done: false }
          }
        }
        return { status: 'advanced', nextCursor: cur, added: totalAdded, done: false }
      } finally {
        inFlight = false
      }
    },
  }
}
