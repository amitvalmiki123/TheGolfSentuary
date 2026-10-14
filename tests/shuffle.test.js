import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { transformWithEsbuild } from 'vite'
import { createDom, fakeYouTube } from './helpers/playback-dom.js'

let importId=0
async function loadApp(){
  // Compile the REAL App; only its network/database/native boundaries are mocked.
  const cache=path.resolve('node_modules/.cache/maxmusic-shuffle-tests')
  await mkdir(cache,{recursive:true})
  let source=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8')
  const api={
    apiBase:'()=>null',
    trendingByCategory:'async()=>globalThis.__playbackFixture.home',
    unifiedSearch:'async()=>[globalThis.__playbackFixture.result]',
    searchSuggestions:'async()=>["rajasthani songs"]',
    searchPiped:'async()=>({tracks:[],nextpage:null})',
    unifiedSearchPaginated:'async()=>({tracks:[],nextpage:null})',
    artistSongsPaginated:'async()=>({tracks:[],nextpage:null})',
    mergeDedup:'(old,fresh)=>(fresh||[]).filter(x=>!(old||[]).some(y=>String(y.id)===String(x.id)))',
    isAuthEnabled:'()=>false', getAuthToken:'()=>null', getLastSearchNextpage:'()=>null',
    resolveDirectAudio:'async()=>globalThis.__playbackFixture.direct || globalThis.__playbackFixture.piped',
    resolvePipedAudio:'async()=>globalThis.__playbackFixture.piped',
    findSaavnRecording:'async()=>null'
  }
  const native={
    isNativeApp:'()=>globalThis.__playbackFixture.native',
    npStart:'()=>()=>{}', npUpdate:'meta=>{ window.__np=meta }', npStop:'()=>{}',
    npDisabled:'()=>false', npLastCrash:'async()=>""', npNotifGranted:'async()=>true',
    npPing:'async()=>({plugin:true,service:true,notif:true})',
    npBridgeMode:'()=>"test"', hasNativeBridge:'()=>false', wvGuess:'()=>false'
  }
  for(const lib of ['api','db','nowplaying','updater']){
    const match=source.match(new RegExp(`import \\{ ([^\\n]+) \\} from '\\./lib/${lib}\\.js'`))
    assert.ok(match,`App import missing: ${lib}`)
    const code=match[1].split(',').map(name=>{
      name=name.trim()
      if(name==='APP_BUILD_NO') return 'export const APP_BUILD_NO=108;'
      let fn=lib==='api'?api[name]:lib==='nowplaying'?native[name]:undefined
      if(name==='checkAppUpdate') fn='async()=>({version:"1.0.0",build:108,hasUpdate:false,notes:[]})'
      return `export const ${name}=${fn||'async()=>[]'};`
    }).join('\n')
    const file=path.join(cache,`${lib}.mjs`)
    await writeFile(file,code)
    source=source.replace(`'./lib/${lib}.js'`,JSON.stringify(pathToFileURL(file).href))
  }
  const tmSrc=await readFile(new URL('../src/lib/trackmeta.js',import.meta.url),'utf8')
  await mkdir(path.join(cache,'lib'),{recursive:true})
  const tmFile=path.join(cache,'lib','trackmeta.js')
  await writeFile(tmFile,tmSrc)
  source=source.replace("'./lib/trackmeta.js'",JSON.stringify(pathToFileURL(tmFile).href))
  const pagerSrc=await readFile(new URL('../src/lib/pager.js',import.meta.url),'utf8')
  const pagerFile=path.join(cache,'lib','pager.js')
  await writeFile(pagerFile,pagerSrc)
  source=source.replace("'./lib/pager.js'",JSON.stringify(pathToFileURL(pagerFile).href))
  const themesSrc=await readFile(new URL('../src/lib/themes.js',import.meta.url),'utf8')
  const themesFile=path.join(cache,'lib','themes.js')
  await writeFile(themesFile,themesSrc)
  source=source.replace("'./lib/themes.js'",JSON.stringify(pathToFileURL(themesFile).href))
  const artistSearchSrc=await readFile(new URL('../src/lib/artistsearch.js',import.meta.url),'utf8')
  const artistSearchFile=path.join(cache,'lib','artistsearch.js')
  await writeFile(artistSearchFile,artistSearchSrc)
  source=source.replace("'./lib/artistsearch.js'",JSON.stringify(pathToFileURL(artistSearchFile).href))
  const proSrc=await readFile(new URL('../src/lib/pro.js',import.meta.url),'utf8')
  const proFile=path.join(cache,'lib','pro.js')
  await writeFile(proFile,proSrc)
  source=source.replace("'./lib/pro.js'",JSON.stringify(pathToFileURL(proFile).href))
  const controls=await readFile(new URL('../src/components/ApkUpdateControls.jsx',import.meta.url),'utf8')
  const controlsSource=controls.replace("'../lib/apkupdate.js'",JSON.stringify(new URL('../src/lib/apkupdate.js',import.meta.url).href))
  const compiledControls=await transformWithEsbuild(controlsSource,'ApkUpdateControls.jsx',{loader:'jsx',jsx:'automatic'})
  const controlsFile=path.join(cache,'ApkUpdateControls.mjs')
  await writeFile(controlsFile,compiledControls.code)
  source=source.replace("'./components/ApkUpdateControls.jsx'",JSON.stringify(pathToFileURL(controlsFile).href))
  const {code}=await transformWithEsbuild(source,'App.jsx',{
    loader:'jsx',jsx:'automatic',jsxImportSource:'react',
    define:{'import.meta.env':'{"BASE_URL":"/","VITE_APP_BUILD_NO":"108"}'}
  })
  const file=path.join(cache,'App.mjs')
  await writeFile(file,code)
  return (await import(pathToFileURL(file).href+`?run=${++importId}`)).default
}

