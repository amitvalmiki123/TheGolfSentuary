// Native NowPlaying bridge — Capacitor plugin (foreground service + lock-screen media controls).
// On web/PWA these are no-ops (browser MediaSession handles it there).
const getPlugin = () => {
  try{ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NowPlaying) || null }catch{ return null }
}
export const isNativeApp = () => {
  try{ return !!(window.Capacitor && ((window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.Capacitor.isNative)) }catch{ return false }
}
export function npStart(onAction){
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
  const p = getPlugin()
  if(!p) return
  try{ p.update && p.update(meta).catch(()=>{}) }catch{}
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
