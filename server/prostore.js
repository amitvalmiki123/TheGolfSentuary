// MaxMusic Pro — UPI payment requests + one-time activation codes.
//
// Storage: an in-memory Map is the working set. When MongoDB is connected the
// server passes a `persist` adapter (see ./models/ProRequest.js) so requests
// survive Render free-tier restarts; without MONGO_URI the Map alone is used and
// pending requests are lost on restart (users just resubmit their UTR).
import crypto from 'node:crypto'

// Permanent, multi-use owner code: never expires, never consumed, any device.
// Must match src/lib/pro.js OWNER_CODE (locked by tests/pro.test.js).
export const OWNER_CODE = 'MAXMUSIC79'
export const PRO_PRICE = 79
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_REQUESTS = 5000
const MAX_PENDING_PER_USER = 5

export const normCode = (c) => String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, '')
export const normUtr = (u) => String(u == null ? '' : u).replace(/[\s-]/g, '').toUpperCase()
export const validUtr = (u) => /^[A-Z0-9]{10,22}$/.test(normUtr(u))
export const validUserId = (id) => /^[\w@.+-]{3,80}$/.test(String(id == null ? '' : id))

export function makeOneTimeCode(randomBytes = crypto.randomBytes){
  const b = randomBytes(8)
  let s = ''
  for(let i = 0; i < 8; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length]
  return `MX-${s.slice(0, 4)}-${s.slice(4)}`
}
const newId = () => crypto.randomBytes(6).toString('hex')

