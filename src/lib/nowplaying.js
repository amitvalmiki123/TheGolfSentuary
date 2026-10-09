// Native NowPlaying bridge - Capacitor plugin (foreground service + lock-screen media controls).
// Robust by design: uses the Capacitor proxy when present; falls back to the raw
// androidBridge channel; detects the WebView through UA/bridge/origin so a missing
// window.Capacitor can never silently disable background playback again.
export function npDisabled(){ try{ return localStorage.getItem('np_off')==='1' }catch{ return false } }
export function npSetDisabled(v){ try{ v? localStorage.setItem('np_off','1') : localStorage.removeItem('np_off') }catch{} }

const getCap = () => { try{ return window.Capacitor || null }catch{ return null } }
const getProxy = () => { const c = getCap(); try{ return (c && c.Plugins && c.Plugins.NowPlaying) || null }catch{ return null } }
const hasRawBridge = () => { try{ return !!(window.androidBridge && typeof window.androidBridge.postMessage === 'function') }catch{ return false } }

let _nat = false
// NOTE: only a POSITIVE result may be cached. The bridge is injected asynchronously —
// memoizing a false at module-eval time once disabled every native call for the whole session.
export function isNativeApp(){
  if(_nat) return true
  try{
    const cap = getCap()
    const viaCap = !!(cap && ((typeof cap.isNativePlatform==='function' && cap.isNativePlatform()) || cap.isNative))
    const ua = (typeof navigator!=='undefined' && navigator.userAgent) || ''
    const inWebView = /;\s*wv\)/.test(ua)
    const localHost = typeof location!=='undefined' && location.protocol==='https:' && /^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/.test(location.hostname)
    _nat = viaCap || hasRawBridge() || (inWebView && localHost)
  }catch{ _nat = false }
  if(_nat) { try{ window.__npNative = true }catch{} }
  return _nat
}
export function hasNativeBridge(){ return !!(getProxy() || hasRawBridge()) }
export function wvGuess(){
  try{
    const ua = (typeof navigator!=='undefined' && navigator.userAgent) || ''
    return /;\s*wv\)/.test(ua) || (typeof location!=='undefined' && location.protocol==='https:' && /^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/.test(location.hostname))
  }catch{ return false }
}

function rawCall(method, opts){
  try{
    if(!hasRawBridge()) return false
    window.androidBridge.postMessage(JSON.stringify({ pluginId:'NowPlaying', methodId:method, callbackId:'np_'+Math.random().toString(36).slice(2), options: opts || {} }))
    return true
  }catch{ return false }
}

export function npBridgeMode(){
  return getProxy() ? 'proxy' : (hasRawBridge() ? 'raw' : 'none')
}

export function npStart(onAction){
  if(npDisabled()) return ()=>{}
  const p = getProxy()
  if(p){
    let stopped = false, tries = 0
    const setup = ()=>{
      if(stopped) return
      const q = getProxy()
      if(!q){ if(++tries < 12) setTimeout(setup, 500); return }
      try{ if(q.addListener) q.addListener('mediaAction', e => { try{ onAction && onAction(e && e.action) }catch{} }) }catch{}
      try{ q.start && q.start().catch(()=>{}) }catch{}
    }
    setup()
    return ()=>{ stopped = true; try{ p.removeAllListeners && p.removeAllListeners('mediaAction') }catch{} }
  }
  rawCall('start', {})
  return ()=>{}
}

export function npUpdate(meta){
  // Always mirror state to the WebView — the native service READS window.__np directly
  // (evaluateJavascript ticker), so the notification works even if the Capacitor bridge
  // never initializes. Plugin/raw calls below are just the faster path when available.
  try{ if(!npDisabled()) window.__np = Object.assign({}, window.__np||{}, meta, { playing: meta.state ? meta.state!=='paused' : true }) }catch{}
  if(npDisabled()) return
  const p = getProxy()
  if(p){ try{ p.update && p.update(meta).catch(()=>{}) }catch{}; return }
  rawCall('update', meta)
}

export function npStop(){
  try{ const n = window.__np; if(n) window.__np = Object.assign({}, n, {playing:false}) }catch{}
  const p = getProxy()
  if(p){ try{ p.stop && p.stop().catch(()=>{}) }catch{}; return }
  rawCall('stop', {})
}

export async function npPing(){
  const p = getProxy()
  if(!p || !p.ping){
    // No proxy — fall back to the service's document.title heartbeat (eval channel).
    let hb = false, t = ''
    try{ const m = /^SVC\|(\d)\|(.*)$/.exec(document.title||''); if(m){ hb = m[1]==='1'; t = decodeURIComponent(m[2]||'') } }catch{}
    return { plugin: hasRawBridge() || isNativeApp(), service: hb, notif:true, raw: hasRawBridge(), diag: hb ? ('eval-channel • '+t) : 'no bridge; no heartbeat' }
  }
  try{
    const r = await Promise.race([ p.ping(), new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), 2500)) ])
    return { plugin:true, service: !!(r && r.service), notif: !(r && r.notif===false), diag: (r && r.diag) || '' }
  }catch(e){ return { plugin:false, service:false, notif:true } }
}

export async function npNotifGranted(){
  const p = getProxy()
  if(!p || !p.hasNotifPerm) return true
  try{ const r = await p.hasNotifPerm(); return !!(r && r.granted) }catch{ return true }
}
export function npAskNotif(){ const p = getProxy(); try{ p && p.askNotifPerm && p.askNotifPerm().catch(()=>{}) }catch{} }
export function npOpenNotifSettings(){ const p = getProxy(); try{ p && p.openNotifSettings && p.openNotifSettings().catch(()=>{}) }catch{} }

export async function npLastCrash(){
  const p = getProxy()
  if(!p || !p.lastCrash) return ''
  try{ const r = await p.lastCrash(); return (r && r.trace) || '' }catch{ return '' }
}
