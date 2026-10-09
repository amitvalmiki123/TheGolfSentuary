// Native NowPlaying bridge — Capacitor plugin (foreground service + lock-screen media controls).
// On web/PWA these are no-ops (browser MediaSession handles it there).
const getPlugin = () => {
  try{ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NowPlaying) || null }catch{ return null }
}
export const isNativeApp = () => {
  try{ return !!(window.Capacitor && ((window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.Capacitor.isNative)) }catch{ return false }
}
export function npStart(onAction){
  const p = getPlugin()
  if(!p) return null
  try{
    if(p.addListener) p.addListener('mediaAction', e => { try{ onAction && onAction(e && e.action) }catch{} })
    p.start && p.start().catch(()=>{})
  }catch{}
  return ()=>{ try{ p.removeAllListeners && p.removeAllListeners('mediaAction') }catch{} }
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
