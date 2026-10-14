// MaxMusic Pro — zero-cost, semi-automatic UPI payment flow (no gateway, no KYC).
//
//   1. User taps a payment pill (UPI / GPay / PhonePe / Paytm) in the Go Pro modal.
//      Android app → the matching UPI intent opens with ₹79 prefilled.
//      Web / PWA   → UPI ID + amount are shown with copy buttons and short steps.
//   2. After paying, the user submits the UTR / RRN → POST /api/pro/request.
//   3. The owner verifies the credit and approves → the server issues a ONE-TIME code.
//   4. The app polls GET /api/pro/code, auto-redeems the code and Pro turns on.
//
// OWNER_CODE is the permanent, multi-use owner code: it never expires, is never
// consumed, and activates Pro on every device. It has top priority in code validation.
//
// Pure module: no React, no Capacitor imports. Side effects (navigation, clipboard,
// fetch, timers, storage) are injected so everything is unit-testable under node.

export const PRO_UPI_ID = 'amitvalmiki502@paytm'
export const PRO_PAYEE_NAME = 'MaxMusic'
export const PRO_PRICE = 79
export const PRO_CURRENCY = 'INR'
export const OWNER_CODE = 'MAXMUSIC79'

// Payment pills shown in the Go Pro modal — in display order.
// `scheme` is the app-specific deep link; every app falls back to generic upi://pay.
export const UPI_APPS = Object.freeze([
  Object.freeze({ id: 'upi', label: 'UPI', scheme: 'upi://pay' }),
  Object.freeze({ id: 'gpay', label: 'GPay', scheme: 'tez://upi/pay' }),
  Object.freeze({ id: 'phonepe', label: 'PhonePe', scheme: 'phonepe://pay' }),
  Object.freeze({ id: 'paytm', label: 'Paytm', scheme: 'paytmmp://pay' }),
])
const GENERIC_SCHEME = 'upi://pay'

export const PRO_PENDING_KEY = 'sur_pro_pending'
export const PRO_DEVICE_KEY = 'sur_device_id'

// ---------- codes ----------
export function normalizeCode(code){ return String(code == null ? '' : code).trim().toUpperCase().replace(/\s+/g, '') }
export function isOwnerCode(code){ return normalizeCode(code) === OWNER_CODE }
// One-time codes issued by the server on approval: MX-XXXX-XXXX (unambiguous alphabet).
export const ONE_TIME_CODE_RE = /^MX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
export function looksLikeOneTimeCode(code){ return ONE_TIME_CODE_RE.test(normalizeCode(code)) }

// ---------- UTR / RRN ----------
// UPI UTR / RRN is normally 12 digits; some apps show longer alphanumeric refs.
export function normalizeUtr(utr){ return String(utr == null ? '' : utr).replace(/[\s-]/g, '').toUpperCase() }
export function isValidUtr(utr){ return /^[A-Z0-9]{10,22}$/.test(normalizeUtr(utr)) }

// ---------- UPI intents ----------
export function formatAmount(amount = PRO_PRICE){
  const n = Number(amount)
  return (Number.isFinite(n) && n > 0 ? n : PRO_PRICE).toFixed(2)
}
export function proNote(userId = '', note = ''){
  const base = String(note || 'MaxMusic Pro').trim()
  const uid = String(userId || '').trim()
  if(!uid || base.includes(uid)) return base.slice(0, 80)
  return `${base} ${uid}`.slice(0, 80)
}
// RFC 3986 encoding — spaces become %20 (some UPI apps render "+" literally).
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export function upiQuery(amount = PRO_PRICE, note = '', userId = ''){
  return `pa=${PRO_UPI_ID}&pn=${enc(PRO_PAYEE_NAME)}&am=${formatAmount(amount)}&cu=${PRO_CURRENCY}&tn=${enc(proNote(userId, note))}`
}
// Generic intent → upi://pay?pa=...&pn=MaxMusic&am=79.00&cu=INR&tn=<encoded note with userId>
export function buildUpiIntent(amount = PRO_PRICE, note = '', userId = ''){
  return `${GENERIC_SCHEME}?${upiQuery(amount, note, userId)}`
}
export function upiAppById(appId){ return UPI_APPS.find((a) => a.id === appId) || UPI_APPS[0] }
export function buildAppIntent(appId, amount = PRO_PRICE, note = '', userId = ''){
  return `${upiAppById(appId).scheme}?${upiQuery(amount, note, userId)}`
}
// Ordered list of URLs to try for one pill: app-specific first, generic upi:// last.
export function intentChain(appId, amount = PRO_PRICE, note = '', userId = ''){
  const generic = buildUpiIntent(amount, note, userId)
  const own = buildAppIntent(appId, amount, note, userId)
  return own === generic ? [generic] : [own, generic]
}

