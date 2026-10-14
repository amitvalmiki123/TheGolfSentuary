import { registerPlugin } from '@capacitor/core'
import { openExternal } from './updater.js'

const nativePlugin = registerPlugin('ApkDownloader')
const proxy = () => globalThis.window?.Capacitor?.Plugins?.ApkDownloader || nativePlugin
const native = () => {
  const cap = globalThis.window?.Capacitor
  return !!(cap?.isNativePlatform?.() || cap?.isNative || globalThis.window?.androidBridge)
}

export async function apkDownloaderReady(){
  if(!native()) return { available:false }
  try { return await proxy().ready() } catch { return { available:false } }
}

// Subscribe BEFORE download, remove even on error/cancel. Old APKs and web/PWA
// retain the exact external-browser behaviour when the plugin isn't installed.
export async function downloadWithProgress(url, onProgress, { signal } = {}){
  const ready = await apkDownloaderReady()
  if(signal?.aborted) throw new Error('Download cancelled')
  if(!ready?.available){
    await openExternal(url)
    return { external:true }
  }
  const plugin = proxy()
  const listener = await plugin.addListener('progress', event => {
    if(!signal?.aborted) onProgress?.(event)
  })
  try {
    if(signal?.aborted) throw new Error('Download cancelled')
    return await plugin.download({ url, fileName:'MaxMusic.apk' })
  } finally { await listener.remove() }
}

export async function installApk(path){ return proxy().install({ path }) }
export async function cancelApkDownload(){
  if(native()) { try { await proxy().cancel() } catch {} }
}