async function mount(kind='audio', count=4){
  const env=await createDom()
  const video=kind !== 'audio'
  const native=kind === 'direct' || kind === 'piped'
  if(native) env.window.Capacitor={isNativePlatform:()=>true}
  globalThis.__playbackFixture={
    native,
    direct:kind === 'direct' ? 'https://maxmusic.test/direct.mp3' : null,
    piped:kind === 'piped' ? 'https://maxmusic.test/piped.mp3' : null,
    home:Array.from({length:count},(_,i)=>({
      id:`song-${i}`,title:`Transport song ${i}`,artist:'Test artist',cover:'',
      audio:video ? null : `https://maxmusic.test/${i}.mp3`,
      videoId:video ? `video-${i}` : null,durationSec:180,durationLabel:'3:00'
    }))
  }
  const players=fakeYouTube(env.window)
  const App=await loadApp()
  env.clock.install()
  const root=env.root()
  await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(App))))
  const buttons=label=>[...env.document.querySelectorAll(`button[aria-label="${label}"]`)]
  const click=async button=>{
    assert.ok(button,'button must exist')
    await act(async()=>button.dispatchEvent(new env.window.MouseEvent('click',{bubbles:true})))
  }
  const player=players.at(-1)
  const audio=()=>env.document.querySelector('audio')
  const end=async()=>{
    await act(async()=>{
      if(kind === 'youtube'){
        player.state=0
        player.emit('onStateChange',{data:0})
      }else{
        audio().__playing=false
        audio().dispatchEvent(new env.window.Event('ended'))
      }
    })
  }
  const play=async i=>{
    const b=[...env.document.querySelectorAll('button')].find(b=>b.textContent.includes(`Transport song ${i}`))
    if(b) await click(b)
    else {
      for(let n=0;n<count && !env.window.__np?.title?.includes(`Transport song ${i}`);n++){
        await click(buttons('Next track')[0])
      }
      assert.ok(env.window.__np?.title?.includes(`Transport song ${i}`))
      if(env.window.__np.state !== 'playing') await click(buttons('Play or pause')[0])
    }
    await act(async()=>env.clock.tick(80))
  }
  const title=()=>env.document.title
  const close=()=>{ env.close(); delete globalThis.__playbackFixture }
  return {env,buttons,click,player,audio,end,play,title,close}
}

