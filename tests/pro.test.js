import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import {
  PRO_UPI_ID, PRO_PRICE, OWNER_CODE, UPI_APPS, buildUpiIntent, buildAppIntent, intentChain, openUpiChain,
  validateProCode, isOwnerCode, createProApi, pollOnce, webPayDetails, copyText, isValidUtr, normalizeUtr,
  getProUserId, loadPending, savePending, looksLikeOneTimeCode,
} from '../src/lib/pro.js'
import {
  createProStore, OWNER_CODE as SERVER_OWNER_CODE, resolveAdminSecret, secretOk, DEV_ADMIN_SECRET, makeOneTimeCode,
} from '../server/prostore.js'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8')

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }

// Routes fetch() calls to the real server store logic (same shapes as server/index.js).
function fakeBackend(store){
  const calls = []
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url, 'http://x')
    const body = opts.body ? JSON.parse(opts.body) : {}
    calls.push(`${opts.method || 'GET'} ${u.pathname}`)
    let status = 200, data
    if(u.pathname === '/api/pro/request'){ const r = await store.request(body); status = r.status; data = r.ok ? { ok: true, request: r.request } : { error: r.error } }
    else if(u.pathname === '/api/pro/code'){ const r = store.codeFor(u.searchParams.get('userId')); status = r.status; data = r.body }
    else if(u.pathname === '/api/pro/redeem'){ const r = await store.redeem(body); status = r.status; data = r.ok ? { ok: true, plan: 'Pro', kind: r.kind } : { ok: false, error: r.error } }
    else { status = 404; data = { error: 'nf' } }
    return { ok: status >= 200 && status < 300, status, json: async () => data }
  }
  return { fetchImpl, calls }
}

test('UPI ID is the owner Paytm VPA, no placeholder left anywhere', () => {
  assert.equal(PRO_UPI_ID, 'amitvalmiki502@paytm')
  assert.equal(PRO_PRICE, 79)
  assert.doesNotMatch(app + server, /APNI_UPI_ID|<[A-Z_]*UPI[A-Z_]*>/)
})

test('generic intent encodes payee, amount, currency and a note that carries the userId', () => {
  const url = buildUpiIntent(79, '', 'mx-abc123')
  assert.equal(url, 'upi://pay?pa=amitvalmiki502@paytm&pn=MaxMusic&am=79.00&cu=INR&tn=MaxMusic%20Pro%20mx-abc123')
  const q = new URLSearchParams(url.split('?')[1])
  assert.equal(q.get('pa'), PRO_UPI_ID)
  assert.equal(q.get('am'), '79.00')
  assert.equal(q.get('cu'), 'INR')
  assert.equal(q.get('tn'), 'MaxMusic Pro mx-abc123')
  // defaults + amount formatting + custom note encoding (no "+" for spaces, reserved chars escaped)
  assert.match(buildUpiIntent(), /&am=79\.00&/)
  assert.match(buildUpiIntent(99.5), /&am=99\.50&/)
  assert.match(buildUpiIntent(-3), /&am=79\.00&/)
  const custom = buildUpiIntent(79, 'Pro & more (1 mo)', 'a@b.com')
  assert.match(custom, /tn=Pro%20%26%20more%20%281%20mo%29%20a%40b\.com$/)
  assert.doesNotMatch(custom, /\+/)
  // userId is not duplicated if the note already contains it
  assert.match(buildUpiIntent(79, 'MaxMusic Pro u-1', 'u-1'), /tn=MaxMusic%20Pro%20u-1$/)
})

test('per-app intents use the app scheme first and always fall back to generic upi://', () => {
  assert.deepEqual(UPI_APPS.map((a) => a.id), ['upi', 'gpay', 'phonepe', 'paytm'])
  const generic = buildUpiIntent(79, '', 'u-1')
  const expect = { gpay: 'tez://upi/pay?', phonepe: 'phonepe://pay?', paytm: 'paytmmp://pay?' }
  for(const [id, prefix] of Object.entries(expect)){
    const chain = intentChain(id, 79, '', 'u-1')
    assert.equal(chain.length, 2, id)
    assert.ok(chain[0].startsWith(prefix), chain[0])
    assert.equal(chain[0].split('?')[1], generic.split('?')[1], `${id} carries the same params`)
    assert.equal(chain[1], generic)
    assert.equal(buildAppIntent(id, 79, '', 'u-1'), chain[0])
  }
  assert.deepEqual(intentChain('upi', 79, '', 'u-1'), [generic])
  assert.deepEqual(intentChain('unknown-app', 79, '', 'u-1'), [generic])
})

