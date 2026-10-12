import { JSDOM } from 'jsdom'
import { act } from 'react'

// Isolated browser/clock/media doubles. No YouTube/Saavn/Render traffic or real
// audio is used: the IFrame SDK's actual target-replacement behavior is simulated.
export async function createDom(){
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url:'https://maxmusic.test/', pretendToBeVisual:true
  })
  const {window} = dom
  const errors = []
  const network = []
  const globals = {
    window, document:window.document, navigator:window.navigator,
    location:window.location, localStorage:window.localStorage,
    Event:window.Event, MouseEvent:window.MouseEvent,
    IntersectionObserver:class { observe(){} disconnect(){} },
    IS_REACT_ACT_ENVIRONMENT:true,
    fetch:async (...args)=>{ network.push(args); throw new Error('Network forbidden in playback regression tests') }
  }
  const previous = new Map()
  const install = (key, value)=>{
    if(!previous.has(key)) previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {value, writable:true, configurable:true})
  }
  for(const [key,value] of Object.entries(globals)) install(key,value)
  window.addEventListener('error', e=>{ errors.push(e.error||e.message); e.preventDefault() })
  window.addEventListener('unhandledrejection', e=>errors.push(e.reason))
  window.scrollTo = ()=>{}
  window.HTMLElement.prototype.scrollIntoView = ()=>{}
  Object.defineProperties(window.HTMLMediaElement.prototype, {
    paused:{configurable:true,get(){ return !this.__playing }},
    duration:{configurable:true,get(){ return 180 }},
    readyState:{configurable:true,get(){ return 4 }},
    play:{configurable:true,value(){ this.__playing=true; this.__plays=(this.__plays||0)+1; return Promise.resolve() }},
    pause:{configurable:true,value(){ this.__playing=false }},
    load:{configurable:true,value(){}}
  })
  window.localStorage.setItem('sur_ver','v3')
  window.localStorage.setItem('sur_auth_choice','guest')
  window.localStorage.setItem('sur_autoplay','0')
  window.localStorage.setItem('sur_update_check',new Date().toISOString().slice(0,10))
  window.localStorage.setItem('sur_liked','["existing-like"]')
  // Load ReactDOM only AFTER a browser exists so its input/change event support
  // matches a real browser instead of the non-DOM Node environment.
  const {createRoot} = await import('react-dom/client')
  const roots = []
  const nativeClearTimeout = globalThis.clearTimeout
  const nativeClearInterval = globalThis.clearInterval
  let now=0, nextId=0
  const timers = new Map()
  const schedule = (callback,delay=0,args=[],repeat=false)=>{
    const id={id:++nextId,ref(){ return this },unref(){ return this }}
    timers.set(id,{callback,args,at:now+Number(delay||0),repeat:repeat?Math.max(1,Number(delay||0)):0})
    return id
  }
  const clock = {
    install(){
      install('setTimeout',(cb,ms,...args)=>schedule(cb,ms,args))
      install('setInterval',(cb,ms,...args)=>schedule(cb,ms,args,true))
      install('clearTimeout',id=>{ if(!timers.delete(id)) nativeClearTimeout(id) })
      install('clearInterval',id=>{ if(!timers.delete(id)) nativeClearInterval(id) })
    },
    tick(ms){
      const until=now+ms
      let runs=0
      while(true){
        const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0]
        if(!due) break
        if(++runs>1000) throw new Error('Runaway test timer')
        const [id,t]=due
        now=t.at
        if(t.repeat) t.at+=t.repeat
        else timers.delete(id)
        t.callback(...t.args)
      }
      now=until
    }
  }
  return {
    window, document:window.document, errors, network, clock,
    root(){ const root=createRoot(window.document.getElementById('root')); roots.push(root); return root },
    close(){
      for(const root of roots) act(()=>root.unmount())
      timers.clear()
      window.close()
      for(const [key,descriptor] of previous){
        if(descriptor) Object.defineProperty(globalThis,key,descriptor)
        else delete globalThis[key]
      }
    }
  }
}

export function fakeYouTube(window, {autoReady=true} = {}){
  const players=[]
  class Player {
    constructor(target,options){
      if(typeof target==='string') target=window.document.getElementById(target)
      if(!target) throw new Error('YouTube target no longer exists')
      this.options=options
      this.frame=window.document.createElement('iframe')
      this.frame.id=target.id
      target.replaceWith(this.frame) // YT.Player really replaces its target DOM node
      this.state=-1; this.video=''; this.destroyCount=0
      players.push(this)
      if(autoReady) queueMicrotask(()=>this.emit('onReady',{target:this}))
    }
    emit(name,event){ this.options.events[name]?.(event) }
    loadVideoById(id){ this.video=id; this.state=1 }
    playVideo(){ this.state=1 }
    pauseVideo(){ this.state=2 }
    getVideoData(){ return {video_id:this.video} }
    getPlayerState(){ return this.state }
    getCurrentTime(){ return 0 }
    getDuration(){ return 180 }
    seekTo(seconds){ this.position=seconds }
    destroy(){ this.destroyCount++; this.frame.remove() }
  }
  window.YT={Player,PlayerState:{ENDED:0,PLAYING:1,PAUSED:2}}
  return players
}
