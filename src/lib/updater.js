// itrace-27: in-app update checker — compares embedded build no. with the docs/version.json feed.
import { cleanReleaseNotes } from './releasenotes.js'

const VERSION_URL = 'https://raw.githubusercontent.com/amitvalmiki123/TheGolfSentuary/main/docs/version.json'
export const APP_BUILD_NO = Number(import.meta.env.VITE_APP_BUILD_NO || 0)

export async function checkAppUpdate(){
  try{
    const ctrl = new AbortController()
    const t = setTimeout(()=> ctrl.abort(), 9000)
    const day = new Date().toISOString().slice(0, 10)
    const r = await fetch(`${VERSION_URL}?t=${day}`, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    if(!r.ok) return null
    const d = await r.json()
    if(!d || !Number(d.build)) return null
    const features = cleanReleaseNotes(d.notes, d.features)
    return {
      version: d.version || '', build: Number(d.build), apk: d.apk || '', page: d.page || '',
      notes: features, features, date: d.date || '',
      hasUpdate: Number(d.build) > APP_BUILD_NO
    }
  }catch{ return null }
}

export async function openExternal(url){
  if(!url) return
  try{ const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }) }
  catch{ try{ window.open(url, '_blank', 'noopener') }catch{} }
}
