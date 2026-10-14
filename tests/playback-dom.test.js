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
  const cache=path.resolve('node_modules/.cache/maxmusic-playback-tests')
  await mkdir(cache,{recursive:true})
  let source=await readFile(new URL('../src/App.jsx',import.meta.url),'utf8')
  const api={
    trendingByCategory:'async()=>globalThis.__playbackFixture.home',
    unifiedSearch:'async()=>[globalThis.__playbackFixture.result]',
    searchSuggestions:'async()=>["rajasthani songs"]',
    searchPiped:'async()=>({tracks:[],nextpage:null})',
    unifiedSearchPaginated:'async()=>({tracks:[],nextpage:null})',
    artistSongsPaginated:'async()=>({tracks:[],nextpage:null})',
    mergeDedup:'(old,fresh)=>(fresh||[]).filter(x=>!(old||[]).some(y=>String(y.id)===String(x.id)))',
    isAuthEnabled:'()=>false', getAuthToken:'()=>null', getLastSearchNextpage:'()=>null',
    resolveDirectAudio:'async()=>"https://maxmusic.test/rajasthani-full.mp3"',
    resolvePipedAudio:'async()=>"https://maxmusic.test/rajasthani-full.mp3"',
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

function fixture(native){
  const meta={artist:'Regression test',cover:'',language:'rajasthani',source:'Full audio',durationLabel:'3:00',durationSec:180,color:'#6A418E'}
  return {
    native,
    home:[{...meta,id:'home-one',title:'Home song',audio:'https://maxmusic.test/home.mp3',videoId:null}],
    result:{...meta,id:'rajasthani-result',title:'Rajasthani search result',
      audio:native?null:'https://maxmusic.test/rajasthani-full.mp3',videoId:native?'test-rajasthani-video':null}
  }
}

async function mount({native=false,apiReady=true}={}){
  const env=await createDom()
  globalThis.__playbackFixture=fixture(native)
  if(native) env.window.Capacitor={isNativePlatform:()=>true}
  const players=apiReady?fakeYouTube(env.window):[]
  const App=await loadApp()
  env.clock.install()
  const root=env.root()
  await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(App))))
  return {env,root,players}
}
const close=env=>{ env.close(); delete globalThis.__playbackFixture }

for(const native of [false,true]){
  test(`Rajasthani search → play → audio/CORS recovery stays mounted (${native?'APK direct YouTube audio':'browser audio'})`,async()=>{
    const {env,players}=await mount({native})
    const {window,document}=env
    try{
      const input=document.querySelector('input[placeholder*="Search songs"]')
      assert.ok(input)
      await act(async()=>{
        const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
        setter.call(input,'rajasthani songs')
        input.dispatchEvent(new window.Event('input',{bubbles:true}))
      })
      await act(async()=>env.clock.tick(240))
      const play=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Rajasthani search result'))
      assert.ok(play,'The real search results must be rendered')
      await act(async()=>play.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
      await act(async()=>env.clock.tick(60))
      // itrace-29: the now-playing snapshot must identify THIS track with a
      // bitmap-safe artwork URL and a real duration — not pos/dur 0/0.
      const np0=window.__np||{}
      assert.equal(np0.title,'Rajasthani search result')
      assert.ok(Number(np0.dur)>0,'snapshot duration must not be 0')
      if(native) assert.equal(np0.artUrl,'https://i.ytimg.com/vi/test-rajasthani-video/mqdefault.jpg')
      const firstAudio=document.querySelector('audio')
      const frame=players.at(-1).frame
      assert.equal(firstAudio.getAttribute('crossorigin'),'anonymous')
      assert.ok(firstAudio.__plays>0)

      // This exact App handler recreated the preceding <audio> while YT had
      // replaced React's insertion anchor, producing the user's NotFoundError.
      await act(async()=>firstAudio.dispatchEvent(new window.Event('error')))
      const audio=document.querySelector('audio')
      assert.ok(audio,'App must not unmount into a black screen')
      assert.notEqual(audio,firstAudio)
      assert.equal(audio.getAttribute('crossorigin'),null)
      const host=document.getElementById('yt-player-host')
      assert.ok(host,'React must retain a stable host around the SDK iframe')
      assert.equal(frame.parentNode,host)
      assert.equal(host.querySelector('iframe'),frame)
      await act(async()=>env.clock.tick(400))
      assert.ok(audio.__plays>0,'Existing playback recovery should resume on the replacement element')
      await act(async()=>audio.dispatchEvent(new window.Event('loadedmetadata')))
      assert.ok(document.getElementById('root').firstElementChild)
      assert.equal(window.localStorage.getItem('sur_liked'),'["existing-like"]','No clearing/resetting user data')
      assert.deepEqual(env.errors,[])
      assert.deepEqual(env.network,[])
      // Profile/settings still work. Only the Android app offers an APK check.
      for(const label of ['You','Settings', ...(native ? ['Check'] : [])]){
        const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label)
        assert.ok(button,`Missing ${label} button`)
        await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
      }
      if(native) assert.ok(document.body.textContent.includes('You are already on the latest version'))
      else {
        assert.ok(document.body.textContent.includes('The web app updates automatically.'))
        assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Check'))
      }
      assert.ok(document.body.textContent.includes('Appearance'))
      assert.ok(document.body.textContent.includes('Unlock custom themes with Pro'))
      assert.equal(frame.parentNode,host)
      assert.deepEqual(env.errors,[])
    }finally{ close(env) }
  })
}

