// IndexedDB helpers for downloads & local files meta
const DB_NAME = 'sur_sangam_db'
const DB_VERSION = 1

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e=>{
      const db = e.target.result
      if(!db.objectStoreNames.contains('downloads')){
        db.createObjectStore('downloads', { keyPath: 'id' })
      }
      if(!db.objectStoreNames.contains('localFiles')){
        db.createObjectStore('localFiles', { keyPath: 'id' })
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
