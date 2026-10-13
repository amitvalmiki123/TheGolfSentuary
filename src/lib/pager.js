// pager.js — load-more controller for infinite lists (build-111 regression).
//
// The blink loop came from three compounding defects: triggers re-fired
// freely while a request was in flight, a provider could return the SAME
// cursor/page forever, and pages whose tracks were all duplicates counted as
// "progress" — so the footer oscillated "Loading more…" / "Load more…"
// endlessly and never reached the end state. This controller owns the rules:
//
//  - ATOMIC in-flight: a second run() while one is pending is a no-op
//    ({status:'busy'}), never a duplicate request.
//  - NO-PROGRESS = TERMINATION PATH: a page that adds zero NEW tracks counts
//    toward exhaustion (default: 2 in a row), as does a repeated cursor that
//    yields nothing new, a null cursor, an error streak, or a hard page cap.
//  - done LATCHES: once exhausted, run() never fetches again until reset()
//    (new query / category). A visible sentinel therefore cannot spin it.
//
// The caller supplies fetchPage(cursor) -> { added:[...], nextCursor } with
// `added` already deduped against the visible list, and onAdd(added) to
// append. Identity/dedup stays with the caller (same-recording keys etc.).
export function createPager({ emptyLimit = 2, pageCap = 60 } = {}) {
  let inFlight = false
  let done = false
  let emptyStreak = 0
  let pages = 0
  return {
    get inFlight() { return inFlight },
    get done() { return done },
    reset() { inFlight = false; done = false; emptyStreak = 0; pages = 0 },
    async run(cursor, fetchPage, onAdd) {
      if (inFlight) return { status: 'busy', nextCursor: cursor, added: 0, done }
      if (done) return { status: 'done', nextCursor: cursor, added: 0, done: true }
      inFlight = true
      try {
        const r = await fetchPage(cursor)
        const added = (r && Array.isArray(r.added)) ? r.added : []
        if (added.length && typeof onAdd === 'function') onAdd(added)
        const next = r && 'nextCursor' in r ? r.nextCursor : null
        const repeated = next != null && cursor != null && String(next) === String(cursor)
        emptyStreak = added.length ? 0 : emptyStreak + 1
        pages += 1
        if (next == null || (repeated && !added.length) || emptyStreak >= emptyLimit || pages >= pageCap) done = true
        return { status: 'ok', nextCursor: next, added: added.length, done }
      } catch (e) {
        emptyStreak += 1
        if (emptyStreak >= emptyLimit) done = true
        return { status: 'error', nextCursor: cursor, added: 0, done }
      } finally {
        inFlight = false
      }
    },
  }
}