test('openUpiChain stops on the first app that takes over, else falls through to generic, else reports failure', async () => {
  const sleep = async () => {}
  const chain = intentChain('paytm', 79, '', 'u-1')
  // Paytm installed → app goes to background right away
  let hidden = false, opened = []
  let r = await openUpiChain(chain, { navigate: (u) => { opened.push(u); hidden = true }, wasHidden: () => hidden, sleep })
  assert.equal(r.ok, true); assert.deepEqual(opened, [chain[0]])
  // Paytm missing → nothing happens → generic upi:// opens a UPI app
  hidden = false; opened = []
  r = await openUpiChain(chain, { navigate: (u) => { opened.push(u); if(u.startsWith('upi://')) hidden = true }, wasHidden: () => hidden, sleep })
  assert.equal(r.ok, true); assert.equal(r.url, chain[1]); assert.deepEqual(opened, chain)
  // navigate throwing also falls through
  hidden = false; opened = []
  r = await openUpiChain(chain, { navigate: (u) => { opened.push(u); if(!u.startsWith('upi://')) throw new Error('no app'); hidden = true }, wasHidden: () => hidden, sleep })
  assert.equal(r.ok, true); assert.deepEqual(opened, chain)
  // no UPI app at all → caller shows the copy panel
  r = await openUpiChain(chain, { navigate: () => {}, wasHidden: () => false, sleep })
  assert.equal(r.ok, false); assert.deepEqual(r.tried, chain)
})