// Try each intent in turn. A launch "succeeds" when the app is backgrounded
// (UPI app came to the front). If nothing takes over within `waitMs`, try the next.
// `navigate(url)` — on Capacitor Android, assigning location.href to a custom scheme
// is intercepted by the bridge and fired as an ACTION_VIEW intent.
export async function openUpiChain(urls, { navigate, wasHidden, waitMs = 2000, sleep } = {}){
  const nap = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const tried = []
  for(const url of urls){
    tried.push(url)
    try{ await navigate(url) }catch{ continue }
    const step = 100
    for(let t = 0; t < waitMs; t += step){
      await nap(step)
      if(wasHidden && wasHidden()) return { ok: true, url, tried }
    }
  }
  return { ok: false, url: null, tried }
}

// Browser glue for openUpiChain (only used inside the app/WebView).
export function browserLaunchDeps(win = (typeof window !== 'undefined' ? window : null)){
  let hidden = false
  const mark = () => { try{ if(win.document.hidden) hidden = true }catch{} }
  const blur = () => { hidden = true }
  // visibilitychange/blur fire when the UPI app (or its chooser) takes the screen;
  // 'pause' is Capacitor's document event for the activity going to background.
  try{ win.document.addEventListener('visibilitychange', mark); win.document.addEventListener('pause', blur); win.addEventListener('blur', blur); win.addEventListener('pagehide', blur) }catch{}
  return {
    navigate: (url) => { win.location.href = url },
    wasHidden: () => hidden,
    dispose: () => { try{ win.document.removeEventListener('visibilitychange', mark); win.document.removeEventListener('pause', blur); win.removeEventListener('blur', blur); win.removeEventListener('pagehide', blur) }catch{} },
  }
}

// ---------- web / PWA copy path ----------
export function webPayDetails(amount = PRO_PRICE, userId = ''){
  return {
    upiId: PRO_UPI_ID,
    amount: formatAmount(amount),
    amountLabel: `₹${Number(formatAmount(amount)).toString()}`,
    note: proNote(userId),
    steps: [
      `Open any UPI app (GPay, PhonePe, Paytm, BHIM).`,
      `Pay ₹${Number(formatAmount(amount))} to ${PRO_UPI_ID}.`,
      `Add the note "${proNote(userId)}" if your app allows it.`,
      `Come back here and enter the 12-digit UTR / reference number.`,
    ],
  }
}
export async function copyText(text, nav = (typeof navigator !== 'undefined' ? navigator : null), doc = (typeof document !== 'undefined' ? document : null)){
  const s = String(text == null ? '' : text)
  try{ if(nav && nav.clipboard && nav.clipboard.writeText){ await nav.clipboard.writeText(s); return true } }catch{}
  try{
    if(!doc) return false
    const ta = doc.createElement('textarea')
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    doc.body.appendChild(ta); ta.select()
    const ok = doc.execCommand && doc.execCommand('copy')
    doc.body.removeChild(ta)
    return !!ok
  }catch{ return false }
}