for(const kind of ['audio','youtube','direct','piped']){
  test(`${kind}: repeat-one replays same engine at zero, ignoring shuffle (latest mount-time listener state)`,async()=>{
    const app=await mount(kind)
    const {env,click,buttons,player,audio}=app
    try{
      await app.play(1)
      if(kind === 'direct' || kind === 'piped') assert.match(audio().src,new RegExp(`${kind}\\.mp3`))
      const mountedPlayer=player
      await click(buttons('Shuffle')[0])
      await click(buttons('Repeat')[0])
      assert.ok(env.document.body.textContent.includes('Repeat queue'))
      await click(buttons('Repeat')[1]) // phone mini shares desktop state
      assert.ok(env.document.body.textContent.includes('Repeat this song'))
      const before=app.title(), plays=audio().__plays||0
      audio().currentTime=179
      player.position=179
      await app.end()
      assert.equal(app.title(),before)
      if(kind === 'youtube'){
        assert.equal(player.position,0)
        assert.equal(player.state,1)
      }else{
        assert.equal(audio().currentTime,0)
        assert.ok(audio().__plays>plays)
      }
      assert.equal(player,mountedPlayer,'mode changes must not remount the YT listener')
      assert.deepEqual(env.errors,[])
    }finally{ app.close() }
  })

  test(`${kind}: repeat-off stops at last index; repeat-queue wraps`,async()=>{
    const app=await mount(kind)
    try{
      await app.play(3)
      app.audio().currentTime=179
      await app.end()
      assert.ok(app.title().includes('Transport song 3'))
      assert.equal(kind === 'youtube' ? app.player.state : app.audio().paused,kind === 'youtube' ? 2 : true)
      assert.equal(kind === 'youtube' ? app.player.position : app.audio().currentTime,0)
      assert.equal(app.env.window.__np.state,'paused')
      await app.click(app.buttons('Repeat')[0])
      await app.play(3)
      await app.end()
      assert.ok(app.title().includes('Transport song 0'))
      assert.equal(app.env.window.__np.state,'playing')
      assert.deepEqual(app.env.errors,[])
    }finally{ app.close() }
  })
}

test('repeat-off advances before the end; shuffle keeps advancing at the last index',async()=>{
  const app=await mount('youtube')
  try{
    await app.play(0)
    await app.end()
    assert.ok(app.title().includes('Transport song 1'))
    await app.play(3)
    await app.click(app.buttons('Shuffle')[0])
    await app.end()
    assert.ok(!app.title().includes('Transport song 3'))
    assert.equal(app.env.window.__np.state,'playing')
  }finally{ app.close() }
})

test('shuffle visibly reorders only upcoming Queue tracks; desktop/phone mini and full share modes, badges and toasts',async()=>{
  const app=await mount()
  const {env,click,buttons}=app
  try{
    await app.play(0)
    await click(buttons('Open full player')[0])
    await click([...env.document.querySelectorAll('button')].find(b=>b.textContent === 'Queue'))
    const queueOrder=()=>{
      const heading=[...env.document.querySelectorAll('h3')].find(h=>h.textContent === 'Up next')
      return [...heading.parentElement.parentElement.querySelectorAll('button')]
        .map(b=>b.textContent.match(/Transport song \d/)?b.textContent.match(/Transport song \d/)[0]:null).filter(Boolean)
    }
    const before=queueOrder(), title=app.title()
    assert.deepEqual(before,['Transport song 1','Transport song 2','Transport song 3'])
    const random=Math.random
    Math.random=()=>0.999 // identity permutation must still visibly change
    try{ await click(buttons('Shuffle').at(-1)) }finally{ Math.random=random }
    const shuffled=queueOrder()
    assert.notDeepEqual(shuffled,before)
    assert.deepEqual([...shuffled].sort(),[...before].sort())
    assert.equal(app.title(),title,'current track is preserved')
    assert.ok(env.document.body.textContent.includes('Shuffle on — next tracks random'))
    assert.equal(buttons('Shuffle').length,3)
    assert.ok(buttons('Shuffle').every(b=>b.getAttribute('aria-pressed') === 'true'))
    await click(buttons('Shuffle')[1])
    assert.ok(env.document.body.textContent.includes('Shuffle off'))
    assert.deepEqual(queueOrder(),shuffled,'OFF preserves the current queue order')
    assert.ok(buttons('Shuffle').every(b=>b.getAttribute('aria-pressed') === 'false'))
    await click(buttons('Repeat')[0])
    await click(buttons('Repeat')[1])
    assert.equal(buttons('Repeat').length,3)
    assert.ok(buttons('Repeat').every(b=>b.querySelector('svg text')?.textContent === '1'))
    await click(buttons('Repeat').at(-1))
    assert.ok(env.document.body.textContent.includes('Repeat off'))
    assert.ok(buttons('Repeat').every(b=>b.getAttribute('aria-pressed') === 'false' && !b.querySelector('svg text')))
    assert.deepEqual(env.errors,[])
  }finally{ app.close() }
})

for(const kind of ['audio','youtube']){
  test(`${kind}: single-item repeat-queue replays rather than staying ended`,async()=>{
    const app=await mount(kind,1)
    try{
      await app.play(0)
      await app.click(app.buttons('Repeat')[0])
      await app.end()
      assert.equal(kind === 'youtube' ? app.player.state : app.audio().paused,kind === 'youtube' ? 1 : false)
    }finally{ app.close() }
  })
}