test('MAXMUSIC79 is permanent + multi-use on client and server and has top priority', async () => {
  assert.equal(OWNER_CODE, 'MAXMUSIC79')
  assert.equal(SERVER_OWNER_CODE, OWNER_CODE)
  assert.ok(isOwnerCode(' maxmusic79 '))
  // client: works offline (no api), repeatedly, never calls the network
  let netCalls = 0
  const api = { redeem: async () => { netCalls++; return { ok: false } } }
  for(let i = 0; i < 25; i++){
    const v = await validateProCode(i % 2 ? 'maxmusic79' : 'MAXMUSIC79', { api, userId: `device-${i}` })
    assert.deepEqual([v.ok, v.kind], [true, 'owner'])
  }
  assert.equal(netCalls, 0)
  // server: never consumed, any user, any time later
  let clock = 1_000
  const store = createProStore({ now: () => clock })
  for(let i = 0; i < 25; i++){
    clock += 400 * 24 * 3600 * 1000 // over a year between uses — never expires
    const r = await store.redeem({ userId: `user-${i}`, code: 'maxmusic79' })
    assert.deepEqual([r.ok, r.kind], [true, 'owner'])
  }
  assert.equal(store.size(), 0, 'owner code redemption leaves no state behind')
  // App code-input path checks the owner/one-time code before every other path
  const act = app.slice(app.indexOf('const activatePro = async'), app.indexOf('const payWithUpi'))
  assert.ok(act.indexOf('validateProCode(') > 0 && act.indexOf('validateProCode(') < act.indexOf('apiRedeemPro('))
  assert.ok(act.indexOf('apiRedeemPro(') < act.indexOf('PRO_CODES.includes('))
  // server account-redeem list always contains the owner code even if PRO_CODES env overrides it
  assert.match(server, /const PRO_CODES_SRV = \[\.\.\.new Set\(\[OWNER_CODE,/)
})

test('UTR → owner approve → app polls → one-time code auto-redeemed → Pro (code then consumed)', async () => {
  const store = createProStore()
  const { fetchImpl, calls } = fakeBackend(store)
  const api = createProApi({ base: '', fetchImpl })
  const userId = 'mx-phone1'

  assert.equal(isValidUtr('1234 5678 9012'), true)
  assert.equal(isValidUtr('12345'), false)
  const sub = await api.submitRequest({ userId, utr: '4123-4567-8901', amount: 79 })
  assert.equal(sub.ok, true); assert.equal(sub.data.request.status, 'pending')
  assert.equal(normalizeUtr('4123-4567-8901'), '412345678901')

  // validation errors are surfaced
  assert.equal((await api.submitRequest({ userId, utr: 'abc', amount: 79 })).ok, false)
  assert.equal((await api.submitRequest({ userId, utr: '999988887777', amount: 10 })).ok, false)
  const stolen = await api.submitRequest({ userId: 'mx-other', utr: '412345678901', amount: 79 })
  assert.equal(stolen.status, 409)

  // before approval the app just keeps waiting
  assert.equal((await pollOnce(api, userId)).state, 'pending')

  const [pending] = store.requests({ status: 'pending' })
  assert.deepEqual([pending.userId, pending.utr, pending.amount], [userId, '412345678901', 79])
  assert.ok(pending.id && pending.ts)
  const ap = await store.approve(pending.id)
  assert.ok(looksLikeOneTimeCode(ap.request.code), ap.request.code)
  assert.equal((await store.approve(pending.id)).request.code, ap.request.code, 'approve is idempotent')

  const done = await pollOnce(api, userId)
  assert.deepEqual(done, { state: 'activated', code: ap.request.code })
  assert.deepEqual(calls.slice(-2), ['GET /api/pro/code', 'POST /api/pro/redeem'])

  // one-time: nobody else can reuse it; the payer polling again sees consumed (still Pro)
  const reuse = await validateProCode(ap.request.code, { api, userId: 'mx-thief' })
  assert.equal(reuse.ok, false)
  assert.equal(store.codeFor(userId).body.status, 'consumed')
  assert.equal(store.codeFor(userId).body.code, undefined)
  assert.equal((await pollOnce(api, userId)).state, 'activated')
})

test('typed one-time code works as fallback; rejected requests stop polling', async () => {
  const store = createProStore()
  const api = createProApi({ base: '', fetchImpl: fakeBackend(store).fetchImpl })
  await api.submitRequest({ userId: 'mx-a1', utr: '111122223333', amount: 79 })
  const [r1] = store.requests({ status: 'pending' })
  const { request } = await store.approve(r1.id)
  const v = await validateProCode(request.code.toLowerCase(), { api, userId: 'mx-tablet' })
  assert.deepEqual([v.ok, v.kind], [true, 'onetime'])
  assert.equal((await validateProCode('MX-AAAA-BBBB', { api, userId: 'x' })).ok, false)
  assert.equal((await validateProCode('SOMETHING', { api })).kind, 'unknown')

  await api.submitRequest({ userId: 'mx-b2', utr: '444455556666', amount: 79 })
  const [r2] = store.requests({ status: 'pending' })
  await store.reject(r2.id)
  assert.equal((await pollOnce(api, 'mx-b2')).state, 'rejected')
  assert.equal((await pollOnce(api, 'mx-nobody')).state, 'none')
})

test('server store persists through the adapter and reloads after a restart', async () => {
  const db = new Map()
  const persist = { save: async (r) => db.set(r.id, r), loadAll: async () => [...db.values()] }
  const a = createProStore({ persist })
  await a.request({ userId: 'mx-p1', utr: '777788889999', amount: 79 })
  const b = createProStore({ persist })
  assert.equal(await b.load(), 1)
  const [p] = b.requests({ status: 'pending' })
  await b.approve(p.id)
  assert.equal(db.get(p.id).status, 'approved')
  assert.match(makeOneTimeCode(), /^MX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
})

test('admin secret comes from PRO_ADMIN_SECRET; dev fallback only off Render', () => {
  assert.equal(resolveAdminSecret({ PRO_ADMIN_SECRET: 's3cret' }), 's3cret')
  assert.equal(resolveAdminSecret({}), DEV_ADMIN_SECRET)
  assert.equal(resolveAdminSecret({ RENDER: 'true' }), null)
  assert.equal(secretOk('s3cret', 's3cret'), true)
  assert.equal(secretOk('nope', 's3cret'), false)
  assert.equal(secretOk('', null), false)
  for(const route of ["app.post('/api/pro/request'", "app.get('/api/pro/requests', proAdmin", "app.all('/api/pro/approve', proAdmin", "app.get('/api/pro/code'", "app.post('/api/pro/redeem'"]){
    assert.ok(server.includes(route), route)
  }
})

test('web/PWA path: copy UPI ID + amount with short instructions', async () => {
  const w = webPayDetails(79, 'mx-web1')
  assert.equal(w.upiId, PRO_UPI_ID)
  assert.equal(w.amount, '79.00')
  assert.equal(w.amountLabel, '₹79')
  assert.ok(w.steps.length >= 3 && w.steps.some((s) => s.includes(PRO_UPI_ID)) && w.steps.some((s) => /UTR/.test(s)))
  // async clipboard
  let copied = null
  assert.equal(await copyText(PRO_UPI_ID, { clipboard: { writeText: async (t) => { copied = t } } }, null), true)
  assert.equal(copied, PRO_UPI_ID)
  // legacy execCommand fallback (no clipboard permission)
  const dom = new JSDOM('<body></body>')
  let execd = false
  dom.window.document.execCommand = (cmd) => { execd = cmd === 'copy'; return true }
  assert.equal(await copyText('79', { clipboard: { writeText: async () => { throw new Error('denied') } } }, dom.window.document), true)
  assert.equal(execd, true)
  assert.equal(dom.window.document.querySelectorAll('textarea').length, 0)
  // App: non-native taps open the copy panel instead of firing intents
  const pay = app.slice(app.indexOf('const payWithUpi'), app.indexOf('const copyPro'))
  assert.match(pay, /if\(!isNativeApp\(\)\)\{ setProWebPay\(true\); return \}/)
  assert.match(pay, /openUpiChain\(intentChain\(appId, PRO_PRICE, '', proUserId\(\)\)/)
  assert.match(pay, /if\(!r\.ok\)\{ setProWebPay\(true\)/)
})

test('Go Pro modal keeps the ₹79 plan card, adds payment pills, UTR panel and the code fallback', () => {
  const modal = app.slice(app.indexOf('{showSubscribe && ('), app.indexOf('{toast && <div'))
  assert.match(modal, /price:'₹79\/mo'/)
  assert.match(modal, /UPI_APPS\.map\(a=>/)
  assert.match(modal, /<UpiPill id=\{a\.id\}\/>/)
  assert.match(modal, /data-pro-webpay/)
  assert.match(modal, /t\('pro_paidQ'\)/)
  assert.match(modal, /onClick=\{submitUtr\}/)
  assert.match(modal, /onClick=\{activatePro\}/)
  // UpiPill uses brand icon images with onError fallback to letter-pill
  const pillFn = app.slice(app.indexOf('function UpiPill('), app.indexOf('function formatTime('))
  assert.match(pillFn, /<img src=\{`\$\{BASE\}pay\/\$\{id\}\.png`\}/)
  assert.match(pillFn, /className="w-9 h-9 object-contain"/)
  assert.match(pillFn, /onError/)
  assert.match(pillFn, /UpiPillFallback/)
  assert.match(app, /pro_paidQ:'Payment done\?'/)
})

test('pending request + device id persist across app restarts', () => {
  const st = memStorage()
  const id = getProUserId(null, st)
  assert.match(id, /^mx-[a-z0-9]{10}$/)
  assert.equal(getProUserId(null, st), id)
  assert.equal(getProUserId({ id: 'acct-42' }, st), 'acct-42')
  savePending({ userId: id, utr: '123412341234', status: 'pending' }, st)
  assert.equal(loadPending(st).utr, '123412341234')
  savePending(null, st)
  assert.equal(loadPending(st), null)
})
