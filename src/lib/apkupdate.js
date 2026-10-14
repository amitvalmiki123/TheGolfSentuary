import { downloadWithProgress, installApk, cancelApkDownload } from './apkdownload.js'
import { openExternal } from './updater.js'

// One transaction owns both download and install. A cancelled/stale transaction
// must never launch an installer or overwrite a newer transaction's progress.
export function createApkUpdate({ onChange, toast, download = downloadWithProgress,
  install = installApk, cancel = cancelApkDownload, external = openExternal }){
  let state = { status:'idle', percent:0, received:0, total:0, path:'', url:'', error:'' }
  let generation = 0, pending = null, abort = null
  const publish = patch => { state = { ...state, ...patch }; onChange({ ...state }) }
  const applyInstall = async (path, gen) => {
    const result = await install(path)
    if(gen !== generation) return
    publish({ status:result?.needsPermission ? 'permission' : 'installed' })
    if(result?.needsPermission) toast?.('Allow “Install unknown apps” for MaxMusic in Settings, then return and tap Install / settings.')
  }
  const controller = {
    getState:()=>({ ...state }),
    start(url){
      if(pending) return pending
      const gen = ++generation
      abort = new AbortController()
      publish({ status:'downloading', percent:0, received:0, total:0, path:'', url, error:'' })
      pending = (async()=>{
        try {
          const result = await download(url, progress => {
            if(gen === generation) publish(progress)
          }, { signal:abort.signal })
          if(gen !== generation) return
          if(result.external) { publish({ status:'external' }); return }
          publish({ status:'installing', percent:100, path:result.path })
          await applyInstall(result.path, gen)
        } catch(error) {
          if(gen === generation) publish({ status:'error', error:error?.message || 'Download failed' })
        }
      })().finally(()=>{ pending = null })
      return pending
    },
    retry(){ return controller.start(state.url) },
    async installAgain(){
      if(pending || !state.path) return
      const gen = ++generation
      publish({ status:'installing', error:'' })
      pending = applyInstall(state.path, gen).catch(error=>{
        if(gen === generation) publish({ status:'error', error:error?.message || 'Installer failed' })
      }).finally(()=>{ pending = null })
      return pending
    },
    async cancel(){
      ++generation
      abort?.abort()
      publish({ status:'cancelling' })
      await cancel()
      await pending
      publish({ status:'cancelled', percent:0, path:'' })
    },
    fallback(){ return external(state.url) },
    dispose(){ ++generation; abort?.abort(); void cancel() }
  }
  return controller
}
