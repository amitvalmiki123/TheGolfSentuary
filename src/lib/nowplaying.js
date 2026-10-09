// Native NowPlaying bridge — Capacitor plugin (foreground service + lock-screen media controls).
// On web/PWA these are no-ops (browser MediaSession handles it there).
export function npDisabled(){ try{ return localStorage.getItem('np_off')==='1' }catch{ return false } }
export function npSetDisabled(v){ try{ v? localStorage.setItem('np_off','1') : localStorage.removeItem('np_off') }catch{} }

const getPlugin = () => {
  try{ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NowPlaying) || null }catch{ return null }
}
export const isNativeApp = () => {
  try{ return !!(window.Capacitor && ((window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.Capacitor.isNative)) }catch{ return false }
}
export function npStart(onAction){
  if(npDisabled()) return ()=>{}
  let p = null, stopped = false, tries = 0
  const setup = ()=>{
    if(stopped) return
    p = getPlugin()
    if(!p){ tries++; if(tries < 12) setTimeout(setup, 500); return }
    try{
      if(p.addListener) p.addListener('mediaAction', e => { try{ onAction && onAction(e && e.action) }catch{} })
      p.start && p.start().catch(()=>{})
    }catch{}
  }
  setup()
  return ()=>{ stopped = true; try{ p && p.removeAllListeners && p.removeAllListeners('mediaAction') }catch{} }
}
export function npUpdate(meta){
  if(npDisabled()) return
  const p = getPlugin()
  if(p){ try{ p.update && p.update(meta).catch(()=>{}) }catch{} ; return }
  // plugin not ready yet — retry a few times so a slow bridge never loses the CURRENT meta
  let n = 0
  const tick = ()=>{
    const q = getPlugin()
    if(q){ try{ q.update && q.update(meta).catch(()=>{}) }catch{}; return }
    if(++n < 8) setTimeout(tick, 400)
  }
  setTimeout(tick, 400)
}
export function npStop(){
  const p = getPlugin()
  if(!p) return
  try{ p.stop && p.stop().catch(()=>{}) }catch{}
}

export async function npNotifGranted(){
  const p = getPlugin()
  if(!p || !p.hasNotifPerm) return true
  try{ const r = await p.hasNotifPerm(); return !!(r && r.granted) }catch{ return true }
}
export function npAskNotif(){
  const p = getPlugin()
  try{ p && p.askNotifPerm && p.askNotifPerm().catch(()=>{}) }catch{}
}
export function npOpenNotifSettings(){
  const p = getPlugin()
  try{ p && p.openNotifSettings && p.openNotifSettings().catch(()=>{}) }catch{}
}

export async function npPing(){
  const p = getPlugin()
  if(!p || !p.ping) return { plugin:false, service:false, notif:true }
  try{
    const r = await Promise.race([ p.ping(), new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), 2500)) ])
    return { plugin:true, service: !!(r && r.service), notif: !(r && r.notif===false) }
  }catch(e){ return { plugin:false, service:false, notif:true } }
}

export async function npLastCrash(){
  const p = getPlugin()
  if(!p || !p.lastCrash) return ''
  try{ const r = await p.lastCrash(); return (r && r.trace) || '' }catch{ return '' }
}
