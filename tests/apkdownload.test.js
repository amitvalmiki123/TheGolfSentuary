import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import React, { act } from 'react'
import { transformWithEsbuild } from 'vite'
import { createDom } from './helpers/playback-dom.js'
import { apkDownloaderReady, downloadWithProgress } from '../src/lib/apkdownload.js'
import { createApkUpdate } from '../src/lib/apkupdate.js'

const defer = () => { let resolve, reject; const promise = new Promise((a,b)=>{ resolve=a; reject=b }); return { promise, resolve, reject } }

async function controlsFixture(){
  const env = await createDom()
  const downloads = [], installs = [], external = [], toasts = []
  let progress, removed = 0, permission = false, cancelCount = 0
  const plugin = {
    ready:async()=>({ available:true, cacheDir:'/cache/updates' }),
    addListener:async(event, callback)=>{ assert.equal(event, 'progress'); progress=callback; return { remove:async()=>{ removed++ } } },
    download:args=>{ const d=defer(); downloads.push({ ...d, args }); return d.promise },
    install:async({ path })=>{ installs.push(path); return { needsPermission:permission } },
    cancel:async()=>{ cancelCount++; downloads.at(-1)?.reject(new Error('Download cancelled')) }
  }
  env.window.Capacitor = { isNativePlatform:()=>true, Plugins:{ ApkDownloader:plugin } }
  const cache=path.resolve('node_modules/.cache/apk-tests')
  await mkdir(cache,{ recursive:true })
  let source=await readFile(new URL('../src/components/ApkUpdateControls.jsx',import.meta.url),'utf8')
  source=source.replace("'../lib/apkupdate.js'", JSON.stringify(new URL('../src/lib/apkupdate.js',import.meta.url).href))
  const { code }=await transformWithEsbuild(source,'ApkUpdateControls.jsx',{ loader:'jsx', jsx:'automatic' })
  const file=path.join(cache,'controls.mjs')
  await writeFile(file,code)
  const Controls=(await import(pathToFileURL(file).href)).default
  const factory=options=>createApkUpdate({ ...options, external:async url=>external.push(url) })
  const root=env.root()
  await act(async()=>root.render(React.createElement(Controls, {
    info:{ build:129, apk:'https://github.com/app.apk', apk_mirror:'https://mirror.example/app.apk' },
    accent:'#aa55ff', accent2:'#5533aa', showToast:text=>toasts.push(text), createController:factory
  })))
  const button = label => [...env.window.document.querySelectorAll('button')].find(b=>b.textContent===label)
  const click=async label=>{ assert.ok(button(label), `Button ${label} present`); await act(async()=>button(label).click()) }
  const complete=async()=>{ await act(async()=>downloads.at(-1).resolve({ path:'/cache/updates/MaxMusic.apk' })) }
  return { env, downloads, installs, external, toasts, button, click, complete,
    progress:async e=>act(async()=>progress(e)), permission:value=>{ permission=value },
    removed:()=>removed, cancelled:()=>cancelCount }
}

test('actual popup: live progress, automatic install, listener cleanup and installer reopen', async()=>{
  const f=await controlsFixture()
  try {
    await f.click('Download update')
    assert.equal(f.downloads[0].args.fileName,'MaxMusic.apk')
    await f.progress({ percent:42, received:42, total:100 })
    assert.match(f.env.window.document.body.textContent,/Downloading… 42%/)
    assert.equal(f.env.window.document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'42')
    await f.complete()
    assert.deepEqual(f.installs,['/cache/updates/MaxMusic.apk'])
    assert.equal(f.removed(),1)
    await f.click('Install / settings')
    assert.equal(f.installs.length,2)
  } finally { await f.env.close() }
})

test('actual popup: needsPermission gives toast and reopens settings/install without redownload', async()=>{
  const f=await controlsFixture()
  try {
    f.permission(true)
    await f.click('Download update'); await f.complete()
    assert.match(f.toasts[0],/Install unknown apps/)
    assert.match(f.env.window.document.body.textContent,/No need to download again/)
    await f.click('Install / settings')
    assert.equal(f.installs.length,2)
    f.permission(false)
    await f.click('Install / settings')
    assert.equal(f.downloads.length,1)
    assert.match(f.env.window.document.body.textContent,/system prompt/)
  } finally { await f.env.close() }
})

test('actual popup: error, browser fallback, retry, mirror and cancel all work', async()=>{
  const f=await controlsFixture()
  try {
    await f.click('Download update')
    await act(async()=>f.downloads[0].reject(new Error('HTTP 503')))
    assert.match(f.env.window.document.querySelector('[role="alert"]').textContent,/HTTP 503/)
    await f.click('Browser me kholo')
    assert.deepEqual(f.external,['https://github.com/app.apk'])
    await f.click('Retry')
    assert.equal(f.downloads[1].args.url,'https://github.com/app.apk')
    await f.click('Cancel')
    assert.equal(f.cancelled(),1)
    assert.equal(f.installs.length,0)
    assert.equal(f.removed(),2)
    await f.click('Mirror se download')
    assert.equal(f.downloads[2].args.url,'https://mirror.example/app.apk')
    await f.complete()
    assert.equal(f.installs.length,1)
  } finally { await f.env.close() }
})

test('bridge: web and missing native plugin keep external fallback; ready diagnostics', async()=>{
  const env=await createDom()
  const opened=[]
  env.window.open=url=>{ opened.push(url); return { focus(){} } }
  try {
    env.window.Capacitor={ isNativePlatform:()=>false }
    assert.deepEqual(await apkDownloaderReady(),{ available:false })
    assert.deepEqual(await downloadWithProgress('https://example.com/web.apk',()=>assert.fail('no web progress')),{ external:true })
    env.window.Capacitor={ isNativePlatform:()=>true, Plugins:{ ApkDownloader:{ ready:async()=>{ throw new Error('Unimplemented') } } } }
    assert.deepEqual(await downloadWithProgress('https://example.com/old.apk'),{ external:true })
    assert.deepEqual(opened,['https://example.com/web.apk','https://example.com/old.apk'])
    env.window.Capacitor.Plugins.ApkDownloader.ready=async()=>({ available:true, cacheDir:'/cache/updates' })
    assert.deepEqual(await apkDownloaderReady(),{ available:true, cacheDir:'/cache/updates' })
  } finally { await env.close() }
})

test('cancel during ready/listener startup and stale download completion never install', async()=>{
  const ready=defer(), events=[], installs=[]
  const controller=createApkUpdate({ onChange:s=>events.push(s),
    download:async(url,progress,{ signal })=>{ await ready.promise; progress({ percent:100 }); return { path:'/cache/app.apk', aborted:signal.aborted } },
    install:async path=>installs.push(path), cancel:async()=>{} })
  const download=controller.start('https://example.com/app.apk')
  const cancelled=controller.cancel()
  ready.resolve()
  await Promise.all([download,cancelled])
  assert.deepEqual(installs,[])
  assert.equal(events.at(-1).status,'cancelled')
  assert.equal(events.filter(e=>e.percent===100).length,0)
})
