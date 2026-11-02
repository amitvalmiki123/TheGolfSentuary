// IndexedDB helpers for downloads, local files meta and the persisted playback
// session (queue + playback context).
//
// MIGRATION SAFETY (build 133): the database was created at version 1 with
// `downloads` + `localFiles`. Bumping to 2 only ADDS the `playback` store in
// `onupgradeneeded` and re-checks every store, so existing users keep their
// downloads and local files; a fresh install creates all three at once. The
// persisted session carries its own `schema` number and is sanitised on read,
// so a future shape change can ignore (not crash on) an older record.
import { normalizeContext, normalizeAfterSearch, isQueueable } from './playbackcontext.js'

const DB_NAME = 'sur_sangam_db'
const DB_VERSION = 2
const PLAYBACK_STORE = 'playback'
const PLAYBACK_KEY = 'session'
export const PLAYBACK_SCHEMA = 1
export const PLAYBACK_QUEUE_MAX = 120

function openDB(){
  return new Promise((resolve, reject)=>{
    if(typeof indexedDB === 'undefined' || !indexedDB){ reject(new Error('IndexedDB unavailable')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e=>{
      const db = e.target.result
      // Created only when missing — upgrades of v1 databases must not touch
      // the existing stores.
      if(!db.objectStoreNames.contains('downloads')){
        db.createObjectStore('downloads', { keyPath: 'id' })
      }
      if(!db.objectStoreNames.contains('localFiles')){
        db.createObjectStore('localFiles', { keyPath: 'id' })
      }
      if(!db.objectStoreNames.contains(PLAYBACK_STORE)){
        db.createObjectStore(PLAYBACK_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = ()=> resolve(req.result)
    req.onerror = ()=> reject(req.error)
  })
}

export async function saveDownload(track, blob){
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction('downloads','readwrite')
    tx.objectStore('downloads').put({ id: track.id, track, blob, date: Date.now() })
    tx.oncomplete = ()=> res(true)
    tx.onerror = ()=> rej(tx.error)
  })
}
export async function getDownloads(){
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction('downloads','readonly')
    const req = tx.objectStore('downloads').getAll()
    req.onsuccess = ()=> res(req.result||[])
    req.onerror = ()=> rej(req.error)
  })
}
export async function deleteDownload(id){
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction('downloads','readwrite')
    tx.objectStore('downloads').delete(id)
    tx.oncomplete = ()=> res(true)
    tx.onerror = ()=> rej(tx.error)
  })
}
export async function isDownloaded(id){
  const db = await openDB()
  return new Promise((res)=>{
    const tx = db.transaction('downloads','readonly')
    const req = tx.objectStore('downloads').get(id)
    req.onsuccess = ()=> res(!!req.result)
    req.onerror = ()=> res(false)
  })
}

// ---- Playback session (queue + context) -----------------------------------

// Blob URLs die with the document; a restored queue must never hold one.
function stripVolatile(track){
  const copy = { ...track }
  if(typeof copy.audio === 'string' && /^(blob|data):/i.test(copy.audio)) copy.audio = null
  if(copy.__resolvedAudioUrl) delete copy.__resolvedAudioUrl
  return copy
}

// Accept only rows the player can actually use, cap the queue, clamp the
// cursor. Never throws: a corrupt record returns null and the app boots with
// an empty queue.
export function sanitizePlaybackState(raw){
  if(!raw || typeof raw !== 'object') return null
  if(Number(raw.schema) && Number(raw.schema) > PLAYBACK_SCHEMA) return null
  const queue = (Array.isArray(raw.queue) ? raw.queue : [])
    .filter(isQueueable)
    .slice(0, PLAYBACK_QUEUE_MAX)
    .map(stripVolatile)
  if(!queue.length) return null
  let index = Math.floor(Number(raw.index))
  if(!Number.isFinite(index) || index < 0) index = 0
  if(index > queue.length - 1) index = queue.length - 1
  return {
    schema: PLAYBACK_SCHEMA,
    queue,
    index,
    context: normalizeContext(raw.context),
    afterSearch: normalizeAfterSearch(raw.afterSearch),
    savedAt: Number(raw.savedAt) || 0,
  }
}

export async function savePlaybackState(state){
  const clean = sanitizePlaybackState({ ...(state||{}), savedAt: Date.now() })
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction(PLAYBACK_STORE,'readwrite')
    const store = tx.objectStore(PLAYBACK_STORE)
    if(clean) store.put({ id: PLAYBACK_KEY, ...clean })
    else store.delete(PLAYBACK_KEY)
    tx.oncomplete = ()=> res(!!clean)
    tx.onerror = ()=> rej(tx.error)
  })
}

export async function loadPlaybackState(){
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction(PLAYBACK_STORE,'readonly')
    const req = tx.objectStore(PLAYBACK_STORE).get(PLAYBACK_KEY)
    req.onsuccess = ()=> res(sanitizePlaybackState(req.result))
    req.onerror = ()=> rej(req.error)
  })
}

export async function clearPlaybackState(){
  const db = await openDB()
  return new Promise((res,rej)=>{
    const tx = db.transaction(PLAYBACK_STORE,'readwrite')
    tx.objectStore(PLAYBACK_STORE).delete(PLAYBACK_KEY)
    tx.oncomplete = ()=> res(true)
    tx.onerror = ()=> rej(tx.error)
  })
}