// ---------- identity + pending state ----------
export function getProUserId(authUser, storage = (typeof localStorage !== 'undefined' ? localStorage : null), rand = Math.random){
  const fromAuth = authUser && (authUser.id || authUser._id || authUser.email)
  if(fromAuth) return String(fromAuth).slice(0, 80)
  try{
    const have = storage && storage.getItem(PRO_DEVICE_KEY)
    if(have) return have
    let id = 'mx-'
    for(let i = 0; i < 10; i++) id += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rand() * 31)]
    if(storage) storage.setItem(PRO_DEVICE_KEY, id)
    return id
  }catch{ return 'mx-guest' }
}
export function loadPending(storage = (typeof localStorage !== 'undefined' ? localStorage : null)){
  try{ const v = JSON.parse(storage.getItem(PRO_PENDING_KEY) || 'null'); return v && v.userId && v.utr ? v : null }catch{ return null }
}
export function savePending(rec, storage = (typeof localStorage !== 'undefined' ? localStorage : null)){
  try{ if(rec) storage.setItem(PRO_PENDING_KEY, JSON.stringify(rec)); else storage.removeItem(PRO_PENDING_KEY) }catch{}
}

// ---------- backend client ----------
export function createProApi({ base = '', fetchImpl = (typeof fetch !== 'undefined' ? fetch : null), timeoutMs = 12000 } = {}){
  const call = async (path, opts = {}) => {
    if(!fetchImpl) return { ok: false, error: 'offline' }
    let tm = null
    try{
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
      if(ctrl) tm = setTimeout(() => ctrl.abort(), timeoutMs)
      const r = await fetchImpl(`${base}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) }, ...(ctrl ? { signal: ctrl.signal } : {}) })
      let data = null
      try{ data = await r.json() }catch{}
      if(!r.ok) return { ok: false, status: r.status, error: (data && data.error) || `HTTP ${r.status}`, data }
      return { ok: true, status: r.status, data: data || {} }
    }catch(e){ return { ok: false, error: 'Network error — please try again' } }
    finally{ if(tm) clearTimeout(tm) }
  }
  return {
    submitRequest: ({ userId, utr, amount = PRO_PRICE }) => call('/api/pro/request', { method: 'POST', body: JSON.stringify({ userId, utr: normalizeUtr(utr), amount: Number(amount) || PRO_PRICE }) }),
    fetchCode: (userId) => call(`/api/pro/code?userId=${encodeURIComponent(userId)}`),
    redeem: ({ userId, code }) => call('/api/pro/redeem', { method: 'POST', body: JSON.stringify({ userId, code: normalizeCode(code) }) }),
  }
}

// One poll tick: when an approved one-time code is waiting, redeem it immediately.
// Returns { state: 'pending'|'activated'|'rejected'|'none'|'error', code? }.
export async function pollOnce(api, userId){
  const r = await api.fetchCode(userId)
  if(!r.ok) return { state: 'error', error: r.error }
  const d = r.data || {}
  if(d.status === 'approved' && d.code){
    const red = await api.redeem({ userId, code: d.code })
    if(red.ok && red.data && red.data.ok) return { state: 'activated', code: normalizeCode(d.code) }
    return { state: 'error', error: (red.error || 'Redeem failed') }
  }
  if(d.status === 'consumed') return { state: 'activated', code: null }
  if(d.status === 'rejected') return { state: 'rejected' }
  if(d.status === 'pending') return { state: 'pending' }
  return { state: 'none' }
}

// Code-input validation, in priority order:
//   1. OWNER_CODE  — permanent + multi-use, local, never consumed, works offline.
//   2. one-time server code (MX-XXXX-XXXX) — redeemed + consumed on the server.
//   3. anything else → caller's legacy path (account redeem / old local list).
export async function validateProCode(code, { api, userId } = {}){
  const c = normalizeCode(code)
  if(!c) return { ok: false, kind: 'empty', error: 'Please enter a code first' }
  if(c === OWNER_CODE) return { ok: true, kind: 'owner', code: c }
  if(looksLikeOneTimeCode(c)){
    if(!api) return { ok: false, kind: 'onetime', error: 'Could not reach the server — please try again' }
    const r = await api.redeem({ userId, code: c })
    if(r.ok && r.data && r.data.ok) return { ok: true, kind: 'onetime', code: c }
    return { ok: false, kind: 'onetime', error: (r.data && r.data.error) || r.error || 'This code is invalid or already used' }
  }
  return { ok: false, kind: 'unknown', code: c }
}