// Admin secret: PRO_ADMIN_SECRET env. Local/dev fallback only — on Render
// (RENDER env is set automatically) admin routes stay locked until it is configured.
export const DEV_ADMIN_SECRET = 'maxmusic-dev-admin'
export function resolveAdminSecret(env = process.env){
  if(env.PRO_ADMIN_SECRET) return String(env.PRO_ADMIN_SECRET)
  if(env.RENDER || env.NODE_ENV === 'production') return null
  return DEV_ADMIN_SECRET
}
export function secretOk(given, expected){
  if(!expected || !given) return false
  const a = Buffer.from(String(given)), b = Buffer.from(String(expected))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function createProStore({ persist = null, now = () => Date.now(), codeGen = makeOneTimeCode } = {}){
  const reqs = new Map() // id -> { id, userId, utr, amount, ts, status, code?, approvedAt?, consumedAt?, consumedBy? }
  const save = async (r) => { if(persist && persist.save){ try{ await persist.save({ ...r }) }catch{} } }
  const list = () => [...reqs.values()]

  return {
    async load(){
      if(!persist || !persist.loadAll) return 0
      try{ const all = await persist.loadAll(); for(const r of all || []) if(r && r.id) reqs.set(r.id, { ...r }); return reqs.size }catch{ return 0 }
    },
    size: () => reqs.size,

    async request({ userId, utr, amount }){
      const uid = String(userId == null ? '' : userId).trim()
      const u = normUtr(utr)
      const amt = Number(amount)
      if(!validUserId(uid)) return { ok: false, status: 400, error: 'Invalid user id' }
      if(!validUtr(u)) return { ok: false, status: 400, error: 'Enter the 12-digit UTR / reference number from your UPI app' }
      if(!Number.isFinite(amt) || amt < PRO_PRICE) return { ok: false, status: 400, error: `Amount must be at least ₹${PRO_PRICE}` }
      const dup = list().find((r) => r.utr === u)
      if(dup){
        if(dup.userId !== uid) return { ok: false, status: 409, error: 'This UTR has already been submitted' }
        return { ok: true, status: 200, request: publicReq(dup), duplicate: true }
      }
      if(list().filter((r) => r.userId === uid && r.status === 'pending').length >= MAX_PENDING_PER_USER) return { ok: false, status: 429, error: 'Too many pending requests — please wait for approval' }
      if(reqs.size >= MAX_REQUESTS){ // drop the oldest finished requests first
        const old = list().filter((r) => r.status !== 'pending').sort((a, b) => a.ts - b.ts)[0]
        if(old) reqs.delete(old.id); else return { ok: false, status: 503, error: 'Request queue full — try later' }
      }
      const r = { id: newId(), userId: uid, utr: u, amount: amt, ts: now(), status: 'pending' }
      reqs.set(r.id, r); await save(r)
      return { ok: true, status: 201, request: publicReq(r) }
    },

    requests({ status } = {}){
      const order = { pending: 0, approved: 1, consumed: 2, rejected: 3 }
      return list().filter((r) => !status || status === 'all' || r.status === status)
        .sort((a, b) => (order[a.status] - order[b.status]) || (b.ts - a.ts))
        .map((r) => ({ ...r }))
    },

    async approve(id){
      const r = reqs.get(String(id || ''))
      if(!r) return { ok: false, status: 404, error: 'No such request' }
      if(r.status === 'approved' || r.status === 'consumed') return { ok: true, status: 200, request: { ...r }, already: true }
      let code = codeGen()
      while(list().some((x) => x.code === code)) code = codeGen()
      Object.assign(r, { status: 'approved', code, approvedAt: now() })
      await save(r)
      return { ok: true, status: 200, request: { ...r } }
    },

    async reject(id){
      const r = reqs.get(String(id || ''))
      if(!r) return { ok: false, status: 404, error: 'No such request' }
      if(r.status === 'consumed') return { ok: false, status: 409, error: 'Already used' }
      Object.assign(r, { status: 'rejected', code: undefined }); await save(r)
      return { ok: true, status: 200, request: { ...r } }
    },

    // What the polling app sees. The code is only returned while approved + unused.
    codeFor(userId){
      const uid = String(userId == null ? '' : userId).trim()
      if(!validUserId(uid)) return { status: 400, body: { error: 'Invalid user id' } }
      const mine = list().filter((r) => r.userId === uid).sort((a, b) => b.ts - a.ts)
      const approved = mine.find((r) => r.status === 'approved')
      if(approved) return { status: 200, body: { status: 'approved', code: approved.code, id: approved.id } }
      const pending = mine.find((r) => r.status === 'pending')
      if(pending) return { status: 200, body: { status: 'pending', id: pending.id } }
      const latest = mine[0]
      return { status: 200, body: { status: latest ? latest.status : 'none' } }
    },

    // OWNER_CODE: always valid, never consumed. One-time codes: consumed exactly once.
    async redeem({ userId, code }){
      const c = normCode(code)
      if(!c) return { ok: false, status: 400, error: 'Please enter a code' }
      if(c === OWNER_CODE) return { ok: true, status: 200, kind: 'owner' }
      const r = list().find((x) => x.code === c)
      if(!r) return { ok: false, status: 400, error: 'Invalid code' }
      if(r.status === 'consumed'){
        // idempotent for the same user (retry after a dropped response)
        if(userId && r.consumedBy === String(userId)) return { ok: true, status: 200, kind: 'onetime', repeat: true }
        return { ok: false, status: 409, error: 'This code has already been used' }
      }
      if(r.status !== 'approved') return { ok: false, status: 400, error: 'Invalid code' }
      Object.assign(r, { status: 'consumed', consumedAt: now(), consumedBy: String(userId || r.userId) })
      await save(r)
      return { ok: true, status: 200, kind: 'onetime' }
    },
  }
}

function publicReq(r){ return { id: r.id, status: r.status, ts: r.ts, amount: r.amount } }

export function requestsHtml(rows, secret){
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const q = encodeURIComponent(secret)
  const tr = rows.map((r) => `<tr><td>${esc(new Date(r.ts).toISOString().replace('T', ' ').slice(0, 16))}</td><td>${esc(r.userId)}</td><td><b>${esc(r.utr)}</b></td><td>₹${esc(r.amount)}</td><td>${esc(r.status)}${r.code ? ` <code>${esc(r.code)}</code>` : ''}</td><td>${r.status === 'pending' ? `<a href="/api/pro/approve?secret=${q}&id=${esc(r.id)}">Approve</a> · <a href="/api/pro/reject?secret=${q}&id=${esc(r.id)}">Reject</a>` : ''}</td></tr>`).join('')
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MaxMusic Pro requests</title><style>body{font:14px system-ui;margin:12px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}</style><h2>MaxMusic Pro — payment requests</h2><p>Check the UTR in your Paytm/UPI app, then approve. The app picks up the code automatically.</p><table><tr><th>Time (UTC)</th><th>User</th><th>UTR</th><th>Amount</th><th>Status</th><th></th></tr>${tr || '<tr><td colspan="6">No requests yet</td></tr>'}</table>`
}