test('replacement <audio> after CORS recovery keeps working listeners (itrace-29)',async()=>{
  const {env}=await mount({native:false})
  const {window,document}=env
  try{
    const input=document.querySelector('input[placeholder*="Search songs"]')
    await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
      setter.call(input,'rajasthani songs')
      input.dispatchEvent(new window.Event('input',{bubbles:true}))
    })
    await act(async()=>env.clock.tick(240))
    const play=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Rajasthani search result'))
    await act(async()=>play.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    await act(async()=>env.clock.tick(60))
    const firstAudio=document.querySelector('audio')
    // First failure: React recovery swaps the element (no-cors) without
    // crashing, and the transient error state is cleared because the
    // REPLACEMENT element already has metadata — that only happens when the
    // listeners were re-attached to the new node (attach-time loadedmetadata).
    await act(async()=>firstAudio.dispatchEvent(new window.Event('error')))
    const replacement=document.querySelector('audio')
    assert.ok(replacement && replacement!==firstAudio,'recovery must swap the audio element')
    await act(async()=>env.clock.tick(500))
    assert.ok(!document.body.textContent.includes('Playback failed'),'replacement listeners must run (loadedmetadata clears the error)')
    // Prove the replacement element's own error listener is alive: a second
    // failure must be reported by IT (no further element swap happens here).
    await act(async()=>replacement.dispatchEvent(new window.Event('error')))
    await act(async()=>env.clock.tick(120))
    assert.ok(document.body.textContent.includes('Playback failed'),'replacement element error listener must report failures')
    assert.deepEqual(env.errors,[])
  }finally{ close(env) }
})

test('StrictMode with a preloaded SDK destroys the old player and ignores its late events',async()=>{
  const {env,root,players}=await mount()
  try{
    assert.equal(players.length,2)
    assert.equal(players[0].destroyCount,1)
    assert.equal(env.document.querySelectorAll('#yt-player-host iframe').length,1)
    const title=env.document.title
    await act(async()=>{
      players[0].emit('onReady',{target:players[0]})
      players[0].emit('onStateChange',{data:1})
      players[0].emit('onError',{data:100})
    })
    assert.equal(env.document.title,title,'Disposed SDK events must not restart playback')
    act(()=>root.unmount())
    assert.equal(players[1].destroyCount,1)
    assert.equal(env.document.getElementById('root').childNodes.length,0)
    assert.deepEqual(env.errors,[])
  }finally{ close(env) }
})

test('late SDK readiness after app unmount cannot recreate a detached player',async()=>{
  const {env,root}=await mount({apiReady:false})
  try{
    const ready=env.window.onYouTubeIframeAPIReady
    assert.equal(typeof ready,'function')
    assert.equal(env.document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').length,1)
    act(()=>root.unmount())
    const players=fakeYouTube(env.window)
    await act(async()=>ready())
    assert.equal(players.length,0)
    assert.equal(env.document.getElementById('root').childNodes.length,0)
    assert.deepEqual(env.errors,[])
  }finally{ close(env) }
})

test('pending SDK script is reused and duplicate readiness does not replace the React host',async()=>{
  const {env,root}=await mount({apiReady:false})
  try{
    assert.equal(env.document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').length,1)
    const players=fakeYouTube(env.window)
    await act(async()=>env.window.onYouTubeIframeAPIReady())
    const host=env.document.getElementById('yt-player-host')
    await act(async()=>env.window.onYouTubeIframeAPIReady())
    assert.equal(players.length,1)
    assert.ok(host)
    assert.equal(players[0].frame.parentNode,host)
    const newerCallback=()=>{}
    env.window.onYouTubeIframeAPIReady=newerCallback
    act(()=>root.unmount())
    assert.equal(players[0].destroyCount,1)
    assert.equal(env.window.onYouTubeIframeAPIReady,newerCallback)
    assert.deepEqual(env.errors,[])
  }finally{ close(env) }
})
