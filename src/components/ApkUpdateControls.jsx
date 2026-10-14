import { useEffect, useRef, useState } from 'react'
import { createApkUpdate } from '../lib/apkupdate.js'

export default function ApkUpdateControls({ info, accent, accent2, showToast, primaryLabel = 'Download update', createController = createApkUpdate }){
  const [state, setState] = useState({ status:'idle', percent:0 })
  const controller = useRef(null)
  useEffect(()=>{
    const instance = createController({ onChange:setState, toast:showToast })
    controller.current = instance
    return ()=>{ instance.dispose(); controller.current = null }
  }, [info.build, createController])
  const busy = ['downloading','installing','cancelling'].includes(state.status)
  const retry = ['error','cancelled'].includes(state.status)
  const hasFile = !!state.path && ['permission','installed','error'].includes(state.status)
  const secondary = 'mt-2.5 w-full py-3 rounded-full bg-white/10 border border-white/10 text-sm font-bold hover:bg-white/15'
  return <div className="mt-5">
    {busy && <div role="status" aria-live="polite" className="text-sm text-white/80 mb-3">
      {state.status === 'downloading' ? (state.percent < 0 ? `Downloading… ${Math.round((state.received || 0)/1048576)} MB` : `Downloading… ${state.percent}%`) : state.status === 'cancelling' ? 'Cancelling…' : 'Opening installer…'}
      <div role="progressbar" aria-label="APK download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent < 0 ? undefined : state.percent} className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${state.percent < 0 ? 'animate-pulse' : ''}`} style={{ width:`${state.percent < 0 ? 35 : state.percent}%`, background:accent }}/>
      </div>
    </div>}
    {state.status === 'permission' && <p role="status" className="text-sm text-amber-200 mb-3">Allow “Install unknown apps” for MaxMusic in Settings. Return here, then tap Install / settings. No need to download again.</p>}
    {state.status === 'installed' && <p role="status" className="text-sm text-white/70 mb-3">Tap Install in the system prompt. If you dismissed it, you can open it again.</p>}
    {state.status === 'cancelled' && <p role="status" className="text-sm text-white/70 mb-3">Download cancelled.</p>}
    {state.status === 'external' && <p role="status" className="text-sm text-white/70 mb-3">Download opened in your browser.</p>}
    {state.status === 'error' && <p role="alert" className="text-sm text-red-300 mb-3">{state.error}</p>}
    {!busy && <button onClick={()=> hasFile ? controller.current.installAgain() : retry ? controller.current.retry() : controller.current.start(info.apk)} className="w-full py-3.5 rounded-full text-sm font-extrabold text-black shadow-lg active:scale-[0.99] transition" style={{ background:`linear-gradient(135deg, ${accent}, ${accent2})` }}>{hasFile ? 'Install / settings' : retry ? 'Retry' : primaryLabel}</button>}
    {state.status === 'downloading' && <button onClick={()=> controller.current.cancel()} className={secondary}>Cancel</button>}
    {state.status === 'error' && <button onClick={()=> controller.current.fallback()} className={secondary}>Browser me kholo</button>}
    {!busy && info.apk_mirror && <button onClick={()=> controller.current.start(info.apk_mirror)} className={secondary}>Mirror se download</button>}
  </div>
}
