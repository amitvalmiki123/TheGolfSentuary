import { useEffect, useRef, useState, useMemo } from 'react'
import { unifiedSearch, unifiedSearchPaginated, searchPiped, getRelatedTracks, trendingByCategory, fetchCategoryPage, fetchArtistProfile, artistSongs, artistSongsPaginated, resolvePipedAudio, resolveDirectAudio, searchSaavn, findSaavnRecording, searchSuggestions, getLastSearchNextpage, fetchLyrics, mergeDedup, apiSignup, apiDeleteAccount, apiLogin, apiMe, apiLogout, isAuthEnabled, getAuthToken, apiPushLikes, apiPullLikes, apiPushPlaylists, apiPullPlaylists, apiRedeemPro, apiSetPlan, warmBackend } from './lib/api.js'
import { checkAppUpdate, openExternal, APP_BUILD_NO } from './lib/updater.js'
import { saveDownload, getDownloads, deleteDownload } from './lib/db.js'
import { npStart, npUpdate, npStop, isNativeApp, npNotifGranted, npAskNotif, npAskBattery, npOpenNotifSettings, npPing, npLastCrash, npSetDisabled, npDisabled, npBridgeMode, hasNativeBridge, wvGuess } from './lib/nowplaying.js'
import { trackKeyOf, createTrackTracker, buildSnapshot, activeEngine, nativeArtUrl, coverCandidates } from './lib/trackmeta.js'
import { createPager } from './lib/pager.js'
import { THEMES, effectiveTheme } from './lib/themes.js'

const BASE = import.meta.env.BASE_URL || '/'
// In the native app (Capacitor WebView) pretend the page is always visible — stops the
// WebView/YouTube-iframe 'tab hidden' auto-pause so music keeps playing when locked/backgrounded.
try{
  if(typeof window!=='undefined' && window.Capacitor && ((window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.Capacitor.isNative)){
    Object.defineProperty(document, 'hidden', { get: ()=> false, configurable: true })
    Object.defineProperty(document, 'visibilityState', { get: ()=> 'visible', configurable: true })
  }
}catch(e){}
// Global error strip: JS/React errors show right on screen (plain DOM — survives React unmount),
// so a black screen always carries its own diagnosis.
try{
  if(typeof window!=='undefined'){
    const showErr = (msg)=>{
      try{
        let el = document.getElementById('__errbar')
        if(!el){
          el = document.createElement('div')
          el.id = '__errbar'
          el.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;background:#7f1d1d;color:#fff;font:11px/1.5 system-ui;padding:8px 34px 8px 12px;border-radius:10px;max-height:34vh;overflow:auto;white-space:pre-wrap;box-shadow:0 8px 30px rgba(0,0,0,.5)'
          const x = document.createElement('button')
          x.textContent = '\u00d7'
          x.style.cssText = 'position:absolute;top:4px;right:6px;background:transparent;border:none;color:#fff;font-size:16px'
          x.onclick = ()=>{ el.style.display='none' }
          el.appendChild(x)
          const span = document.createElement('span'); span.id='__errtext'; el.appendChild(span)
          document.body.appendChild(el)
        }
        const t = document.getElementById('__errtext')
        t.textContent = (t.textContent ? t.textContent.slice(-1200)+'\n---\n' : '') + String(msg).slice(0,800)
        el.style.display = 'block'
      }catch(_){ }
    }
    window.addEventListener('error', (e)=> showErr((e && e.message) || String(e)))
    window.addEventListener('unhandledrejection', (e)=> { try{ showErr('promise: '+((e.reason && (e.reason.message||e.reason.stack)) || e.reason)) }catch(_){ } })
  }
}catch(e){}

const fallbackTracks = [] // no dummy/tone tracks — live music only (user demand)

const defaultPlaylists = []

// v2: ek baar purane demo likes/playlists clear — defaults ab khali (user demand)
const isRealTrack = (x)=> !!(x && (x.videoId || (typeof x.audio==='string' && x.audio.startsWith('http') && !x.audio.includes('/audio/tone') && !x.audio.includes('...'))))
try{ if(localStorage.getItem('sur_ver')!=='v3'){ ['sur_liked','sur_liked_map','sur_playlists','sur_recent'].forEach(k=> localStorage.removeItem(k)); localStorage.setItem('sur_ver','v3') } }catch{}

const categories = [
  { id:"All", label:"All", icon:"✨" },
  { id:"Hindi", label:"Hindi", icon:"🇮🇳" },
  { id:"Punjabi", label:"Punjabi", icon:"🔥" },
  { id:"Love", label:"Love", icon:"💜" },
  { id:"90s", label:"90s Hits", icon:"📻" },
  { id:"Bollywood", label:"Bollywood", icon:"🎬" },
  { id:"Indie", label:"Indie", icon:"🌙" },
  { id:"Trending", label:"Trending", icon:"📈" },
  { id:"New", label:"New Releases", icon:"🆕" },
]

const categoryMap = {
  Hindi: [1,2,3,4,5,12,13,11,14,6,7,15],
  Punjabi: [6,7,15,11,1,2,3,4,5,12],
  Love: [1,3,4,5,14,11,12,13,2,6,7,15],
  "90s": [4,5,12,13,2,1,3,11,14,6],
  Bollywood: [1,2,4,5,11,12,13,3,14,6,7,15],
  Indie: [14,11,3,6,7,15,1,2,4,5],
  Trending: [9,10,8,1,7,6,15,11,2,3,12,13],
  New: [2,3,6,11,14,1,4,5,12,13,7,15],
}

function getCategoryTracks(cat){
  if(cat==="All" || !categoryMap[cat]) return fallbackTracks
  const ids = categoryMap[cat]
  return ids.map(id=> fallbackTracks.find(t=> t.id===id)).filter(Boolean)
}
const allArtists = [
  { name:"Sidhu Moose Wala", image:"", cat:"Punjabi", plays:"1.6B" },
  { name:"AP Dhillon", image:"", cat:"Punjabi", plays:"890M" },
  { name:"Diljit Dosanjh", image:"", cat:"Punjabi", plays:"1.2B" },
  { name:"Mankirt Aulakh", image:"", cat:"Punjabi", plays:"620M" },
  { name:"Karan Aujla", image:"", cat:"Punjabi", plays:"780M" },
  { name:"Shubh", image:"", cat:"Punjabi", plays:"740M" },
  { name:"Arijit Singh", image:"", cat:"Hindi", plays:"2.4B" },
  { name:"Shreya Ghoshal", image:"", cat:"Hindi", plays:"1.1B" },
  { name:"Jubin Nautiyal", image:"", cat:"Hindi", plays:"980M" },
  { name:"Pritam", image:"", cat:"Bollywood", plays:"1.4B" },
  { name:"Anuv Jain", image:"", cat:"Indie", plays:"340M" },
  { name:"Kumar Sanu", image:"", cat:"90s", plays:"890M" },
  { name:"Alka Yagnik", image:"", cat:"90s", plays:"760M" },
  { name:"The Weeknd", image:"", cat:"Trending", plays:"4.2B" },
]

function getFilteredArtists(cat){
  if(cat==="All") return allArtists
  if(cat==="Punjabi") return allArtists.filter(a=> a.cat==="Punjabi")
  if(cat==="Hindi") return allArtists.filter(a=> a.cat==="Hindi"||a.cat==="Bollywood")
  if(cat==="Bollywood") return allArtists.filter(a=> a.cat==="Bollywood"||a.cat==="Hindi")
  if(cat==="Love") return allArtists // mood, not a language — artists across languages
  if(cat==="90s") return allArtists.filter(a=> a.cat==="90s")
  if(cat==="Indie") return allArtists.filter(a=> a.cat==="Indie")
  if(cat==="Trending") return allArtists
  return allArtists.filter(a=> a.cat===cat)
}

function getCategoryPlaylists(cat){
  if(cat==="All" || !categoryMap[cat]) return defaultPlaylists
  const ids = categoryMap[cat]
  // filter playlists where any song matches category
  return defaultPlaylists.filter(pl=> pl.songs.some(s=> ids.includes(s)))
}

function formatTime(s){ if(!isFinite(s)) return "0:00"; const m=Math.floor(s/60); const sec=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}` }

// Bump on every player/resolver release — proves WHICH apk build a screenshot came from.
const APP_BUILD = 'itrace-29'
const APP_VERSION = '2.5'
const FREE_DL_MAX = 5
const PRO_CODES = ['MAXMUSIC79']
const STR = {
en:{nav_home:'Home',nav_search:'Search',nav_library:'Your Library',nav_profile:'Profile',navb_home:'Home',navb_search:'Search',navb_library:'Library',navb_profile:'You',gm_morning:'Good morning',gm_afternoon:'Good afternoon',gm_evening:'Good evening',searchPh:'Search songs, artists, albums…',curated:'Curated for you',recent:'Recently played',showall:'Show all',playall:'Play All',retry:'Retry',loadmore:'Load more — scroll for auto-load',loadingmore:'Loading more music…',theend:'End of list • try another vibe',showing:'Showing',tracksWd:'tracks',scrollauto:'Scroll down for auto-load (total, not just 20-25)',ylib:'Your Library',wd_liked:'liked',wd_playlists:'playlists',wd_local:'local',wd_offline:'offline',newpl:'New Playlist',addlocal:'Add Local',libtab_Playlists:'Playlists',libtab_Liked:'Liked',libtab_Local:'Local',libtab_Downloads:'Downloads',libtab_Songs:'Songs',tab_Overview:'Overview',tab_Playlists:'Playlists',tab_Listening:'Listening',tab_Settings:'Settings',playlists:'Playlists',downloads:'Downloads',liked:'Liked',listeningstats:'Listening Stats',minutes:'Minutes streamed',songsplayed:'Songs played',topgenre:'Top genre',likedsongs:'Liked songs',offlinesongs:'Offline songs',localfiles:'Local files',recentpl:'Recent Playlists',nopl:'No playlists yet',share:'Share Profile',editp:'Edit Profile',save:'Save',cancel:'Cancel',settings:'Settings',pro:'MaxMusic Pro',goPro:'Go Pro ₹79',quality:'Streaming Quality',eq:'Equalizer',muslang:'Music Languages',applang:'App Language',sleep:'Sleep Timer',off:'Off',onlinemusic:'Online music',offlinemode:'Offline Mode',cloudsync:'Cloud sync',signin:'Sign in',signout:'Sign out',clearhist:'Clear recent history',clearsearch:'Clear recent searches',clearall:'Clear All Data',version:'Version',follow:'Follow',following:'Following',autoplay:'Autoplay',on:'On'},
hi:{nav_home:'होम',nav_search:'खोजें',nav_library:'आपकी लाइब्रेरी',nav_profile:'प्रोफ़ाइल',navb_home:'होम',navb_search:'खोजें',navb_library:'लाइब्रेरी',navb_profile:'आप',gm_morning:'सुप्रभात',gm_afternoon:'नमस्ते',gm_evening:'शुभ संध्या',searchPh:'गाने, कलाकार, एल्बम खोजें…',curated:'आपके लिए',recent:'हाल में बजाए',showall:'सभी देखें',playall:'सभी बजाएं',retry:'फिर कोशिश',loadmore:'और लोड करें — स्क्रॉल पे ऑटो',loadingmore:'और गाने आ रहे…',theend:'सूची खत्म • कोई और vibe देखो',showing:'दिख रहे',tracksWd:'गाने',scrollauto:'नीचे स्क्रॉल पे ऑटो-लोड (पूरे, सिर्फ 20-25 नहीं)',ylib:'आपकी लाइब्रेरी',wd_liked:'पसंदीदा',wd_playlists:'प्लेलिस्ट',wd_local:'लोकल',wd_offline:'ऑफ़लाइन',newpl:'नई प्लेलिस्ट',addlocal:'लोकल जोड़ें',libtab_Playlists:'प्लेलिस्ट',libtab_Liked:'पसंदीदा',libtab_Local:'लोकल',libtab_Downloads:'डाउनलोड',libtab_Songs:'गाने',tab_Overview:'झलक',tab_Playlists:'प्लेलिस्ट',tab_Listening:'सुनना',tab_Settings:'सेटिंग्स',playlists:'प्लेलिस्ट',downloads:'डाउनलोड',liked:'पसंदीदा',listeningstats:'सुनने के आंकड़े',minutes:'मिनट सुने',songsplayed:'गाने बजाए',topgenre:'टॉप जॉनर',likedsongs:'पसंदीदा गाने',offlinesongs:'ऑफ़लाइन गाने',localfiles:'लोकल फ़ाइलें',recentpl:'ताज़ा प्लेलिस्ट',nopl:'अभी कोई प्लेलिस्ट नहीं',share:'प्रोफ़ाइल शेयर करें',editp:'प्रोफ़ाइल बदलें',save:'सेव',cancel:'रद्द',settings:'सेटिंग्स',pro:'MaxMusic Pro',goPro:'Pro लें ₹79',quality:'स्ट्रीमिंग क्वालिटी',eq:'इक्वलाइज़र',muslang:'म्यूज़िक भाषाएं',applang:'ऐप भाषा',sleep:'स्लीप टाइमर',off:'बंद',onlinemusic:'ऑनलाइन म्यूज़िक',offlinemode:'ऑफ़लाइन मोड',cloudsync:'क्लाउड सिंक',signin:'साइन इन',signout:'साइन आउट',clearhist:'हाल की हिस्ट्री साफ़ करें',clearsearch:'हाल की खोज साफ़ करें',clearall:'सारा डेटा साफ़ करें',version:'वर्ज़न',follow:'फ़ॉलो',following:'फ़ॉलोइंग',autoplay:'ऑटोप्ले',on:'चालू'}}
const EQ_PRESETS = { Flat:[0,0,0,0,0], Pop:[3,1,0,1,3], Rock:[5,3,-1,2,4], Bass:[7,5,1,0,0], Dance:[5,3,0,2,4], Vocal:[-1,1,3,4,2], Treble:[-1,0,1,4,6] }
const EQ_FREQS = ['60 Hz','230 Hz','910 Hz','3.6 kHz','14 kHz']
// Float tracks matching the user's Music Languages to the top (unknown-language tracks stay)
function floatLangs(tracks, langs){
  try{
    const L = langs || JSON.parse(localStorage.getItem('sur_langs')||'[]')
    if(!Array.isArray(L) || !L.length || !Array.isArray(tracks)) return tracks
    const rank = x=>{ const l=String(x.language||'').toLowerCase(); if(!l) return 1; return L.some(s=> l.includes(String(s).toLowerCase()))?0:2 }
    return [...tracks].sort((a,b)=> rank(a)-rank(b))
  }catch{ return tracks }
}

function NpDiagCard({ toast, engine }){
  // Self-contained on purpose: ProfileView and App are different components — earlier this
  // card read App-scoped state from ProfileView's JSX and ReferenceError'd the whole app.
  const [svc, setSvc] = useState('')
  const [bgDiag, setBgDiag] = useState(null)
  const [sdl, setSdl] = useState([])
  const [artF, setArtF] = useState('')
  const T = toast || (()=>{})
  const readSdl = ()=>{ try{ setSdl((window.__searchDiag||[]).slice(-2)) }catch(e){} }
  const ping = ()=>{ try{ npPing().then(r=>setBgDiag(r)).catch(()=>setBgDiag({plugin:false,service:false,notif:true})) }catch(e){ setBgDiag({plugin:false,service:false,notif:true}) }; readSdl(); try{ setArtF(String(window.__artFail||'')) }catch(e){} }
  useEffect(()=>{
    let tries = 0
    const id = setInterval(()=>{
      try{ const el = document.getElementById('__svc'); setSvc((el && el.textContent) || '') }catch(e){ setSvc('') }
      ping()
      if(++tries > 6) clearInterval(id)   // then rely on manual Re-check
    }, 1600)
    ping()
    return ()=> clearInterval(id)
  },[])
  let np = null
  try{ const m = /^NP\|(\d)\|([^|]*)\|(.*)$/.exec(document.title||''); if(m) np = { play: m[1]==='1', title:(m[2]||'').trim(), artist:(m[3]||'').trim() } }catch(e){}
  const ok = !!(bgDiag && bgDiag.plugin && bgDiag.service && bgDiag.notif)
  const link = np ? ('app→svc: '+(np.play?'▶ playing':'⏸ paused')+' · '+(np.title||'')) : 'app→svc: idle (play a song)'
  const svcTxt = svc ? ('svc→app: '+svc) : ('svc→app: '+(isNativeApp()||hasNativeBridge()||wvGuess() ? 'no heartbeat yet — ticker silent' : 'browser — no native engine'))
  return (
    <div className="mt-4 rounded-2xl border p-3 text-xs max-w-md"
         style={{ background:'rgba(255,255,255,.04)', borderColor: ok? 'rgba(16,185,129,.5)' : 'rgba(245,158,11,.4)' }}>
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 shrink-0 rounded-full animate-pulse" style={{ background: ok? '#10b981' : '#f59e0b' }}/>
        <span className="min-w-0 flex-1 leading-relaxed text-white/70">
          {link}<br/>{svcTxt}
        </span>
        {bgDiag && !bgDiag.notif ? (
          <button onClick={()=> npOpenNotifSettings()} className="shrink-0 rounded-full bg-white px-3 py-1.5 font-bold text-black hover:bg-white/90">Turn on</button>
        ) : (
          <button onClick={ping} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 font-semibold text-white/70 hover:text-white">Re-check</button>
        )}
        <button onClick={()=>{ npSetDisabled(!npDisabled()); T(npDisabled()? 'Native player OFF (safe mode)' : 'Native player ON'); setTimeout(ping, 800) }}
                className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-white/60 hover:text-white">{npDisabled()? 'Safe mode: ON — tap OFF' : 'Safe mode: off'}</button>
        <button onClick={npAskBattery} className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-white/60 hover:text-white">Unfreeze</button>
      </div>
      <div className="mt-1.5 break-all opacity-60" style={{ fontFamily:'ui-monospace,monospace', fontSize:10 }}>
        app:{APP_BUILD} {'·'} bridge:{npBridgeMode()} {engine ? ('· audio: '+engine) : ''} {bgDiag && bgDiag.diag ? ('· ping: '+bgDiag.diag) : ''}{artF ? (' · artfail:'+artF) : ''}{sdl && sdl.length ? (<><br/>search: {sdl.join(' · ')}</>) : ''}
      </div>
    </div>
  )
}

export default function App(){
  // player
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.85)
  const [isMuted, setIsMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(0)
  const [liked, setLiked] = useState(()=> {
    try{ const v = JSON.parse(localStorage.getItem('sur_liked')||'null'); return v? new Set(v): new Set() }catch{ return new Set() }
  })
  const [playlists, setPlaylists] = useState(()=>{
    try{ const v=JSON.parse(localStorage.getItem('sur_playlists')||'null'); return v||defaultPlaylists }catch{ return defaultPlaylists }
  })
  const [localSongs, setLocalSongs] = useState([])
  const [downloaded, setDownloaded] = useState([]) // array of {id, track}
  const [downloadingId, setDownloadingId] = useState(null)

  // UI
  const [search, setSearch] = useState("")
  const [onlineResults, setOnlineResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [activeCat, setActiveCat] = useState("All")
  const activeCatRef = useRef("All")
  activeCatRef.current = activeCat
  const [nav, setNav] = useState("home") // home, search, library, profile
  const [libTab, setLibTab] = useState("Playlists") // Playlists, Songs, Liked, Local, Downloads
  const [showFull, setShowFull] = useState(false)
  const touchRef = useRef(null)
  const wakeLockRef = useRef(null)
  const [showQueue, setShowQueue] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyrics, setLyrics] = useState(null)
  const [bgDiag, setBgDiag] = useState(null)
  const [crashTrace, setCrashTrace] = useState('')
  const [crashOpen, setCrashOpen] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const lyricsBoxRef = useRef(null)
  const lyricSeqRef = useRef(0)
  const [showCreatePl, setShowCreatePl] = useState(false)
  const [newPlName, setNewPlName] = useState("")
  const [showAddToPl, setShowAddToPl] = useState(null) // track id
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [toast, setToast] = useState(null)
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [recentlyPlayed, setRecentlyPlayed] = useState(()=>{ try{ return (JSON.parse(localStorage.getItem('sur_recent')||'[]')||[]).filter(isRealTrack) }catch{ return [] } })
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [homeTracks, setHomeTracks] = useState([])
  const homeTracksRef = useRef([])
  homeTracksRef.current = homeTracks
  const [homeErr, setHomeErr] = useState(false)
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeNextPage, setHomeNextPage] = useState(null)
  const homeNextRef = useRef(null)
  const homePagerRef = useRef(null); if(!homePagerRef.current) homePagerRef.current = createPager()
  const searchPagerRef = useRef(null); if(!searchPagerRef.current) searchPagerRef.current = createPager()
  const searchRef = useRef('')
  const homePageRef = useRef(0)
  const homeLoadMoreRef = useRef(null)
  const lastProgRef = useRef(0)
  const [homeEnded, setHomeEnded] = useState(false)
  const setNext = (v)=>{ homeNextRef.current = v; setHomeNextPage(v) }
  const [homeLoadingMore, setHomeLoadingMore] = useState(false)
  const homeSentinelRef = useRef(null)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState(null) // playlist id -> detail page (itrace-24)
  const [showAllArtists, setShowAllArtists] = useState(false)
  const [artistTracks, setArtistTracks] = useState([])
  const artistTracksRef = useRef([])
  const [artistNextPage, setArtistNextPage] = useState(null)
  const [artistLoadingMore, setArtistLoadingMore] = useState(false)
  const [artistPageOpen, setArtistPageOpen] = useState(false)
  const [artistProfile, setArtistProfile] = useState(null)
  const [artistTotal, setArtistTotal] = useState(null)
  const [artistEnded, setArtistEnded] = useState(false)
  const [artistLoading, setArtistLoading] = useState(false)
  const artistPagerRef = useRef(null); if(!artistPagerRef.current) artistPagerRef.current = createPager()
  const artistNextRef = useRef(null)
  const artistSeqRef = useRef(0)
  const artistInputRef = useRef(null)
  const artistSentinelRef = useRef(null)
  const [searchPage, setSearchPage] = useState(1)
  const onlineResultsRef = useRef([])
  const [searchNextPage, setSearchNextPage] = useState(null)
  const searchSentinelRef = useRef(null)
  // YouTube-style: search history + live suggestions
  const [history, setHistory] = useState(()=>{ try{ const h = JSON.parse(localStorage.getItem('sur_history')||'[]'); return Array.isArray(h)? h.filter(x=> typeof x==='string' && x.trim()).slice(0,12) : [] }catch{ return [] } })
  const [sugg, setSugg] = useState([])
  const [suggOpen, setSuggOpen] = useState(false)
  const [searchNoMore, setSearchNoMore] = useState(false)
  const suggTimerRef = useRef(null)
  const suggSeqRef = useRef(0)
  const lastCommittedRef = useRef('')
  useEffect(()=>{ try{ localStorage.setItem('sur_history', JSON.stringify(history)) }catch{} },[history])

  // user
  const [user, setUser] = useState(()=>{
    try{ const v=JSON.parse(localStorage.getItem('sur_user')||'null'); return v||{ name:"Amit Valmiki", email:"amit@sur-sangam.app", avatar:"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=60", plan:"Free", followers: 342, following: 89, bio:"Music lover • Jaipur • Arijit & Sidhu fan" } }catch{ return { name:"Amit Valmiki", email:"amit@sur-sangam.app", avatar:"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=60", plan:"Free", followers:342, following:89, bio:"Music lover • Jaipur • Arijit & Sidhu fan" }}
  })
  const [editUser, setEditUser] = useState(null)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const ytHostRef = useRef(null)
  const ytReadyRef = useRef(false)
  const [ytReady, setYtReady] = useState(false)
  const ytProgressRef = useRef(null)
  const current = queue[currentIndex] || null
  const npKey = trackKeyOf(current) // stable identity of the audible track (itrace-29)

  // persist
  useEffect(()=>{ localStorage.setItem('sur_liked', JSON.stringify([...liked])) },[liked])
  // cloud account state (MaxMusic backend)
  const [authUser, setAuthUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const cacheAuth = (u)=>{ try{ localStorage.setItem('sur_auth_user', JSON.stringify(u||null)) }catch{} }
  const isPro = user.plan==='Pro' || user.plan==='Premium'
  const [lang, setLang] = useState(()=>{ try{ return localStorage.getItem('sur_lang')||'en' }catch{ return 'en' } })
  const t = (k)=>{ try{ return (STR[lang]&&STR[lang][k]) || STR.en[k] || k }catch{ return k } }
  const [quality, setQuality] = useState(()=>{ try{ return localStorage.getItem('sur_quality')||'std' }catch{ return 'std' } })
  const [langs, setLangs] = useState(()=>{ try{ const v=JSON.parse(localStorage.getItem('sur_langs')||'null'); return Array.isArray(v)&&v.length?v:['hindi','punjabi','english'] }catch{ return ['hindi','punjabi','english'] } })
  const [sleepMin, setSleepMin] = useState(()=>{ try{ return Number(localStorage.getItem('sur_sleep')||0)||0 }catch{ return 0 } })
  const [autoplay, setAutoplay] = useState(()=>{ try{ const v=localStorage.getItem('sur_autoplay'); return v===null?true:v==='1' }catch{ return true } })
  const [eq, setEq] = useState(()=>{ try{ const v=JSON.parse(localStorage.getItem('sur_eq')||'null'); if(v&&Array.isArray(v.gains)&&v.gains.length===5) return {on:false,preset:v.preset||'Flat',gains:v.gains} /* itrace-25: boot flat */ }catch{}; return {on:false,preset:'Flat',gains:[0,0,0,0,0]} })
  const [showEQ, setShowEQ] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [showUpdate, setShowUpdate] = useState(false)
  const [updChecking, setUpdChecking] = useState(false)
  const [themeId, setThemeId] = useState(()=>{ try{ return localStorage.getItem('sur_theme') || 'midnight' }catch{ return 'midnight' } })
  const activeTheme = effectiveTheme(themeId, isPro)
  useEffect(()=>{
    try{
      localStorage.setItem('sur_theme', activeTheme.id)
      document.documentElement.dataset.theme = activeTheme.id
      document.documentElement.style.setProperty('--mx-accent', activeTheme.accent)
      document.documentElement.style.setProperty('--mx-accent2', activeTheme.accent2)
      document.documentElement.style.setProperty('--mx-bg', activeTheme.bg)
    }catch{}
  },[activeTheme.id, activeTheme.accent, activeTheme.accent2, activeTheme.bg])
  const selectTheme = (theme)=>{
    if(theme.pro && !isPro){ showToast('Custom themes are a Pro feature'); setShowSubscribe(true); return }
    setThemeId(theme.id)
    showToast(`${theme.name} theme applied`)
  }
  const [stats, setStats] = useState(()=>{ try{ const v=JSON.parse(localStorage.getItem('sur_stats')||'null'); if(v&&typeof v==='object') return {secs:v.secs||0,plays:v.plays||0,langs:v.langs||{}} }catch{}; return {secs:0,plays:0,langs:{}} })
  const [followed, setFollowed] = useState(()=>{ try{ return new Set(JSON.parse(localStorage.getItem('sur_followed')||'[]')) }catch{ return new Set() } })
  const [proStep, setProStep] = useState('plans')
  const [proCode, setProCode] = useState('')
  const [proErr, setProErr] = useState('')
  useEffect(()=>{ try{ localStorage.setItem('sur_lang', lang) }catch{} },[lang])
  useEffect(()=>{ try{ localStorage.setItem('sur_quality', quality) }catch{} },[quality])
  useEffect(()=>{ try{ localStorage.setItem('sur_langs', JSON.stringify(langs)) }catch{} },[langs])
  useEffect(()=>{ try{ localStorage.setItem('sur_sleep', String(sleepMin)) }catch{} },[sleepMin])
  useEffect(()=>{ try{ localStorage.setItem('sur_autoplay', autoplay?'1':'0') }catch{} },[autoplay])
  useEffect(()=>{ try{ localStorage.setItem('sur_eq', JSON.stringify(eq)) }catch{} },[eq])
  useEffect(()=>{ if(showSubscribe){ setProStep('plans'); setProErr(''); setProCode('') } },[showSubscribe])
  const [authForm, setAuthForm] = useState({ mode:'login', name:'', email:'', password:'' })
  const [authBusy, setAuthBusy] = useState(false)
  // First-run welcome gate: login/signup/guest. Fresh install (bhi delete-karke-waapas)
  // = no sur_auth_choice + no footprint → gate. Upgraders slip through silently.
  const [wasFresh] = useState(()=>{ try{ return !localStorage.getItem('sur_user') && !localStorage.getItem('sur_auth_choice') }catch{ return true } })
  const [showWelcome, setShowWelcome] = useState(()=>{
    try{
      if(localStorage.getItem('sur_auth_choice')) return false
      if(getAuthToken()){ try{ localStorage.setItem('sur_auth_choice','user') }catch{}; return false }
      if(localStorage.getItem('sur_liked') || localStorage.getItem('sur_playlists') || localStorage.getItem('sur_recent') || localStorage.getItem('sur_history') || localStorage.getItem('sur_user')){ try{ localStorage.setItem('sur_auth_choice','guest') }catch{}; return false }
      return true
    }catch{ return true }
  })
  const [welcomeMode, setWelcomeMode] = useState('home')
  const [welcomeErr, setWelcomeErr] = useState('')
  const chooseGuest = ()=>{
    try{ localStorage.setItem('sur_auth_choice','guest') }catch{}
    if(wasFresh){ try{ setUser({ name:'Guest', email:'', avatar:'https://api.dicebear.com/7.x/initials/svg?seed=Guest&backgroundColor=6A418E,D5AA55&radius=50', plan:'Free', followers:0, following:0, bio:'' }) }catch{} }
    setShowWelcome(false)
    showToast('Guest mode — enjoy 🎧 (You tab se login kar sakte ho)')
  }
  const handleWelcomeSubmit = async ()=>{
    const { mode, name, email, password } = authForm
    if(!email.trim() || password.length < 6){ setWelcomeErr(mode==='login' ? 'Email + 6-char password chahiye' : 'Naam, email + 6-char password chahiye'); return }
    setWelcomeErr(''); setAuthBusy(true)
    try{
      const u = mode==='login' ? await apiLogin(email.trim(), password) : await apiSignup(name.trim()||email.split('@')[0], email.trim(), password)
      if(u){
        setAuthUser(u); cacheAuth(u)
        setUser(prev=> ({ ...prev, email: u.email||email.trim(), plan: u.plan||prev.plan, name: prev._edited?prev.name:(u.name||prev.name), avatar: prev._edited?prev.avatar:(u.avatar||prev.avatar) }))
        try{ localStorage.setItem('sur_auth_choice','user') }catch{}
        setShowWelcome(false); setAuthForm({ mode:'login', name:'', email:'', password:'' })
        showToast(`Welcome ${u.name||''} ☁ liked + playlists ab cloud me save`)
      } else setWelcomeErr('Server reachable nahi / galat credentials — Guest try karo')
    } finally { setAuthBusy(false) }
  }
  const likedMetaRef = useRef((()=>{ try{ return JSON.parse(localStorage.getItem('sur_liked_map')||'{}') }catch{ return {} } })())
  const likeSyncTimer = useRef(null)
  const plSyncTimer = useRef(null)
  const plFirstRun = useRef(true)
  useEffect(()=>{ localStorage.setItem('sur_playlists', JSON.stringify(playlists)) },[playlists])
  useEffect(()=>{ try{ localStorage.setItem('sur_user', JSON.stringify(user)) }catch{} },[user])
  // restore cloud session on load
  useEffect(()=>{ (async()=>{
    if(!isAuthEnabled() || !getAuthToken()) return
    try{ const cached = JSON.parse(localStorage.getItem('sur_auth_user')||'null'); if(cached && cached.email) setAuthUser(cached) }catch{}
    const me = await apiMe().catch(()=> null)
    if(me){ cacheAuth(me); setAuthUser(me); setUser(prev=> ({ ...prev, email: me.email||prev.email, plan: me.plan||prev.plan, name: prev._edited?prev.name:(me.name||prev.name), avatar: prev._edited?prev.avatar:(me.avatar||prev.avatar) })) }
  })() },[])
  useEffect(()=>{ // itrace-26: local Pro record heals server plan + survives login/boot (email match)
    if(!authUser || !authUser.email) return
    try{
      const rec = JSON.parse(localStorage.getItem('sur_pro')||'null')
      if(rec && rec.plan==='Pro' && String(rec.email||'').toLowerCase()===String(authUser.email).toLowerCase()){
        setUser(prev=> (prev.plan==='Pro'||prev.plan==='Premium')? prev : ({...prev, plan:'Pro'}))
        pushLocalProToServer(authUser.email).catch(()=>{})
      }
    }catch{}
  },[authUser])
  const runUpdateCheck = async (manual)=>{
    if(updChecking) return
    setUpdChecking(true)
    try{
      const r = await checkAppUpdate()
      try{ localStorage.setItem('sur_update_check', new Date().toISOString().slice(0,10)) }catch{}
      if(r && r.hasUpdate){ setUpdateInfo(r); setShowUpdate(true); if(manual) showToast('A new update is ready to install') }
      else if(manual) showToast(r? 'You are already on the latest version' : 'Could not check for updates. Please check your connection.')
    }catch{ if(manual) showToast('Could not check for updates. Please check your connection.') }
    setUpdChecking(false)
  }
  useEffect(()=>{ // itrace-27: auto update check, roz ek baar
    let alive = true
    const id = setTimeout(()=>{
      if(!alive) return
      try{
        if(typeof navigator!=='undefined' && !navigator.onLine) return
        const today = new Date().toISOString().slice(0,10)
        if(localStorage.getItem('sur_update_check')===today) return
      }catch{}
      runUpdateCheck(false)
    }, 4000)
    return ()=>{ alive=false; clearTimeout(id) }
  },[])
  // pull liked + playlists when session active
  useEffect(()=>{ if(!authUser) return; (async()=>{
    try{
      const remote = await apiPullLikes()
      if(remote && remote.length){
        likedMetaRef.current = { ...likedMetaRef.current }
        remote.forEach(x=>{ if(x&&x.tid) likedMetaRef.current[x.tid]=x })
        localStorage.setItem('sur_liked_map', JSON.stringify(likedMetaRef.current))
        const ids = remote.map(x=>x&&x.tid).filter(Boolean)
        setLiked(prev=>{ const changed = ids.some(id=> !prev.has(id) && !prev.has(Number(id))); if(!changed) return prev; const s = new Set(prev); ids.forEach(id=> s.add(id)); try{ localStorage.setItem('sur_liked', JSON.stringify([...s])) }catch{}; return s })
      }
      const rpl = await apiPullPlaylists()
      if(rpl && rpl.length){
        setPlaylists(prev=>{ const ids = new Set(prev.map(x=>x.id)); const add = rpl.filter(x=>x&&x.id&&!ids.has(x.id)); if(!add.length){ plFirstRun.current=false; return prev } plFirstRun.current=false; return [...prev, ...add] })
      }
      plFirstRun.current = false
    }catch{}
  })() },[authUser])
  // debounce-push liked + playlists to cloud
  useEffect(()=>{ if(!authUser) return; clearTimeout(likeSyncTimer.current); likeSyncTimer.current = setTimeout(()=>{ apiPushLikes(Object.values(likedMetaRef.current)) }, 1500) },[liked, authUser])
  useEffect(()=>{ if(!authUser) return; if(plFirstRun.current){ plFirstRun.current=false; return } clearTimeout(plSyncTimer.current); plSyncTimer.current = setTimeout(()=>{ apiPushPlaylists(playlists) }, 2500) },[playlists, authUser])
  useEffect(()=>{ localStorage.setItem('sur_recent', JSON.stringify(recentlyPlayed.filter(isRealTrack).slice(0,30))) },[recentlyPlayed])
  useEffect(()=>{
    getDownloads().then(setDownloaded)
    // online only — no hardcoded fallback
    setHomeTracks([])
    setHomeLoading(true)
    trendingByCategory('Trending', 24).then(t=>{
      if(t && t.length){
        setQueue(t)
        setHomeTracks(t.slice(0,12))
      }
      setHomeLoading(false)
    }).catch(()=> setHomeLoading(false))
  },[])
  // home category tracks — ONLINE primary, fallback to local if online empty (so UI not dummy)
  useEffect(()=>{
    let cancelled=false, hadCache=false
    const qcat = activeCat==="All"? 'Trending' : activeCat
    try{
      const cc = JSON.parse(localStorage.getItem('sur_home_'+qcat)||'null')
      if(cc && Array.isArray(cc.tracks) && cc.tracks.length >= 6 && Date.now()-cc.at < 6*60*60*1000){ setHomeTracks(floatLangs(cc.tracks)); setHomeLoading(false); hadCache=true }
      else { setHomeTracks([]); setHomeLoading(true) }
    }catch{ setHomeTracks([]); setHomeLoading(true) }
    setNext(null)
    homePageRef.current = 0
    setHomeEnded(false)
    homePagerRef.current = createPager()
    fetchCategoryPage(activeCat, null, 30, langs).then(({ tracks:t, nextCursor })=>{
      if(cancelled) return
      if(t && t.length){
        const full = t.filter(x=> !x.isPreview)
        const list = floatLangs(mergeDedup([], full.length >= 6 ? full : t))
        try{ localStorage.setItem('sur_home_'+qcat, JSON.stringify({ at: Date.now(), tracks: list.slice(0,30) })) }catch{}
        setHomeTracks(list)
        setNext(nextCursor || null)
        if(!nextCursor) setHomeEnded(true)
        setRecentlyPlayed(prev=>{
          const filtered = prev.filter(x=>{
            const low=(x.title||"").toLowerCase()
            return !(low.includes("street fried")||low.includes("cooking")||low.includes("gta 5")||low.includes("china street")||low.includes("chain together"))
          })
          if(filtered.length!==prev.length) return filtered
          return prev
        })
      } else {
        if(!cancelled){ if(!hadCache){ setHomeTracks([]); setHomeErr(true) } setHomeLoading(false) }
        return
      }
      setHomeLoading(false)
    }).catch(()=>{ if(!cancelled){ if(!hadCache){ setHomeTracks([]); setHomeErr(true) } setHomeLoading(false) }})
    return ()=> { cancelled=true }
  },[activeCat, langs])

  // Infinite scroll for home category. The pager advances through
  // duplicate-only / filtered-empty provider pages (valid new cursor) and
  // only ends on real provider exhaustion — never on a client page cap.
  const handleLoadMoreHome = async()=>{
    const pager = homePagerRef.current
    const token = homeNextRef.current
    if(!pager || pager.inFlight || pager.done || !token) return
    setHomeLoadingMore(true)
    const catAtStart = activeCat
    const langsAtStart = langs
    try{
      const res = await pager.run(token, async(cur)=>{
        const page = await fetchCategoryPage(catAtStart, cur, 24, langsAtStart)
        const batch = mergeDedup(homeTracksRef.current || [], (page.tracks||[]).filter(x=> x && x.audio || x && x.videoId))
        return { added: batch, nextCursor: page.nextCursor || null }
      }, added=>{ if(activeCatRef.current === catAtStart) setHomeTracks(prev=> [...prev, ...mergeDedup(prev, added)]) })
      if(activeCatRef.current !== catAtStart || homePagerRef.current !== pager) return
      if(res.status === 'ok' || res.status === 'advanced' || res.status === 'error'){
        if(res.done){ setNext(null); setHomeEnded(true); if(res.status === 'ok') showToast('End of available results for this feed') }
        else setNext(res.nextCursor)
      }
    }finally{ setHomeLoadingMore(false) }
  }

  homeLoadMoreRef.current = handleLoadMoreHome
  useEffect(()=>{
    if(homeLoading || !homeNextPage) return
    const el = homeSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting && !(homePagerRef.current && homePagerRef.current.inFlight) && homeNextRef.current){
        try{ homeLoadMoreRef.current && homeLoadMoreRef.current() }catch{}
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return ()=> io.disconnect()
  }, [homeLoading, homeNextPage, homeTracks.length])
  // Scroll backup — if the observer ever misses, near-bottom scroll still auto-loads
  useEffect(()=>{
    let last = 0
    const onScroll = ()=>{
      const now = Date.now(); if(now - last < 350) return; last = now
      if((homePagerRef.current && homePagerRef.current.inFlight) || !homeNextRef.current) return
      const el = homeSentinelRef.current; if(!el) return
      try{ if(el.getBoundingClientRect().top < window.innerHeight + 500){ homeLoadMoreRef.current && homeLoadMoreRef.current() } }catch{}
    }
    window.addEventListener('scroll', onScroll, { passive:true })
    return ()=> window.removeEventListener('scroll', onScroll)
  },[])
  // REAL lyrics: fetch per track (LRCLIB synced LRC); nothing shown until verified — no dummy ever
  useEffect(()=>{
    if(!current){ setLyrics(null); setShowLyrics(false); return }
    const seq = ++lyricSeqRef.current
    setLyrics(null); setLyricsLoading(true)
    fetchLyrics(current).then(l=>{
      if(seq !== lyricSeqRef.current) return
      setLyrics(l && l.lines ? l : null)
      setLyricsLoading(false)
      if(l && l.synced) setShowLyrics(true)
    }).catch(()=>{ if(seq === lyricSeqRef.current){ setLyrics(null); setLyricsLoading(false) } })
  },[current && current.id, current && current.title, current && current.artist])
  // auto-scroll to active line
  useEffect(()=>{
    if(!showLyrics || !lyrics || !lyrics.synced) return
    const box = lyricsBoxRef.current
    if(!box) return
    const el = box.querySelector('[data-active="1"]')
    if(!el) return
    const top = el.offsetTop - box.clientHeight/2 + el.clientHeight/2
    if(Math.abs(box.scrollTop - top) > 140){ try{ box.scrollTo({ top, behavior:'smooth' }) }catch{ box.scrollTop = top } }
  },[progress, showLyrics, lyrics])

  // Media Session + background playback
  useEffect(()=>{
    if(!current) return
    if('mediaSession' in navigator){
      try{
        // Re-bind metadata ONLY when track/art actually changes — re-creating
        // MediaMetadata on every play/pause made system UI re-fetch artwork
        // and restart the title marquee (itrace-29). Artwork is the bitmap-safe
        // normalized URL, or omitted entirely when the track has none.
        const art = nativeArtUrl(current)
        const sig = npKey + '|' + art
        if(msKeyRef.current !== sig){
          msKeyRef.current = sig
          navigator.mediaSession.metadata = new MediaMetadata({
            title: current.title || '',
            artist: current.artist || '',
            album: current.album || '',
            artwork: art ? [{src: art, sizes:'512x512', type:'image/jpeg'}] : []
          })
        }
        navigator.mediaSession.setActionHandler('play', ()=> setIsPlaying(true))
        navigator.mediaSession.setActionHandler('pause', ()=> setIsPlaying(false))
        navigator.mediaSession.setActionHandler('nexttrack', handleNext)
        navigator.mediaSession.setActionHandler('previoustrack', handlePrev)
      }catch(e){}
    }
    try{ navigator.mediaSession.playbackState = isPlaying? 'playing':'paused' }catch{}
  },[current, isPlaying])
  // keep playing in background — Android keeps a PWA's audio alive ONLY when it sees an
// active media session (playbackState + positionState) — that also powers the notification.
  useEffect(()=>{
    if(!('mediaSession' in navigator)) return
    try{ navigator.mediaSession.playbackState = isPlaying? 'playing':'paused' }catch{}
    // screen wake-lock while player open (auto-releases when minimized)
    try{
      if(isPlaying && 'wakeLock' in navigator && !document.hidden){ if(!wakeLockRef.current) navigator.wakeLock.request('screen').then(s=>{ wakeLockRef.current=s; s.addEventListener('release',()=>{ wakeLockRef.current=null }) }).catch(()=>{}) }
      else if(!isPlaying && wakeLockRef.current){ try{ wakeLockRef.current.release() }catch{}; wakeLockRef.current=null }
    }catch{}
  },[isPlaying])
  useEffect(()=>{
    if(!isPlaying || !('mediaSession' in navigator)) return
    const tick = ()=>{
      try{
        // Read the ACTIVE engine live — the old closure republished a stale
        // captured `progress` until isPlaying/duration happened to change.
        const { pos, dur } = readLivePosition(activeEngine(currentRef.current, directForRef.current))
        if(dur>1) navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(pos||0, dur), playbackRate: 1 })
      }catch{}
    }
    tick()
    const id = setInterval(tick, 2000)
    return ()=> clearInterval(id)
  },[isPlaying, duration, npKey])
  // re-acquire wake lock when returning to app
  useEffect(()=>{
    const onVis = ()=> {
      if(!document.hidden && isPlaying){
        if('wakeLock' in navigator && !wakeLockRef.current){ try{ navigator.wakeLock.request('screen').then(s=>{ wakeLockRef.current=s; s.addEventListener('release',()=>{ wakeLockRef.current=null }) }).catch(()=>{}) }catch{} }
        if(current?.videoId && ytReadyRef.current && ytPlayerRef.current?.playVideo){
          ytPlayerRef.current.playVideo()
        } else if(audioRef.current && audioRef.current.paused){
          audioRef.current.play().catch(()=>{})
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return ()=> document.removeEventListener('visibilitychange', onVis)
  },[isPlaying, current])
  useEffect(()=>{
    if(!isPlaying || !('mediaSession' in navigator)) return
    try{ navigator.mediaSession.playbackState = 'playing' }catch{}
  },[isPlaying])
  // ---- NATIVE background + lock-screen controls (foreground service plugin) ----
  // Android 13+: without POST_NOTIFICATIONS the media notification (and bg protection) can't exist — nudge + re-ask
  const bgPing = async()=>{ try{ const r = await npPing(); setBgDiag(r) }catch{ setBgDiag({plugin:false,service:false,notif:true}) } }
  // ── Native background playback fix: YouTube's iframe player pauses itself when the page is
  // hidden (cross-origin, unstoppable). Inside the APK we therefore resolve the SAME video to a
  // direct mp3 stream (Piped) and play it through the plain <audio> element — no iframe policy,
  // decoder stays alive, music survives minimize/lock. Web keeps the video UI.
  const [ytDirect, setYtDirect] = useState({id:null, url:''})
  const [directErr, setDirectErr] = useState('')
  const directFor = (current && current.videoId && ytDirect.id===String(current.videoId)) ? ytDirect.url : ''
  useEffect(()=>{
    if(!isNativeApp() || !current?.videoId) return
    if(current.audio && String(current.audio).startsWith('http')) return
    const vid = String(current.videoId); let cancelled=false
    // Live-sync failure notes while the race runs (diagnosis appears progressively)
    const tick = setInterval(()=>{ if(cancelled) return; try{ const e = window.__ytDirectErr||''; setDirectErr(prev => prev===e ? prev : e) }catch(err){} }, 1200)
    ;(async()=>{
      try{
        const cache = (window.__ytAudioCache = window.__ytAudioCache || {})
        if(vid in cache){ setYtDirect({id:vid, url:cache[vid]||''}); if(!cancelled) setDirectErr(cache[vid] ? '' : (window.__ytDirectErr||'')); return }
        const u = await resolveDirectAudio({ videoId: vid, host: current.host })
        if(!cancelled){ setYtDirect({id:vid, url:u||''}); setDirectErr(u ? '' : (window.__ytDirectErr||'')) }
      }catch(e){ if(!cancelled){ setYtDirect({id:vid, url:''}); setDirectErr(window.__ytDirectErr||'') } }
      finally{ clearInterval(tick) }
    })()
    return ()=>{ cancelled = true; clearInterval(tick) }
  },[current && current.videoId])
  // pick up last-run crash trace written by the native crash reporter
  useEffect(()=>{
    if(!isNativeApp()) return
    let alive = true
    if(npDisabled()){ try{ setTimeout(()=>showToast('Safe mode ON — background player disabled. Turn it off in You tab.'), 1200) }catch{} }
    npLastCrash().then(t=>{ if(alive && t && t.trim()){ setCrashTrace(t.trim()); setCrashOpen(true) } }).catch(()=>{})
    try{ warmBackend() }catch(e){}
    return ()=>{ alive = false }
  },[])
  useEffect(()=>{
    if(!isNativeApp()) return
    let alive = true
    let tries = 0
    const id = setInterval(()=>{ bgPing(); if(++tries>5) clearInterval(id) }, 900)
    const check = async()=>{
      try{
        const ok = await npNotifGranted()
        if(!alive) return
        if(!ok){ try{ npAskNotif() }catch{} } // itrace-25: ask silently, no banner
      }catch{}
    }
    check()
    return ()=>{ clearInterval(id); alive=false }
    const recheck = ()=>{ if(!document.hidden || true) check() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return ()=>{ alive = false; window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck) }
  },[])
  const npActionRef = useRef(null)
  const npLastActRef = useRef({})
  const currentRef = useRef(null)
  const isPlayingRef = useRef(false)
  currentRef.current = current
  isPlayingRef.current = isPlaying
  onlineResultsRef.current = onlineResults
  searchRef.current = search
  artistTracksRef.current = artistTracks
  // itrace-29: single identity/generation + live-position source shared by
  // every now-playing writer (bridge push, window.__np, MediaSession).
  const npTrackerRef = useRef(null); if(!npTrackerRef.current) npTrackerRef.current = createTrackTracker()
  const progressRef = useRef(0); progressRef.current = progress
  const durationRef = useRef(0); durationRef.current = duration
  const directForRef = useRef(''); directForRef.current = directFor
  const msKeyRef = useRef('')
  const npKeyRef = useRef(''); npKeyRef.current = npKey
  // Which track each engine's live pos/dur currently belongs to. Until an
  // engine proves it loaded THIS track (loadedmetadata / matching video id),
  // its element can still hold the PREVIOUS song — its duration/position must
  // never be reused for the new track (audit fix, itrace-29).
  const liveKeyRef = useRef({ audio:'', yt:'' })
  // Position/duration from the engine that is ACTUALLY audible: the YT iframe
  // only when it (not a direct <audio> stream) is playing this track; never
  // from an inactive element still holding the previous song.
  const readLivePosition = (engine)=>{
    let pos = progressRef.current || 0, dur = durationRef.current || 0
    const key = trackKeyOf(currentRef.current)
    try{
      if(engine === 'yt'){
        if(liveKeyRef.current.yt !== key) return { pos, dur } // player still on previous video
        const p = ytPlayerRef.current
        if(p){
          if(p.getCurrentTime){ const ct = p.getCurrentTime(); if(isFinite(ct)) pos = ct }
          if(p.getDuration){ const d = p.getDuration(); if(isFinite(d) && d > 0) dur = d }
        }
      } else {
        if(liveKeyRef.current.audio !== key) return { pos, dur } // element still on previous song
        const a = audioRef.current
        if(a){
          if(isFinite(a.currentTime)) pos = a.currentTime
          if(isFinite(a.duration) && a.duration > 0) dur = a.duration
        }
      }
    }catch{}
    return { pos, dur }
  }
  const makeNpSnapshot = (extra)=>{
    const tr = currentRef.current; if(!tr) return null
    const info = npTrackerRef.current.update(tr)
    const engine = activeEngine(tr, directForRef.current)
    let pos, dur
    // A real track change starts at 0 with the NEW track's own duration —
    // live elements still hold the previous song at this instant.
    if(info.changed && !(extra && (extra.pos != null || extra.dur != null))){ pos = 0; dur = 0 }
    else { const live = readLivePosition(engine); pos = live.pos; dur = live.dur }
    if(extra){ if(extra.pos != null) pos = extra.pos; if(extra.dur != null) dur = extra.dur }
    return buildSnapshot({ track: tr, key: info.key, gen: info.gen, playing: isPlayingRef.current, engine, pos, dur })
  }
  const pushNpMeta = (extra)=>{ try{ const s = makeNpSnapshot(extra); if(s) npUpdate(s) }catch{} }
  npActionRef.current = (a)=>{
    // Service delivers every action TWICE (plugin listener + zero-bridge eval) with the
    // same stale isPlaying — toggle-style handling made pause a no-op and next skip 2.
    // Idempotent set + 700ms guard fixes both.
    const now = Date.now()
    try{ if(now - (npLastActRef.current[a]||0) < 700) return; npLastActRef.current[a] = now }catch{}
    if(a==='next') handleNext()
    else if(a==='prev') handlePrev()
    else if(a==='play'){ if(currentRef.current) setIsPlaying(true) }
    else if(a==='pause'){ setIsPlaying(false) }
    else if(a==='stop'){ setIsPlaying(false); npStop() }
  }
  useEffect(()=>{
    const off = npStart(a=>{ if(npActionRef.current) npActionRef.current(a) })
    return ()=>{ try{ if(typeof off==='function') off() }catch{} }
  },[])
  useEffect(()=>{
    // No isNativeApp() gate: npUpdate self-noops when no bridge exists (browser) — a
    // mis-detected native app must NEVER be able to kill the notification metadata flow.
    if(!current){ npStop(); return }
    // Snapshot carries LIVE pos/dur (preserved through pause/resume and
    // metadata-only refreshes) — the old hard pos:0/dur:0 here wiped the
    // notification seekbar at every track start / play-state flip (itrace-29).
    pushNpMeta()
  },[npKey, isPlaying])
  // Real track change: in-app seekbar starts clean with the new track's own
  // declared duration until the active engine reports the true one.
  useEffect(()=>{
    lastProgRef.current = 0
    setProgress(0)
    setDuration((current && current.durationSec) || 0)
  },[npKey])
  // Service ticker calls this every 1.2s while it believes we're playing — defeats YouTube's
  // iframe auto-pause (hidden small player) within ~1s, from native, bridge-independent.
  // Zero-bridge meta channel: the native ticker reads WebView.getTitle() — the app encodes
  // playing-state + track into document.title on every change. Bridge can be dead; this works.
  useEffect(()=>{
    try{
      document.title = current
        ? ('NP|'+(isPlaying?1:0)+'|'+String(current.title||'').replace(/\|/g,'·').slice(0,60)+'|'+String(current.artist||'').replace(/\|/g,'·').slice(0,40))
        : 'MaxMusic'
    }catch(e){}
  },[npKey, isPlaying])
  // Native → JS actions with zero bridge: service evals window.__npAct('play'|'pause'|...)
  useEffect(()=>{ try{ window.__npAct = (a)=>{ try{ npActionRef.current && npActionRef.current(a) }catch(e){} } }catch(e){} },[])
  window.__npKeepAlive = ()=>{
    try{
      if(!isPlaying || (scrubRef && scrubRef.current) || !current) return
      if(current.videoId && !directFor && ytPlayerRef.current){
        const st = ytPlayerRef.current.getPlayerState && ytPlayerRef.current.getPlayerState()
        if(st !== undefined && st !== 1 && st !== -1) ytPlayerRef.current.playVideo()
      } else if(audioRef.current && audioRef.current.paused){
        audioRef.current.play().catch(()=>{})
      }
    }catch(e){}
  }
  // Native → JS seek with zero bridge: service evals window.__npSeek(sec) on seekbar drag.
  window.__npSeek = (s)=>{ try{ seekToTime(Number(s)||0) }catch(e){} }
  // pushNpMeta/makeNpSnapshot live with the np refs above — one snapshot
  // source for the watchdog, seeks and metadata refreshes (itrace-29).
  // Native watchdog: (a) re-push now-playing meta so notification NEVER sticks to placeholder,
  // (b) agar WebView background me media suspend kare to wapas resume — lock pe bhi music chalta rahe
  useEffect(()=>{
    const id = setInterval(()=>{
      try{
        if(isPlaying) pushNpMeta()
        if(!isPlaying) return
        if(scrubRef && scrubRef.current) return
        if(current && current.videoId && !directFor && ytPlayerRef.current){
          const st = ytPlayerRef.current.getPlayerState && ytPlayerRef.current.getPlayerState()
          if(st !== undefined && st !== 1 && st !== -1) ytPlayerRef.current.playVideo()
        } else if(audioRef.current && audioRef.current.paused){
          audioRef.current.play().catch(()=>{})
        }
      }catch(e){}
    }, 2600)
    return ()=> clearInterval(id)
  },[isPlaying, current && current.id, current && current.videoId, directFor, isNativeApp()])

  // YouTube IFrame API — the SDK owns only children of the stable React host.
  // YT.Player replaces its target with an iframe. Passing a React-owned target
  // detaches React's insertion anchor, so a CORS/EQ <audio> reset crashes the app.
  useEffect(()=>{
    let alive = true
    let player = null
    const host = ytHostRef.current
    const previousReady = window.onYouTubeIframeAPIReady
    const createPlayer = ()=>{
      if(!alive || !host || player || !window.YT?.Player) return
      const target = document.createElement('div')
      target.id = 'yt-player'
      host.replaceChildren(target) // no React-rendered children live inside host
      player = new window.YT.Player(target, {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1, controls: 0, modestbranding: 1, rel: 0, origin: window.location.origin, enablejsapi: 1 },
        events: {
          onReady: ()=>{ if(!alive) return; ytReadyRef.current=true; setYtReady(true); console.log('YT ready') },
          onStateChange: (e)=>{
            if(!alive) return
            const YTState = window.YT.PlayerState
            if(e.data === YTState.ENDED){ handleNext() }
            if(e.data === YTState.PLAYING){ setIsPlaying(true); setAudioError(null) }
            // PAUSED handled via toggle
          },
          onError: (e)=>{ if(!alive) return; console.error('YT error', e.data); if(!rescueTrack(current)){ setAudioError("YouTube playback error"); setIsPlaying(false); showToast("YouTube error — try koi aur track") } }
        }
      })
      ytPlayerRef.current = player
    }
    const onAPIReady = ()=>{
      if(!alive) return
      try{ if(typeof previousReady==='function') previousReady.call(window) }catch{}
      createPlayer()
    }
    if(window.YT?.Player){
      createPlayer()
    }else{
      window.onYouTubeIframeAPIReady = onAPIReady
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      if(!existing){
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        tag.async = true
        document.body.appendChild(tag)
      }
    }
    return ()=>{
      alive = false // cancel SDK readiness/events queued after unmount/StrictMode
      if(window.onYouTubeIframeAPIReady===onAPIReady){
        if(previousReady===undefined) delete window.onYouTubeIframeAPIReady
        else window.onYouTubeIframeAPIReady = previousReady
      }
      try{ player?.destroy?.() }catch{}
      host?.replaceChildren()
      if(ytPlayerRef.current===player) ytPlayerRef.current = null
      ytReadyRef.current = false
    }
  },[])

  // Sync progress for YouTube tracks
  useEffect(()=>{
    if(!current?.videoId || !ytReady || directFor) return
    if(ytProgressRef.current) clearInterval(ytProgressRef.current)
    ytProgressRef.current = setInterval(()=>{
      const p = ytPlayerRef.current
      if(p && p.getCurrentTime && p.getDuration){
        try{
          const ct = p.getCurrentTime()
          const dur = p.getDuration()
          if(isFinite(ct) && Math.abs(ct - lastProgRef.current) > 0.75){ lastProgRef.current = ct; setProgress(ct) }
          if(isFinite(dur) && dur>0){ setDuration(dur); try{ if(String(p.getVideoData?.()?.video_id||'') === String(currentRef.current?.videoId||'')) liveKeyRef.current.yt = npKeyRef.current }catch{} }
        }catch{}
      }
    }, 500)
    return ()=> { if(ytProgressRef.current) clearInterval(ytProgressRef.current) }
  },[current, ytReady, directFor])

  // audio — robust playback with error fallback + direct user-gesture play
  const [audioError, setAudioError] = useState(null)
  const [audioKey, setAudioKey] = useState(0) // bump => fresh <audio> (escapes capture + CORS-tainted loads); declared before the listener effect, whose deps reference it
  const [audioNoCors, setAudioNoCors] = useState(false) // sticky: session streams block processing => EQ bypassed
  useEffect(()=>{
    const a=audioRef.current; if(!a) return
    const onTime=()=>{ const ct=a.currentTime; if(Math.abs(ct-lastProgRef.current)>0.75){ lastProgRef.current=ct; setProgress(ct) } }
    const onLoaded=()=> { setDuration(a.duration||0); setAudioError(null); liveKeyRef.current.audio = npKeyRef.current; try{ pushNpMeta() }catch{} }
    const onEnded=()=>{ if(repeat===2){ a.currentTime=0; a.play().catch(()=>{}) } else handleNext() }
    const onErr=()=>{
      const src = a.currentSrc || a.src || ""
      console.error("audio error", src)
      setAudioError("Playback failed — check network");
      showToast("Audio failed — real audio dhundh rahe…");
      // NO setIsPlaying(false): rescue (React onError → handleAudioErr) owns recovery —
      // a blind false here + rescue's manual play = audible-but-paused state desync.
    }
    const onPlay=()=>{ try{ if(eqRef.current && eqRef.current.ctx.state==='suspended') eqRef.current.ctx.resume() }catch{} }
    a.addEventListener('timeupdate', onTime); a.addEventListener('loadedmetadata', onLoaded); a.addEventListener('durationchange', onLoaded); a.addEventListener('ended', onEnded); a.addEventListener('error', onErr); a.addEventListener('play', onPlay)
    // Element may already hold metadata when listeners (re)attach after a swap.
    if(a.readyState >= 1){ try{ onLoaded() }catch{} }
    return ()=>{ a.removeEventListener('timeupdate',onTime); a.removeEventListener('loadedmetadata',onLoaded); a.removeEventListener('durationchange',onLoaded); a.removeEventListener('ended',onEnded); a.removeEventListener('error',onErr); a.removeEventListener('play',onPlay) }
    // audioKey MUST be a dep: a CORS/EQ element swap (key change) creates a NEW
    // <audio> node — without re-attaching, progress/duration/end events kept
    // firing on the detached old element and the new one went silent (itrace-29).
  },[repeat, currentIndex, shuffle, queue, audioKey])

  // Listening stats ticker — real minutes only while music actually plays
  useEffect(()=>{
    const id = setInterval(()=>{
      if(!isPlayingRef.current || !currentRef.current) return
      setStats(prev=>{ const nx = {...prev, secs:(prev.secs||0)+10}; try{ localStorage.setItem('sur_stats', JSON.stringify(nx)) }catch{}; return nx })
    }, 10000)
    return ()=> clearInterval(id)
  },[])
  // Sleep timer — pause everything when it fires
  useEffect(()=>{
    if(!sleepMin) return
    const id = setTimeout(()=>{
      try{
        if(audioRef.current) audioRef.current.pause()
        try{ ytPlayerRef.current && ytPlayerRef.current.pauseVideo && ytPlayerRef.current.pauseVideo() }catch{}
        setIsPlaying(false)
        showToast('Sleep timer ⏾ — music paused')
      }catch{}
      setSleepMin(0)
    }, sleepMin*60*1000)
    return ()=> clearTimeout(id)
  },[sleepMin])
  // Autoplay prefetch — near queue end, silently queue related songs (JioSaavn style, zero gap)
  const relatedFetchedRef = useRef([])
  useEffect(()=>{
    if(!autoplay || !current || queue.length < 3 || queue.length > 60) return
    if(currentIndex < queue.length - 2) return
    const id = String(current.id||'')
    if(!id || relatedFetchedRef.current.includes(id)) return
    relatedFetchedRef.current.push(id)
    if(relatedFetchedRef.current.length > 50) relatedFetchedRef.current.shift()
    ;(async()=>{
      try{
        let rel = []
        if(current.videoId){ try{ rel = await getRelatedTracks(current.videoId, 8) }catch{} }
        if(!rel || !rel.length){
          const fa = String(current.artist||'').split(/[,;&/]/)[0].trim()
          if(fa){ try{ rel = await artistSongs(fa, 10) }catch{} }
        }
        if(!rel || !rel.length){ try{ rel = await searchSaavn(`${current.title||''} ${current.artist||''}`, 10) }catch{} }
        rel = mergeDedup(queue, (rel||[]).filter(x=> x && String(x.id)!==id)).slice(0,6)
        if(rel.length) setQueue(prev=> [...prev, ...mergeDedup(prev, rel)])
      }catch{}
    })()
  },[currentIndex, queue.length])
  // Equalizer — Web Audio 5-band on the <audio> element (streaming + downloads; YT iframe can't be processed)
  // itrace-25: self-healing — gesture-time resume, live slider writes, silence watchdog + auto audio-reset, CORS fallback. Never stays mute.
  const eqRef = useRef(null)
  const audioResumeRef = useRef(null) // {t, playing} across element swaps
  const corsRetryRef = useRef(null) // track id already retried without CORS
  const ensureEqGraph = ()=>{
    try{
      if(audioNoCors) return false
      if(eqRef.current || !audioRef.current) return !!eqRef.current
      const AC = window.AudioContext || window.webkitAudioContext
      if(!AC) return false
      const ctx = new AC()
      const src = ctx.createMediaElementSource(audioRef.current)
      const fs = [60,230,910,3600,14000].map((f,i)=>{ const b = ctx.createBiquadFilter(); b.type = i===0?'lowshelf':(i===4?'highshelf':'peaking'); b.frequency.value=f; b.Q.value=1; b.gain.value=0; return b })
      const analyser = ctx.createAnalyser(); analyser.fftSize = 2048
      src.connect(fs[0]); for(let i=0;i<4;i++) fs[i].connect(fs[i+1]); fs[4].connect(ctx.destination); fs[4].connect(analyser)
      eqRef.current = { ctx, fs, analyser }
      return true
    }catch(e){ return !!eqRef.current }
  }
  const kickEq = ()=>{ try{ const E = eqRef.current; if(E && E.ctx.state!=='running') E.ctx.resume().catch(()=>{}) }catch{} }
  const applyEq = ()=>{
    const E = eqRef.current; if(!E) return
    try{ E.fs.forEach((f,i)=>{ f.gain.value = (eq.on && !audioNoCors) ? (eq.gains[i]||0) : 0 }) }catch{}
    if(eq.on && !audioNoCors) kickEq()
  }
  const hardResetAudio = ()=>{
    // fresh <audio> = direct output again (guaranteed sound); EQ goes OFF, playback position kept
    try{ const a = audioRef.current; if(a) audioResumeRef.current = { t: a.currentTime||0, playing: !a.paused } }catch{ audioResumeRef.current = { t:0, playing:false } }
    try{ const C = eqRef.current && eqRef.current.ctx; if(C && C.close) C.close().catch(()=>{}) }catch{}
    eqRef.current = null
    setEq(e=> ({...e, on:false}))
    setAudioNoCors(false)
    setAudioKey(k=> k+1)
  }
  const eqUserToggle = ()=>{
    if(audioNoCors){ showToast('EQ bypassed — streams block processing'); return }
    if(!eq.on){ try{ if(ensureEqGraph()) kickEq() }catch{}; setEq(e=> ({...e, on:true})) }
    else setEq(e=> ({...e, on:false}))
  }
  const eqUserPreset = (p)=>{
    if(audioNoCors){ showToast('EQ bypassed — streams block processing'); return }
    try{ if(ensureEqGraph()) kickEq() }catch{}
    setEq({on:true, preset:p, gains:[...EQ_PRESETS[p]]})
  }
  const eqUserGain = (i, v)=>{
    if(audioNoCors) return
    try{ if(ensureEqGraph()) kickEq() }catch{}
    try{ const E = eqRef.current; if(E && E.fs[i]) E.fs[i].gain.setTargetAtTime(v, E.ctx.currentTime, 0.015) }catch{} // live apply!
    setEq(prev=>{ const g=[...prev.gains]; g[i]=v; return {...prev, on:true, preset:'Custom', gains:g} })
  }
  useEffect(()=>{ if(eq.on && !audioNoCors){ if(ensureEqGraph()) applyEq() } else applyEq() },[eq, audioNoCors])
  useEffect(()=>{ // after <audio> swap: restore position/play
    const r = audioResumeRef.current; audioResumeRef.current = null
    if(!r) return
    const id = setTimeout(()=>{ try{
      const a = audioRef.current; if(!a) return
      if(r.t>0 && isFinite(r.t)){ try{ a.currentTime = r.t }catch{} }
      if(r.playing){ a.play().then(()=> setIsPlaying(true)).catch(()=>{}) }
    }catch{} }, 350)
    return ()=> clearTimeout(id)
  },[audioKey])
  useEffect(()=>{ // silence watchdog: playing + progressing but graph outputs zeros => auto-reset
    if(!isPlaying || !eq.on || audioNoCors) return
    if(current?.videoId && !directFor) return
    if(!eqRef.current) return
    const a0 = audioRef.current; const t0 = a0? a0.currentTime : 0
    const id = setTimeout(()=>{
      try{
        const E2 = eqRef.current; const a1 = audioRef.current
        if(!E2 || !a1 || a1.paused) return
        if(a1.currentTime - t0 < 0.3) return
        const buf = new Float32Array(E2.analyser.fftSize)
        E2.analyser.getFloatTimeDomainData(buf)
        let peak = 0
        for(let i=0;i<buf.length;i+=4){ const v = Math.abs(buf[i]); if(v>peak) peak = v }
        if(peak < 0.001){ showToast('EQ silent on this stream — audio reset'); hardResetAudio() }
      }catch{}
    }, 2500)
    return ()=> clearTimeout(id)
  },[isPlaying, current && current.id, eq.on, audioKey])
  useEffect(()=>{ // suspended-context bodyguard (background tabs, missed gestures)
    const id = setInterval(()=>{
      try{
        const E = eqRef.current; const a = audioRef.current
        if(E && a && !a.paused && E.ctx.state!=='running') E.ctx.resume().catch(()=>{})
      }catch{}
    }, 3000)
    return ()=> clearInterval(id)
  },[])

  useEffect(()=>{ const a=audioRef.current; if(a) a.volume = isMuted?0:volume },[volume,isMuted])
  // play/pause reacts to isPlaying + current change — handles both YouTube and audio
  useEffect(()=>{
    kickEq()
    if(current?.videoId && !directFor){
      // Background me iframe guaranteed stall/fail — turant rescue, loadVideoById skip.
      if(document.hidden && isNativeApp() && !rescueRef.current[String(current.id||'')]){
        rescueTrack(current)
        if(audioRef.current) audioRef.current.pause()
        return
      }
      const p = ytPlayerRef.current
      if(!p || !ytReadyRef.current) return
      try{
        if(isPlaying){
          // if same video already loaded, just play; else load
          const curVid = p.getVideoData?.()?.video_id
          if(curVid !== current.videoId){
            p.loadVideoById(current.videoId)
          } else {
            p.playVideo()
          }
        } else {
          p.pauseVideo()
        }
      }catch(e){ console.warn('YT play effect', e) }
      // pause audio element
      if(audioRef.current) audioRef.current.pause()
      return
    }
    // non-YouTube (or YouTube resolved to a direct mp3 in the APK): use audio element
    const a=audioRef.current; if(!a) return
    if(current?.videoId && directFor){
      const want = directFor
      if(a.getAttribute('src') !== want){ try{ a.src = want; a.load() }catch(e){} }
    }
    // pause YT if playing
    if(ytPlayerRef.current?.pauseVideo) try{ ytPlayerRef.current.pauseVideo() }catch{}
    if(isPlaying){
      const tryPlay = ()=> a.play().catch(err=>{
        if(err?.name==="NotAllowedError") showToast("Tap Play ▶ to start audio")
        else if(err?.name==="AbortError"){ /* benign: superseded by next switch, stay silent */ } else { setAudioError("Playback hiccup — retrying…"); showToast("Tap Play to start") }
      })
      if(a.readyState < 2){ a.load(); a.addEventListener('canplay', tryPlay, {once:true}); setTimeout(tryPlay, 200) } else tryPlay()
    } else a.pause()
  },[isPlaying, currentIndex, queue, ytReady, current, directFor])
  // A queue advance into a genuinely YouTube-only track can leave the iframe
  // CUED/UNSTARTED/PAUSED at 0:00 even though app state says "playing" (the
  // previous track may have ended on <audio>, so there is no fresh user
  // gesture for the iframe). Keep nudging THIS video for a few seconds; if
  // the iframe still cannot start in the APK, rescue to the same Saavn
  // recording or an exact direct stream instead of sitting paused forever.
  useEffect(()=>{
    if(!isPlaying || !current?.videoId || directFor) return
    const vid = String(current.videoId)
    let tries = 0
    const id = setInterval(()=>{
      try{
        if(!isPlayingRef.current || !currentRef.current || String(currentRef.current.videoId||'') !== vid) return
        const p = ytPlayerRef.current
        if(!p || !ytReadyRef.current) return
        const loaded = p.getVideoData?.()?.video_id
        if(loaded !== vid){ if(p.loadVideoById) p.loadVideoById(vid); return }
        const st = p.getPlayerState?.()
        if(st === 1){ clearInterval(id); return }
        if(st === 2 || st === 5 || st === -1){ if(p.playVideo) p.playVideo() }
        if(++tries >= 12){
          clearInterval(id)
          if(isNativeApp() && !directForRef.current) rescueTrack(currentRef.current)
        }
      }catch{}
    }, 900)
    return ()=> clearInterval(id)
  },[npKey, isPlaying, directFor, ytReady])
  // when queue/current changes while playing, force reload (audio only — YT handled in playEffect)
  useEffect(()=>{
    if(current?.videoId && !directFor) return
    if(isPlaying && audioRef.current){
      audioRef.current.load()
      audioRef.current.play().catch(()=>{})
    }
  },[currentIndex, current])

  // search online ONLY (user demand — no hardcoded/local), YouTube Music-like paginated
  useEffect(()=>{
    if(!search.trim()){ setOnlineResults([]); setSearching(false); setSearchPage(1); setSearchNextPage(null); setSearchNoMore(false); setSugg([]); return }
    let cancelled = false
    const queryAtStart = search
    const tm = setTimeout(async()=>{
      if(cancelled) return
      setSearching(true)
      setSearchPage(1)
      searchPagerRef.current = createPager()
      try{
        // JioSaavn-like fast search — Saavn first, then Piped
        const fb = await unifiedSearch(queryAtStart, 40)
        if(cancelled || searchRef.current !== queryAtStart) return
        if(fb.length){
          setOnlineResults(fb)
          setSearchNextPage(getLastSearchNextpage())
          setSearchNoMore(false)
          commitHistory(queryAtStart)
        } else {
          const {tracks, nextpage} = await unifiedSearchPaginated(queryAtStart, 30, null)
          if(cancelled || searchRef.current !== queryAtStart) return
          setSearchNextPage(nextpage)
          setSearchNoMore(false)
          setOnlineResults(tracks)
          if(tracks.length) commitHistory(queryAtStart)
        }
      }catch{
        try{
          const fb = await unifiedSearch(queryAtStart, 40)
          if(cancelled || searchRef.current !== queryAtStart) return
          setOnlineResults(fb)
          setSearchNextPage(getLastSearchNextpage())
        }catch{ if(!cancelled && searchRef.current === queryAtStart) setOnlineResults([]) }
      }
      if(!cancelled && searchRef.current === queryAtStart) setSearching(false)
    }, 180)
    return ()=>{ cancelled = true; clearTimeout(tm) }
  },[search])
  // Live suggestions while typing (YouTube-style autocomplete)
  useEffect(()=>{
    const q = search.trim()
    clearTimeout(suggTimerRef.current)
    if(q.length < 2){ setSugg([]); return }
    suggTimerRef.current = setTimeout(async()=>{
      const seq = ++suggSeqRef.current
      try{
        const s = await searchSuggestions(q)
        if(seq === suggSeqRef.current) setSugg(s || [])
      }catch{ if(seq === suggSeqRef.current) setSugg([]) }
    }, 220)
    return ()=> clearTimeout(suggTimerRef.current)
  },[search])

  const commitHistory = (q)=>{
    const s = String(q||'').trim()
    if(s.length < 2 || lastCommittedRef.current === s) return
    lastCommittedRef.current = s
    setHistory(prev=> [s, ...prev.filter(x=> x.toLowerCase()!==s.toLowerCase())].slice(0,12))
  }
  const removeHistoryItem = (q)=> setHistory(prev=> prev.filter(x=> x!==q))
  const clearHistory = ()=> setHistory([])
  const applySuggestion = (s)=>{ setSearch(s); commitHistory(s); setSuggOpen(false) }

  // infinite scroll for search — auto load when sentinel visible
  useEffect(()=>{
    if(!search.trim() || searching || searchNoMore) return
    const el = searchSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting){
        handleLoadMoreSearch()
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return ()=> io.disconnect()
  }, [search, searching, onlineResults.length, searchPage, searchNoMore])

  const handleLoadMoreSearch = async()=>{
    const pager = searchPagerRef.current
    const queryAtStart = search.trim()
    if(!pager || pager.inFlight || pager.done || !queryAtStart || searchNoMore) return
    setSearching(true)
    try{
      const res = await pager.run(searchNextPage || getLastSearchNextpage(), async(tok)=>{
        const r = await unifiedSearchPaginated(queryAtStart, 24, tok)
        const more = r.tracks || []; const next = r.nextpage || null
        const fresh = mergeDedup(onlineResultsRef.current || [], more.filter(m=> m && isRealTrack(m)))
        return { added: fresh, nextCursor: next }
      }, added=>{ if(searchRef.current.trim() === queryAtStart) setOnlineResults(prev=> [...prev, ...added]) })
      if(searchRef.current.trim() !== queryAtStart || searchPagerRef.current !== pager) return
      if(res.status === 'ok' || res.status === 'advanced' || res.status === 'error'){
        setSearchNextPage(res.nextCursor)
        setSearchPage(p=> p+1)
        if(res.done) setSearchNoMore(true)
      }
    }finally{ setSearching(false) }
  }

  const filteredLocal = useMemo(()=>{
    if(!search.trim()) return []
    const q=search.toLowerCase()
    return fallbackTracks.filter(t=> t.title.toLowerCase().includes(q)|| t.artist.toLowerCase().includes(q))
  },[search])

  const greeting = useMemo(()=>{ const h=new Date().getHours(); if(h<12) return "morning"; if(h<17) return "afternoon"; return "evening" },[])

  const showToast = (msg)=>{ setToast(msg); setTimeout(()=> setToast(null), 2200) }
  // Artist portraits come ONLY from genuine provider artist/profile
  // metadata (see fetchArtistProfile). A song/album cover is never used as
  // an artist's face; without a reliable portrait the UI shows initials.
  const artistPortraitFor = (name)=>{
    if(artistProfile && artistProfile.name === name && artistProfile.image) return artistProfile.image
    return ''
  }

  const togglePlay = ()=>{
    kickEq()
    if(current?.videoId && ytPlayerRef.current && ytReadyRef.current && !directFor){
      if(isPlaying){
        try{ ytPlayerRef.current.pauseVideo() }catch{}
        setIsPlaying(false)
      } else {
        try{ ytPlayerRef.current.playVideo() }catch{}
        setIsPlaying(true)
      }
      return
    }
    setIsPlaying(v=>!v)
  }
  const handleNext = ()=>{
    if(!queue.length) return
    if(shuffle){ let n; do{ n=Math.floor(Math.random()*queue.length)}while(n===currentIndex && queue.length>1); setCurrentIndex(n) }
    else setCurrentIndex(i=> (i+1)%queue.length)
  }
  const handlePrev = ()=>{
    if(!queue.length) return
    const a=audioRef.current; if(a && a.currentTime>3){ a.currentTime=0; return }
    setCurrentIndex(i=> (i-1+queue.length)%queue.length)
  }
  const seek = e=>{ const v=Number(e.target.value); if(current?.videoId && !directFor && ytPlayerRef.current?.seekTo){ try{ ytPlayerRef.current.seekTo(v, true); setProgress(v) }catch{} return } if(audioRef.current){ audioRef.current.currentTime=v; setProgress(v)} }
  const seekToTime = (v)=>{ if(!current) return; v=Math.max(0, Math.min(v, duration||v)); if(current.videoId && !directFor && ytPlayerRef.current?.seekTo){ try{ ytPlayerRef.current.seekTo(v, true); setProgress(v); try{ pushNpMeta({ pos: v }) }catch{} return }catch{} } if(audioRef.current){ try{ audioRef.current.currentTime=v }catch{} setProgress(v); try{ pushNpMeta({ pos: v }) }catch{} } }
  const scrubRef = useRef(false)
  const scrubTo = (clientX, el)=>{ const r = el.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (clientX - r.left)/r.width)); seekToTime(frac * (duration||0)) }
  // playback rescue — YT/piped link toote: naya working URL dhundo (Saavn CDN ya piped resolve), swap + resume
  const rescueRef = useRef({})
  const ytFallbackTokenRef = useRef(0)
  const rescueTrack = (track)=>{
    if(!track) return false
    const key = String(track.id||'')
    if(!key || rescueRef.current[key]) return false
    rescueRef.current[key] = Date.now()
    ;(async()=>{
      try{
        showToast('Playback error — real audio dhundh rahe…')
        // RACED: piped-exact ∥ saavn-fast — jo pehle mile wahi bajega (stall-min).
        // Saavn may only replace the track when it is the SAME recording;
        // a first-result cover/remix must never be played under this title.
        const jobs = []
        if(track.videoId) jobs.push((async()=>{ const url = await resolvePipedAudio(track); if(url && String(url).startsWith('http')) return { ...track, videoId: null, audio: String(url), source:'YouTube • Resolved' }; throw new Error('empty') })())
        if(track.videoId) jobs.push((async()=>{ const s = await findSaavnRecording(track).catch(()=>null); if(s && s.audio) return { ...s, id: track.id, title: track.title||s.title, artist: track.artist||s.artist, cover: track.cover||s.cover }; throw new Error('empty') })())
        let fixed = null
        try{ fixed = jobs.length ? await Promise.any(jobs) : null }catch{ fixed = null }
        if(fixed && (fixed.audio || fixed.videoId)){
          // Kill the old engine FIRST — else iframe + audio play double until pause/resume.
          try{ if(ytPlayerRef.current && ytPlayerRef.current.pauseVideo) ytPlayerRef.current.pauseVideo() }catch{}
          try{ const a0 = audioRef.current; if(a0 && !a0.paused) a0.pause() }catch{}
          ytFallbackTokenRef.current++
          let swapped = false
          setQueue(prev=>{ const q=[...prev]; const i=q.findIndex(x=> String(x.id)===key); if(i>=0){ q[i] = { ...q[i], ...fixed, id: q[i].id }; swapped = true } return q })
          setTimeout(()=>{ try{ if(!swapped) return; const a = audioRef.current; if(a && fixed.audio){ a.src = fixed.audio; a.currentTime = 0; if(isPlayingRef.current){ a.play().catch(()=>{}); setIsPlaying(true) } } }catch{} }, 500)
          showToast('Playing Now')
        } else {
          showToast('Iska source nahi mila — skip; agli baar retry hoga')
          setIsPlaying(false)
          delete rescueRef.current[key]
        }
      }catch{ delete rescueRef.current[key] }
    })()
    return true
  }
  // <audio> failed on a direct (server-proxy) URL: fall back to iframe AND fetch the
  // server's error body (tried[] diagnostics / HTML / challenge snippet) into the card.
  const handleAudioErr = ()=>{
    // itrace-25: CORS-blocked stream vs Web Audio — retry once on a fresh element without crossOrigin (EQ bypassed)
    try{
      const a = audioRef.current
      const tid = String((current && current.id)||'')
      if(a && !audioNoCors && a.getAttribute('crossorigin')!==null && corsRetryRef.current!==tid){
        corsRetryRef.current = tid
        try{ audioResumeRef.current = { t: 0, playing: isPlayingRef.current } }catch{ audioResumeRef.current = { t:0, playing:false } }
        try{ const C = eqRef.current && eqRef.current.ctx; if(C && C.close) C.close().catch(()=>{}) }catch{}
        eqRef.current = null
        setEq(e=> ({...e, on:false}))
        setAudioNoCors(true)
        setAudioKey(k=> k+1)
        showToast('EQ bypassed — direct play for this stream')
        return
      }
    }catch{}
    if(current?.videoId && directFor){
      const failedUrl = directFor
      const myToken = ++ytFallbackTokenRef.current
      try{
        window.__ytAudioCache[String(current.videoId)] = ''
        setYtDirect({id:null,url:''})
        showToast('Direct link failed — player switched over')
        const v = current.videoId
        // Rescue below may swap this track to Saavn within the 350ms — never resurrect
        // the iframe then (that was the YT+Saavn double). Also skip when backgrounded.
        setTimeout(()=>{ try{
          if(ytFallbackTokenRef.current !== myToken) return
          if(!currentRef.current || String(currentRef.current.videoId||'') !== String(v)) return
          if(document.hidden && isNativeApp()) return
          const p = ytPlayerRef.current
          if(p && window.YT && ytReadyRef.current) p.loadVideoById(v)
        }catch(e){} }, 350)
      }catch(e){}
      try{
        fetch(failedUrl, { headers:{ Range:'bytes=0-2047' } }).then(async r=>{
          const ct = r.headers.get('content-type')||''
          let txt = ''
          try{ txt = await r.text() }catch(e){}
          let d = (`srv ${r.status} ${ct}`).trim()
          try{
            const j = JSON.parse(txt)
            if(j && Array.isArray(j.tried)) d += ' tried:'+j.tried.map(t=> (t.engine||'?')+':'+(t.msg!=null ? t.msg : (t.status!=null ? t.status : '?'))).join(',')
            else if(j && j.error) d += ' '+String(j.error).slice(0,100)
          }catch(e){ if(txt) d += ' '+txt.replace(/\s+/g,' ').slice(0,120) }
          try{ window.__ytDirectErr = d.slice(0,400); setDirectErr(window.__ytDirectErr) }catch(e){}
        }).catch(e=>{ try{ setDirectErr(('srv unreachable '+String((e&&e.message)||e)).slice(0,120)) }catch(err){} })
      }catch(e){}
    }
    rescueTrack(current)
  }
  const trackById = (id)=>{ const s=String(id); const pool=[...fallbackTracks, ...localSongs, ...homeTracks, ...queue, ...artistTracks]; return pool.find(x=> String(x.id)===s) || null }
  const toggleLike = (id, trackArg)=> setLiked(prev=>{ const n=new Set(prev); const had = n.has(id) || n.has(Number(id)) || n.has(String(id)); if(n.has(id)) n.delete(id); else n.add(id); showToast(n.has(id)? "Added to Liked Songs":"Removed from Liked Songs")
    try{ if(!had){ const tr = trackArg || trackById(id); if(tr) likedMetaRef.current[String(id)] = { tid:String(id), title:tr.title||'', artist:tr.artist||'', album:tr.album||'', cover:tr.cover||'', audio:tr.audio||null, videoId:tr.videoId||null, durationLabel:tr.durationLabel||'', source:tr.source||'' } } else { delete likedMetaRef.current[String(id)] }
      localStorage.setItem('sur_liked_map', JSON.stringify(likedMetaRef.current)) }catch{}
    return n })
  const handleAuthSubmit = async ()=>{
    const { mode, name, email, password } = authForm
    if(!email.trim() || password.length < 6){ showToast(mode==='login'? 'Email + 6-char password chahiye' : 'Naam, email + 6-char password chahiye'); return }
    setAuthBusy(true)
    try{
      const u = mode==='login' ? await apiLogin(email.trim(), password) : await apiSignup(name.trim()||email.split('@')[0], email.trim(), password)
      if(u){
        setAuthUser(u); cacheAuth(u)
        setUser(prev=> ({ ...prev, email: u.email||email.trim(), plan: u.plan||prev.plan, name: prev._edited?prev.name:(u.name||prev.name), avatar: prev._edited?prev.avatar:(u.avatar||prev.avatar) }))
        setShowAuth(false); setAuthForm({ mode:'login', name:'', email:'', password:'' })
        showToast(`Welcome ${u.name||''} ☁ liked + playlists ab cloud me save`)
      } else showToast('Server reachable nahi / galat credentials — local sync phir bhi chalega')
    } finally { setAuthBusy(false) }
  }
  const handleSignOut = ()=>{ apiLogout(); setAuthUser(null); try{ localStorage.removeItem('sur_auth_user') }catch{}; try{ localStorage.setItem('sur_auth_choice','guest') }catch{}; showToast('Signed out — local data safe hai') }
  const handleDeleteAccount = async ()=>{ const ok = await apiDeleteAccount(); setAuthUser(null); try{ localStorage.removeItem('sur_auth_user') }catch{}; try{ localStorage.setItem('sur_auth_choice','guest') }catch{}; showToast(ok? 'Account cloud se delete ho gaya' : 'Server reachable nahi — session sign out kiya') }

  const playTrack = async (track, list)=>{
    kickEq()
    const targetList = list || queue
    let newQueue, newIdx
    const idxInQueue = targetList.findIndex(x=> String(x.id)===String(track.id))
    if(idxInQueue>=0){ newQueue=targetList; newIdx=idxInQueue } else { newQueue=[track, ...targetList]; newIdx=0; showToast(`Playing • ${track.title} ${track.source? `· ${track.source}`:''}`) }
    // OFFLINE check — if offline and not downloaded, guide to Downloads
    if(typeof navigator!== 'undefined' && !navigator.onLine){
      const dl = downloaded.find(d=> String(d.id)===String(track.id) || String(d.track?.id)===String(track.id))
      const hasBlob = dl && dl.blob && dl.blob.size>0
      // For YT tracks, offline needs downloaded blob; otherwise YT needs net
      if(!hasBlob){
        if(track.videoId) { showToast("Offline — YT needs download. Play from Library → Downloads"); return }
        // For Saavn with remote audio, needs blob
        showToast("Offline — play downloaded songs from Library → Downloads");
        // allow fallback to try remote but will fail; still try if blob missing? we return
        // But if it's already a blob URL (downloaded list), allow
        if(!track.audio || track.audio.startsWith('blob:')) {} else return
      }
    }
    // If track is downloaded, use blob URL (offline guaranteed)
    let downloadedEntry = downloaded.find(d=> String(d.id)===String(track.id) || String(d.track?.id)===String(track.id))
    let blobUrl = null
    if(downloadedEntry && downloadedEntry.blob && downloadedEntry.blob.size>0){
      try{ blobUrl = URL.createObjectURL(downloadedEntry.blob) }catch{}
    }
    // YouTube tracks play via IFrame — no audio resolve needed, but if offline with blob, use blob
    let resolvedTrack = track
    if(blobUrl){
      resolvedTrack = {...track, audio: blobUrl, source: 'Offline • Downloaded', videoId: null}
      newQueue = newQueue.map(x=> String(x.id)===String(track.id)? resolvedTrack: x)
    } else if(track.videoId){
      // YouTube • Full — will be handled by YT player (needs online)
      resolvedTrack = {...track, source: track.source || 'YouTube • Full'}
      newQueue = newQueue.map(x=> String(x.id)===String(track.id)? resolvedTrack: x)
    } else if(!track.audio && track.videoId){
      showToast("Loading full audio…")
      const url = await resolvePipedAudio(track)
      if(url){
        resolvedTrack = {...track, audio: url, source: 'Piped • Full'}
        newQueue = newQueue.map(x=> String(x.id)===String(track.id)? resolvedTrack: x)
      } else {
        showToast("Full audio not found — try another track")
        return
      }
    } else if(!track.audio){
      showToast("No audio source — try another")
      return
    } else if(track.audioQ){
      const q = quality==='eco' ? track.audioQ.eco : (quality==='hd' && isPro) ? track.audioQ.hd : track.audioQ.std
      resolvedTrack = {...track, audio: q || track.audio}
      newQueue = newQueue.map(x=> String(x.id)===String(track.id)? resolvedTrack: x)
    } else {
      resolvedTrack = track
    }
    setQueue(newQueue); setCurrentIndex(newIdx); setIsPlaying(true)
    try{ const lg = String(track.language||'').toLowerCase().split(/[ ,|/]/)[0]; setStats(prev=>{ const nx = {...prev, plays:(prev.plays||0)+1, langs:{...(prev.langs||{})}}; if(lg) nx.langs[lg]=(nx.langs[lg]||0)+1; try{ localStorage.setItem('sur_stats', JSON.stringify(nx)) }catch{}; return nx }) }catch{}
    // recently played DB
    if(isRealTrack(track)) setRecentlyPlayed(prev=> [track, ...prev.filter(x=> String(x.id)!==String(track.id) && isRealTrack(x))].slice(0,30))
    // direct play in user gesture context — YouTube via IFrame, else audio element
    setTimeout(()=>{
      if(resolvedTrack.videoId){
        const p = ytPlayerRef.current
        if(p && ytReadyRef.current){
          try{
            // ensure YT player exists
            if(p.loadVideoById) p.loadVideoById(resolvedTrack.videoId)
            else if(p.cueVideoById){ p.cueVideoById(resolvedTrack.videoId); p.playVideo() }
            setAudioError(null)
            // also fetch related for queue auto suggestions
            getRelatedTracks(resolvedTrack.videoId, 6).then(rels=>{
              if(rels && rels.length){
                // append related to queue silently (YouTube Music-like autoplay)
                setQueue(prev=>{
                  const exists = new Set(prev.map(x=> String(x.id)))
                  const toAdd = rels.filter(r=> !exists.has(String(r.id))).slice(0,4)
                  if(toAdd.length) return [...prev, ...toAdd]
                  return prev
                })
              }
            }).catch(()=>{})
          }catch(e){ console.warn('YT play', e); showToast("Tap Play ▶ to start") }
        } else {
          // fallback to audio resolve if YT not ready
          if(!resolvedTrack.audio){
            resolvePipedAudio(resolvedTrack).then(url=>{
              if(url && audioRef.current){
                const a=audioRef.current
                a.src=url; a.load(); a.play().catch(()=> showToast("Tap Play ▶ to start"))
              }
            })
          }
        }
        // pause audio element
        if(audioRef.current) audioRef.current.pause()
        return
      }
      const a=audioRef.current
      if(a && resolvedTrack.audio){
        a.src = resolvedTrack.audio
        a.load()
        a.play().then(()=> setAudioError(null)).catch(err=>{ console.warn('play failed',err); showToast("Tap Play ▶ to start") })
      }
    }, 60)
  }

  const handleLocalFiles = e=>{
    const files = e.target.files
    if(!files?.length) return
    const newSongs=[]
    Array.from(files).forEach(f=>{
      const url = URL.createObjectURL(f)
      const name = f.name.replace(/\.[^/.]+$/,'').replace(/_+/g,' ').replace(/\s+/g,' ').trim() || f.name
      newSongs.push({ id:`local-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, title:name, artist:"Local File • "+ (f.name.split('.').pop().toUpperCase()), album:"Local Songs", cover:`https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60&random=${Math.random()}`, audio:url, durationLabel:"--:--", color:"#543551", plays:"—", source:"Local", isLocal:true, file: f })
    })
    setLocalSongs(prev=> [...newSongs, ...prev])
    showToast(`${newSongs.length} local song(s) added • Library → Local`)
    setNav('library'); setLibTab('Local')
    e.target.value=""
  }

  const handleDownload = async (track)=>{
    if(downloadingId) return
    if(!isPro && downloaded.length >= FREE_DL_MAX){ setShowSubscribe(true); showToast(`Free plan: ${FREE_DL_MAX} downloads — Pro me unlimited ₹79`); return }
    setDownloadingId(track.id)
    try{
      const existing = downloaded.find(d=> String(d.id)===String(track.id) || String(d.track?.id)===String(track.id))
      if(existing && existing.blob && existing.blob.size>0){ showToast("Already downloaded ✓"); setDownloadingId(null); return }
      showToast("Downloading…")
      let audioUrl = track.audioQ ? (isPro ? (track.audioQ.hd||track.audio) : (track.audioQ.std||track.audio)) : track.audio
      // If YT track (videoId) without audio, resolve to direct URL first
      if(!audioUrl && track.videoId){
        showToast("Resolving audio for download…")
        audioUrl = await resolvePipedAudio(track)
        if(!audioUrl) throw new Error("resolve failed")
      }
      if(!audioUrl) throw new Error("no audio")
      // For offline, fetch with CORS mode
      let res = null
      for(let attempt=0; attempt<2 && !res; attempt++){
        try{ const r = await fetch(audioUrl); if(r && r.ok) res = r }catch{}
        if(!res && attempt===0) await new Promise(r=> setTimeout(r, 1200))
      }
      if(!res) throw new Error("fetch failed")
      const blob = await res.blob()
      if(!blob || blob.size<1000) throw new Error("empty blob")
      // Save with original track but mark as downloaded
      const toSave = {...track, audio: audioUrl, downloadedAt: Date.now()}
      await saveDownload(toSave, blob)
      const updated = await getDownloads()
      setDownloaded(updated)
      showToast("Downloaded ✓ — plays offline from Library → Downloads")
    }catch(e){
      console.warn('download failed', e)
      showToast("Download failed — try Saavn track (not YT) or check net")
      // don't save empty blob
    }
    setDownloadingId(null)
  }
  const handleRemoveDownload = async (id)=>{
    await deleteDownload(id)
    setDownloaded(await getDownloads())
    showToast("Removed from downloads")
  }

  const onClearHistory = ()=>{ setRecentlyPlayed([]); try{ localStorage.removeItem('sur_recent') }catch{}; showToast('Recent history cleared ✓') }
  const onClearSearches = ()=>{ setHistory([]); showToast('Recent searches cleared ✓') }
  const qCycle = ()=>{ if(quality==='eco'){ setQuality('std'); showToast('Standard 160kbps • next song se') } else if(quality==='std'){ if(!isPro){ setShowSubscribe(true); showToast('HD 320kbps Pro me hai 🎧') } else { setQuality('hd'); showToast('HD 320kbps • next song se') } } else { setQuality('eco'); showToast('Eco 96kbps • data bachega') } }
  const cycleSleep = ()=>{ const order=[0,15,30,45,60]; const nx=order[(order.indexOf(sleepMin)+1)%order.length]; setSleepMin(nx); showToast(nx?`Sleep timer ${nx} min ⏾`:'Sleep timer off') }
  const toggleLang = (L)=>{ const has=langs.includes(L); if(has && langs.length===1){ showToast('Kam se kam 1 language'); return } const nx = has? langs.filter(x=>x!==L):[...langs,L]; setLangs(nx); try{ localStorage.setItem('sur_langs', JSON.stringify(nx)) }catch{}; setHomeTracks(cur=> floatLangs(cur, nx)); showToast('Music: '+nx.join(', ')) }
  const toggleFollow = ()=>{ if(!selectedArtist) return; setFollowed(prev=>{ const nx=new Set(prev); if(nx.has(selectedArtist)){ nx.delete(selectedArtist); showToast(`Unfollowed ${selectedArtist}`) } else { nx.add(selectedArtist); showToast(`Following ${selectedArtist} ✓`) } try{ localStorage.setItem('sur_followed', JSON.stringify([...nx])) }catch{}; return nx }) }
  const onShareProfile = async ()=>{
    const txt = `${user.name} on MaxMusic • ${liked.size} liked • ${playlists.length} playlists • ${downloaded.length} downloads`
    try{
      if(navigator.share){ await navigator.share({ title:'MaxMusic', text: txt }); return }
      await navigator.clipboard.writeText(txt); showToast('Profile copied — share kahin bhi ✓')
    }catch{ try{ await navigator.clipboard.writeText(txt); showToast('Profile copied ✓') }catch{ showToast(txt) } }
  }
  // itrace-26: Pro lives on the SERVER per user-id — survives reopen/reinstall/all devices
  const pushLocalProToServer = async (email)=>{
    try{
      const rec = JSON.parse(localStorage.getItem('sur_pro')||'null')
      if(!rec || rec.plan!=='Pro') return null
      if(email && rec.email && String(email).toLowerCase()!==String(rec.email).toLowerCase()) return null
      if(!getAuthToken()) return null
      const u = await apiSetPlan('Pro')
      if(u){ setAuthUser(u); cacheAuth(u); return u }
    }catch{}
    return null
  }
  const activatePro = async ()=>{
    const c = String(proCode||'').trim().toUpperCase()
    if(!c){ setProErr('Code dalo pehle'); return }
    setProErr('')
    // 1) server redeem (logged in) — asli validation server pe, har device pe Pro
    if(authUser || getAuthToken()){
      try{
        const r = await apiRedeemPro(c)
        if(r && r.user){ const u=r.user; setAuthUser(u); cacheAuth(u); setUser(prev=>({...prev, plan:u.plan||'Pro'})); try{ localStorage.setItem('sur_pro', JSON.stringify({ email:String(u.email||(authUser&&authUser.email)||'').toLowerCase(), plan:u.plan||'Pro', ts:Date.now() })) }catch{}; setShowSubscribe(false); showToast('MaxMusic Pro activated ✓ — all your devices'); return }
      }catch{}
    }
    // 2) local fallback (guest / server abhi purana) — + turant server pe push
    if(PRO_CODES.includes(c)){
      const em = String((authUser&&authUser.email)||user.email||'').toLowerCase()
      setUser(u=> ({...u, plan:'Pro'}))
      try{ localStorage.setItem('sur_pro', JSON.stringify({ email:em, plan:'Pro', code:c, ts:Date.now() })) }catch{}
      setProErr(''); setShowSubscribe(false); showToast('MaxMusic Pro activated ✓ — unlimited + HD + EQ')
      pushLocalProToServer(em).catch(()=>{})
    }
    else setProErr('Galat code — dobara check karo')
  }
  const handleCreatePlaylist = ()=>{
    if(!newPlName.trim()) return
    const pl = { id:`pl-${Date.now()}`, title:newPlName.trim(), subtitle:"Custom playlist • "+user.name, cover:`https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=60&random=${Date.now()}`, color:"from-[#6A418E] to-[#543551]", count:"0 songs", songs:[] }
    setPlaylists(prev=> [pl, ...prev])
    setNewPlName(""); setShowCreatePl(false); showToast(`Playlist "${pl.title}" created`)
  }
  // ---- itrace-24: playlists that actually play their saved songs ----
  const playlistTracks = (pl)=>{
    if(!pl) return []
    if(pl.tracks && pl.tracks.length) return pl.tracks
    const ids = pl.songs||[]
    if(!ids.length) return []
    return ids.map(id=> trackById(id)).filter(Boolean)
  }
  const playThemedPlaylist = async (pl)=>{
    const qmapPl = {
      "Today's Top Hits • India": "Arijit Singh Trending 2024",
      "Bollywood Butter": "Bollywood love songs",
      "Punjabi 101": "Punjabi hit songs Sidhu Moose Wala",
      "Chill Kar Yaar": "Anuv Jain Prateek Kuhad lofi",
      "Indie India": "Indie India Anuv Jain",
      "Global Top 50": "Trending global hits",
      "90s Love Hits": "90s Hindi hits Kumar Sanu",
      "New Releases": "New Hindi Punjabi releases 2024"
    }
    const q = qmapPl[pl.title] || pl.title
    showToast(`Loading ${pl.title}…`)
    try{
      const real = await trendingByCategory(pl.title.includes("Punjabi")?"Punjabi": pl.title.includes("Indie")?"Indie": pl.title.includes("90s")?"90s": pl.title.includes("Chill")?"Indie":"All", 20)
      let tracks = real
      if(!tracks.length){ tracks = await searchSaavn(q, 20) }
      if(tracks.length){ setQueue(tracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title} • ${tracks.length} real`) }
      else showToast("Network nahi mila — thodi der baad try karo")
    }catch{ showToast("Network nahi mila — retry karo") }
  }
  const playPlaylistNow = async (pl)=>{
    const tracks = playlistTracks(pl)
    if(tracks.length){ setQueue(tracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title} • ${tracks.length} songs`); return }
    await playThemedPlaylist(pl)
  }
  const openPlaylist = (pl)=>{
    if(!pl) return
    if(playlistTracks(pl).length){ setSelectedPlaylist(pl.id); return }
    playThemedPlaylist(pl)
  }
  const handleRemoveFromPlaylist = (plId, trackId)=>{
    setPlaylists(prev=> prev.map(p=>{
      if(p.id!==plId) return p
      const nt = (p.tracks||[]).filter(x=> String(x.id||x.tid)!==String(trackId))
      const ns = (p.songs||[]).filter(s=> String(s)!==String(trackId))
      return {...p, tracks: nt, songs: ns, count: `${nt.length} songs`}
    }))
    showToast("Removed from playlist")
  }
  // Dedicated artist page (replaces the old inline popup list). Opening it
  // only swaps an overlay: playback, mini-player state, queue, underlying
  // nav/scroll and followed data are untouched. A sequence guard rejects
  // late responses from a previously opened artist.
  const handleArtistClick = async (artistInput)=>{
    const name = typeof artistInput === 'string' ? artistInput : (artistInput && artistInput.name) || ''
    if(!name) return
    const seq = ++artistSeqRef.current
    artistInputRef.current = artistInput
    artistPagerRef.current = createPager()
    artistNextRef.current = null
    setSelectedArtist(name)
    setArtistTracks([])
    setArtistNextPage(null)
    setArtistProfile(null)
    setArtistTotal(null)
    setArtistEnded(false)
    setArtistLoading(true)
    setArtistPageOpen(true)
    fetchArtistProfile(artistInput).then(prof=>{
      if(artistSeqRef.current !== seq) return
      setArtistProfile(prof)
      if(prof && prof.id) artistInputRef.current = { ...(typeof artistInput === 'object' ? artistInput : {}), name, id: prof.id }
    }).catch(()=>{})
    try{
      const { tracks, nextpage, total } = await artistSongsPaginated(artistInput, 24, null)
      if(artistSeqRef.current !== seq) return
      setArtistTracks(mergeDedup([], tracks || []))
      artistNextRef.current = nextpage || null
      setArtistNextPage(nextpage || null)
      setArtistTotal(total != null ? total : null)
      if(!nextpage) setArtistEnded(true)
      if(!tracks || !tracks.length) showToast(`No credited tracks found for ${name}`)
    }catch{ if(artistSeqRef.current === seq) showToast(`Failed ${name}`) }
    if(artistSeqRef.current === seq) setArtistLoading(false)
  }
  const closeArtistPage = ()=>{
    artistSeqRef.current++
    setArtistPageOpen(false)
  }
  const handleLoadMoreArtist = async()=>{
    const pager = artistPagerRef.current
    const seq = artistSeqRef.current
    if(!pager || pager.inFlight || pager.done || !artistNextRef.current || !selectedArtist) return
    setArtistLoadingMore(true)
    try{
      const input = artistInputRef.current || selectedArtist
      const res = await pager.run(artistNextRef.current, async(cur)=>{
        const { tracks, nextpage, total } = await artistSongsPaginated(input, 24, cur)
        if(total != null) setArtistTotal(total)
        const fresh = mergeDedup(artistTracksRef.current || [], tracks || [])
        return { added: fresh, nextCursor: nextpage || null }
      }, added=>{ if(artistSeqRef.current === seq) setArtistTracks(prev=> [...prev, ...mergeDedup(prev, added)]) })
      if(artistSeqRef.current !== seq || artistPagerRef.current !== pager) return
      if(res.status === 'ok' || res.status === 'advanced' || res.status === 'error'){
        artistNextRef.current = res.nextCursor || null
        setArtistNextPage(res.nextCursor || null)
        if(res.done) setArtistEnded(true)
      }
    }finally{ setArtistLoadingMore(false) }
  }
  useEffect(()=>{
    if(!artistPageOpen || !artistNextPage) return
    const el = artistSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{ if(entries[0].isIntersecting) handleLoadMoreArtist() }, { rootMargin:'600px'})
    io.observe(el)
    return ()=> io.disconnect()
  },[artistPageOpen, artistNextPage, artistTracks.length])
  const handleAddToPlaylist = (plId, track)=>{
    setPlaylists(prev=> prev.map(p=>{
      if(p.id!==plId) return p
      const sid = String(track.id)
      const tr0 = p.tracks||[]
      if(tr0.some(x=> String(x.id||x.tid)===sid) || p.songs?.includes(sid) || p.songs?.includes(track.id)) { showToast("Already in playlist"); return p }
      const meta = { id: sid, title: track.title||'', artist: track.artist||'', album: track.album||'', cover: track.cover||'', audio: track.audio||null, videoId: track.videoId||null, durationLabel: track.durationLabel||'', durationSec: track.durationSec||0, source: track.source||'', color: track.color||'#6A418E' }
      const nt = [...tr0, meta]
      return {...p, tracks: nt, songs: [...(p.songs||[]), sid], count: `${nt.length} songs`}
    }))
    setShowAddToPl(null); showToast(`Added to "${(playlists.find(x=>x.id===plId)||{}).title||'playlist'}" ✓`)
  }

  // derived lists
  const allSongsForLibrary = [...localSongs, ...fallbackTracks]
  const likedTracks = (()=>{
    const byId = new Map()
    // 1) cloud/local meta map (full objects — survives refresh + cross-device)
    try{ Object.values(likedMetaRef.current||{}).forEach(x=>{ if(x&&x.tid) byId.set(String(x.tid), { ...x, id: x.tid, color: x.color||'#6A418E' }) }) }catch{}
    // 2) known pools (fallback + local) for ids liked before meta existed
    allSongsForLibrary.forEach(t=>{ if(liked.has(t.id)||liked.has(String(t.id))) byId.set(String(t.id), t) })
    // 3) any plain ids left → placeholder so count is honest
    liked.forEach(id=>{ const s=String(id); if(!byId.has(s)) byId.set(s, { id, title:'Liked track', artist:'—', cover:'', durationLabel:'', source:'' }) })
    return [...byId.values()].filter(x=> liked.has(x.id)||liked.has(String(x.id)))
  })()
  const downloadedTracks = downloaded.map(d=> {
    // if blob exists, create blob URL for offline playback
    if(d.blob && d.blob.size>0){
      try{
        const blobUrl = URL.createObjectURL(d.blob)
        return {...d.track, audio: blobUrl, source: 'Offline • Downloaded', isDownloaded: true, blobUrl}
      }catch{ return d.track }
    }
    return d.track
  })

  return (
    <div data-theme={activeTheme.id} className={`min-h-screen text-white selection:bg-[#D5AA55]/30 selection:text-white ${activeTheme.mode==='light' ? 'theme-light' : ''}`} style={{ background: activeTheme.bg }}>
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-[30%] -left-[20%] w-[90%] h-[80%] rounded-full blur-[120px] opacity-[0.18]" style={{ background:`radial-gradient(circle, ${activeTheme.glow1} 0%, ${activeTheme.glow1}99 30%, transparent 70%)`}}/>
        <div className="absolute top-[10%] -right-[20%] w-[80%] h-[60%] rounded-full blur-[140px] opacity-[0.15]" style={{ background:`radial-gradient(circle, ${activeTheme.glow2} 0%, ${activeTheme.glow2}80 40%, transparent 70%)`}}/>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] h-[50%] blur-[100px] opacity-[0.12]" style={{ background:`radial-gradient(ellipse at center, ${activeTheme.accent}55 0%, transparent 70%)`}}/>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent" style={{ backgroundImage:`linear-gradient(to bottom, transparent, transparent, ${activeTheme.bg})` }}/>
      </div>

      <audio key={audioKey} ref={audioRef} crossOrigin={audioNoCors? undefined : "anonymous"} src={current?.videoId ? (directFor || undefined) : current?.audio} preload="metadata" playsInline onError={handleAudioErr} />
      <div id="yt-player-host" ref={ytHostRef} style={{position:'absolute', left:'-9999px', width:'1px', height:'1px', overflow:'hidden', opacity:0, pointerEvents:'none'}} />
      {audioError && <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[92vw] text-center bg-[#C35445] text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg break-words">{audioError}</div>}

      <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleLocalFiles} className="hidden"/>

      <div className="relative flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-4 p-3 pr-0 sticky top-0 h-screen">
          <div className="glass rounded-[24px] p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D5AA55] to-[#C35445] grid place-items-center font-bold text-black">♪</div>
              <div>
                <div className="font-display font-bold leading-none text-[18px] tracking-tight">MaxMusic</div>
                <div className="text-[11px] tracking-[0.18em] text-white/60 font-semibold uppercase">Music • India</div>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Online"/>
            </div>
            <nav className="space-y-1">
              {[
                { id:'home', label:'Home', icon:HomeIcon, active:nav==='home' },
                { id:'search', label:'Search', icon:SearchIcon, active:nav==='search' },
                { id:'library', label:'Your Library', icon:LibraryIcon, active:nav==='library' },
                { id:'profile', label:'Profile', icon:ProfileIcon, active:nav==='profile' },
              ].map(item=> (
                <button key={item.id} onClick={()=> setNav(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${item.active? 'bg-white text-black':'text-white/70 hover:text-white hover:bg-white/10'}`}>
                  <item.icon active={item.active}/>{t('nav_'+item.id)}
                  {item.id==='library' && <span className="ml-auto text-xs bg-white/10 px-2 py-0.5 rounded-full border border-white/5">{playlists.length+liked.size}</span>}
                </button>
              ))}
            </nav>
            <div className="mt-6 pt-5 border-t border-white/10 space-y-2">
              <button onClick={()=> setShowCreatePl(true)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90"><span className="w-7 h-7 rounded-lg bg-black text-white grid place-items-center">+</span>Create Playlist</button>
              <button onClick={()=> fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium"><span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D5AA55] to-[#A154D6] grid place-items-center">♫</span>Add Local Songs<span className="ml-auto text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">{localSongs.length}</span></button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>{ setNav('library'); setLibTab('Liked')}} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 border border-white/5"><span className="w-6 h-6 rounded-md bg-gradient-to-br from-[#A154D6] to-[#6A418E] grid place-items-center text-xs">♥</span>Liked<span className="ml-auto text-xs">{liked.size}</span></button>
                <button onClick={()=>{ setNav('library'); setLibTab('Downloads')}} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 border border-white/5"><span className="w-6 h-6 rounded-md bg-emerald-600 grid place-items-center text-xs">↓</span>Offline<span className="ml-auto text-xs">{downloaded.length}</span></button>
              </div>
            </div>
          </div>

          <div className="glass rounded-[24px] p-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1"><h3 className="text-sm font-semibold">Your Mixes</h3><button onClick={()=> setShowCreatePl(true)} className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><PlusIcon/></button></div>
            <div className="space-y-1 overflow-y-auto pr-1 -mr-1 flex-1">
              {playlists.map(pl=> (
                <button key={pl.id} onClick={()=> openPlaylist(pl)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left group">
                  <CoverImg track={pl} className="w-12 h-12 rounded-lg object-cover shrink-0"/>
                  <div className="min-w-0"><div className="text-sm font-medium truncate">{pl.title}</div><div className="text-xs text-white/50 truncate">Playlist • {pl.count || `${(pl.songs||[]).length} songs`}</div></div>
                </button>
              ))}
              {localSongs.length>0 && (
                <button onClick={()=>{ setNav('library'); setLibTab('Local')}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left mt-2 border-t border-white/5 pt-2">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#D5AA55] to-[#6A418E] grid place-items-center text-lg">♫</div>
                  <div className="min-w-0"><div className="text-sm font-medium truncate">Local Files</div><div className="text-xs text-white/50 truncate">{localSongs.length} songs on this device</div></div>
                </button>
              )}
            </div>
            <div className="mt-3 p-3 rounded-2xl bg-gradient-to-br from-[#543551] to-[#6A418E] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent"/>
              <div className="relative">
                <div className="text-sm font-semibold">Go Premium — ₹119/mo</div><div className="text-xs text-white/80 mt-1 leading-relaxed">Ad-free, offline downloads & high quality.</div>
                <button onClick={()=> setShowSubscribe(true)} className="mt-3 bg-white text-black text-xs font-bold px-4 py-2 rounded-full">Try 1 month free</button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#060306]/60 border-b border-white/5">
            <div className="flex items-center gap-3 px-4 lg:px-6 py-3">
              <div className="flex-1 flex justify-center min-w-0 lg:mx-1">
                <div className="relative w-full">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"><SearchIcon size={18}/></span>
                  <input value={search} onChange={e=>{ setSearch(e.target.value); setSuggOpen(true); if(e.target.value) setNav('search')}} onFocus={()=>{ setNav('search'); setSuggOpen(true) }} onBlur={()=> setTimeout(()=> setSuggOpen(false), 140)} onKeyDown={e=>{ if(e.key==='Enter'){ commitHistory(search); setSuggOpen(false) } if(e.key==='Escape') setSuggOpen(false) }} placeholder={t('searchPh')} className="w-full h-11 pl-10 pr-10 rounded-full bg-white/10 hover:bg-white/[0.14] focus:bg-white text-sm placeholder:text-white/50 focus:placeholder:text-black/40 focus:text-black outline-none border border-white/10 focus:border-white transition"/>
                  {search && <button onClick={()=> setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full bg-black/20 hover:bg-black/30 text-white/70"><CloseIcon/></button>}
                  {searching && <span className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                  {suggOpen && (search.trim() ? sugg.length>0 : history.length>0) && (
                    <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0709]/95 shadow-2xl backdrop-blur-xl" onMouseDown={e=> e.preventDefault()}>
                      {!search.trim() ? (
                        <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Recent searches</span>
                          <button onClick={clearHistory} className="text-[11px] text-white/50 hover:text-white font-semibold">Clear all</button>
                        </div>
                      ) : (
                        <div className="px-3.5 pt-2.5 pb-1"><span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Suggestions</span></div>
                      )}
                      {(search.trim() ? sugg : history).map((s,i)=>(
                        <div key={s+'-'+i} onClick={()=> applySuggestion(s)} className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-sm text-white/85 hover:bg-white/10">
                          <span className="text-white/40"><SearchIcon size={14}/></span>
                          <span className="truncate">{s}</span>
                          {!search.trim() ? (
                            <span onClick={(e)=>{ e.stopPropagation(); removeHistoryItem(s) }} className="ml-auto grid h-6 w-6 place-items-center rounded-full text-white/30 hover:bg-white/10 hover:text-white"><CloseIcon/></span>
                          ) : (
                            <span className="ml-auto text-white/25 text-xs">↵</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=> fileInputRef.current?.click()} className="hidden sm:grid w-9 h-9 place-items-center rounded-full bg-white/10 hover:bg-white/15 border border-white/10" title="Add Local Songs"><PlusIcon/></button>
                <button className="hidden sm:grid w-9 h-9 place-items-center rounded-full bg-white text-black hover:bg-white/90"><BellIcon/></button>
                <div className="relative">
                  <button onClick={()=> setShowProfileMenu(v=>!v)} className="hidden sm:flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/10 border border-white/10 hover:bg-white/15">
                    <Avatar src={user.avatar} name={user.name} className="w-7 h-7 rounded-full object-cover"/><span className="text-sm font-medium hidden lg:block">{user.name.split(' ')[0]}</span><ChevronDown/>
                  </button>
                  {showProfileMenu && (
                    <div className="absolute right-0 top-11 w-[300px] glass-strong rounded-2xl p-3 shadow-2xl z-50">
                      <div className="flex gap-3 p-2">
                        <Avatar src={user.avatar} name={user.name} className="w-12 h-12 rounded-full object-cover"/>
                        <div className="min-w-0"><div className="font-semibold leading-tight">{user.name}</div><div className="text-xs text-white/60 truncate">{user.email}</div><div className="text-xs mt-1 inline-flex items-center gap-1 bg-white text-black px-2 py-0.5 rounded-full font-bold">{user.plan} • {downloaded.length} downloads</div></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center py-3 border-y border-white/5 my-3">
                        <div><div className="font-bold">{playlists.length}</div><div className="text-xs text-white/50">Playlists</div></div>
                        <div><div className="font-bold">{liked.size}</div><div className="text-xs text-white/50">Liked</div></div>
                        <div><div className="font-bold">{localSongs.length}</div><div className="text-xs text-white/50">Local</div></div>
                      </div>
                      <button onClick={()=>{ setNav('profile'); setShowProfileMenu(false)}} className="w-full py-2 rounded-full bg-white text-black text-sm font-bold">View Profile</button>
                      <button onClick={()=>{ fileInputRef.current?.click(); setShowProfileMenu(false)}} className="w-full mt-2 py-2 rounded-full bg-white/10 text-white text-sm font-semibold border border-white/10">Add Local Songs</button>
                    </div>
                  )}
                </div>
                <button onClick={()=> setNav('profile')} className="lg:hidden w-9 h-9 rounded-full overflow-hidden border border-white/10"><Avatar src={user.avatar} name={user.name} className="w-full h-full object-cover"/></button>
              </div>
            </div>
            <div className="px-4 lg:px-6 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
              {categories.map(c=> (
                <button key={c.id} onClick={()=>{ setActiveCat(c.id); showToast(c.id==="All"? "All songs • curated" : `Showing ${c.label} • ${homeTracks.length? homeTracks.length: getCategoryTracks(c.id).length} songs — tap Play` ) }} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition flex items-center gap-1.5 ${activeCat===c.id? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10 hover:bg-white/15'}`}><span>{c.icon}</span>{c.label}</button>
              ))}
              <span className="ml-auto hidden lg:flex items-center gap-2 text-xs text-white/40"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>Tap category → auto-queue • Offline ready</span>
            </div>
          </header>

          <main className="flex-1 min-w-0 max-w-full overflow-x-clip px-4 lg:px-6 py-6 pb-28 lg:pb-28 space-y-7">
            {nav==='profile' ? (
              <ProfileView npEngine={(current && current.videoId) ? (directFor ? "mp3 (direct) ✓ background-safe" : ("yt-iframe (direct resolve pending/failed)" + (directErr ? " · " + directErr : ""))) : "mp3"} user={user} setUser={setUser} editUser={editUser} setEditUser={setEditUser} liked={liked} playlists={playlists} localSongs={localSongs} downloaded={downloaded} showToast={showToast} authUser={authUser} onSignIn={()=> setShowAuth(true)} onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} x={{ t, lang, setLang, quality, qCycle, langs, toggleLang, sleepMin, cycleSleep, eqOn:eq.on, eqPreset:eq.preset, onOpenEQ:()=>setShowEQ(true), isPro, stats, followedCount:followed.size, onSubscribe:()=>setShowSubscribe(true), onClearHistory, onClearSearches, onShareProfile, autoplay, setAutoplay, onOpenPlaylist:(id)=> setSelectedPlaylist(id), onPlayPlaylist:(pl)=> playPlaylistNow(pl), onCreatePlaylist:()=> setShowCreatePl(true), onPlayTrack:playTrack, recently:recentlyPlayed, followedList:[...followed], updCur:{version:APP_VERSION, build:APP_BUILD_NO}, updInfo:updateInfo, updChecking, onCheckUpdate:()=> runUpdateCheck(true), themes:THEMES, themeId:activeTheme.id, onSelectTheme:selectTheme, onPlayAllRecent:()=>{ if(recentlyPlayed.length){ setQueue(recentlyPlayed); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing recent • ${recentlyPlayed.length}`) } } }} />
            ) : nav==='search' ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-bold font-display">{search? `Search "${search}"` : "Browse all"} <span className="text-sm font-normal text-white/50">• Real-time online + local</span></h2>
                  <span className="text-sm text-white/50">{search ? `${onlineResults.length||filteredLocal.length} results` : `${homeTracks.length} trending • ${localSongs.length} local`}</span>
                </div>

                {!search ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {[
                        { title:"Bollywood Hits", col:"from-[#C35445] to-[#572223]", icon:"🎬", cat:"Bollywood" },
                        { title:"Punjabi Fire", col:"from-[#D5AA55] to-[#C35445]", icon:"🔥", cat:"Punjabi" },
                        { title:"Indie Chill", col:"from-[#6A418E] to-[#543551]", icon:"🌙", cat:"Indie" },
                        { title:"Romance", col:"from-[#A154D6] to-[#543551]", icon:"💜", cat:"Love" },
                        { title:"Trending Global", col:"from-[#E9CDC2] to-[#A154D6]", icon:"🌍", cat:"Trending" },
                        { title:"90s Hits", col:"from-[#543551] to-[#060306] border border-white/10", icon:"📻", cat:"90s" },
                        { title:"Local Files", col:"from-[#D5AA55] to-[#6A418E]", icon:"💾", action:()=> fileInputRef.current?.click() },
                        { title:"Downloads", col:"from-[#572223] to-[#6A418E]", icon:"↓", action:()=> { setNav('library'); setLibTab('Downloads')} },
                      ].map(b=> (
                        <button key={b.title} onClick={()=> b.action ? b.action() : (setActiveCat(b.cat), setNav('home'), showToast(`${b.icon} ${b.title} — showing`))} className={`relative h-[96px] rounded-[18px] p-4 overflow-hidden bg-gradient-to-br ${b.col} flex flex-col justify-between text-left hover:scale-[1.02] transition hover:shadow-lg`}>
                          <div className="font-semibold leading-tight">{b.title}</div><div className="text-2xl opacity-90">{b.icon}</div><div className="absolute -right-2 -bottom-2 w-20 h-20 rounded-xl bg-black/15 rotate-12 blur-[1px]"/>
                        </button>
                      ))}
                    </div>
                    <div className="pt-2">
                      <h3 className="font-bold mb-3">Trending Now — Worldwide Full • Tap to play</h3>
                      {!homeTracks.length && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{Array.from({length:6}).map((_,i)=> <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse border border-white/5"/> )}</div>}
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {homeTracks.slice(0,12).map(t=>{
                          const idx=queue.findIndex(x=> String(x.id)===String(t.id))
                          return (
                            <div key={t.id} className={`flex items-center gap-3 p-2 pr-2 rounded-xl border text-left ${idx===currentIndex?'bg-white text-black border-white':'bg-white/5 hover:bg-white/10 border-white/5'}`}>
                              <button onClick={()=> playTrack(t)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                <CoverImg track={t} className="w-12 h-12 rounded-lg object-cover shrink-0"/>
                                <div className="min-w-0"><div className={`text-sm font-semibold truncate ${idx===currentIndex?'text-black':'text-white'}`}>{t.title}</div><div className={`text-xs truncate ${idx===currentIndex?'text-black/60':'text-white/60'}`}>{t.artist}</div></div>
                              </button>
                              <button onClick={()=> handleDownload(t)} disabled={downloadingId===t.id} className={`w-8 h-8 grid place-items-center rounded-full border ${downloaded.find(d=> String(d.id)===String(t.id))? 'bg-emerald-500 border-emerald-500 text-white':'border-white/15 text-white/60 hover:text-white'}`}>{downloadingId===t.id? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <DownloadIcon/>}</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    {searching && <div className="flex items-center gap-2 text-sm text-white/60"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Searching online (iTunes + Saavn)…</div>}
                    {!searching && onlineResults.length===0 ? (
                      <div className="text-center py-16 text-white/60"><div className="text-5xl mb-4">🔍</div><div className="font-medium">No results for "{search}"</div><div className="text-sm mt-1">Try English/Hindi • e.g. "Arijit", "Punjabi", "Calm Down"</div></div>
                    ) : (
                      <>
                        <div>
                          <h3 className="font-bold mb-3">Top Results — Online • {onlineResults.filter(r=> r.source!=='Local').length} online • {onlineResults.filter(r=> r.source==='Local').length} local</h3>
                          <div className="space-y-2">
                            {onlineResults.map(t=>{
                              const inQueue = queue.findIndex(x=> String(x.id)===String(t.id))===currentIndex && isPlaying
                              const isDl = !!downloaded.find(d=> String(d.id)===String(t.id))
                              return (
                                <div key={t.id} className={`group flex items-center gap-3 p-2 rounded-xl transition ${String(current?.id)===String(t.id)? 'bg-white text-black':'hover:bg-white/5 border border-transparent hover:border-white/5'}`}>
                                  <button onClick={()=> playTrack(t, [...onlineResults, ...queue])} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                    <span className="relative block w-12 h-12 rounded-lg overflow-hidden shrink-0">
                                      <CoverImg track={t} className="w-full h-full object-cover"/>
                                      <span className={`absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 ${String(current?.id)===String(t.id)? '!opacity-100 bg-black/20':''}`}>{inQueue? <PauseMini dark/> : <PlayMini dark/>}</span>
                                    </span>
                                    <span className="min-w-0 flex-1 block">
                                      <span className={`block text-sm font-medium truncate ${String(current?.id)===String(t.id)?'text-black':'text-white'}`}>{t.title} {t.source && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 align-middle">{t.source}</span>}</span>
                                      <span className={`block text-xs truncate ${String(current?.id)===String(t.id)?'text-black/60':'text-white/60'}`}>{t.artist} • {t.album}</span>
                                    </span>
                                  </button>
                                  <span className={`hidden md:block text-xs ${String(current?.id)===String(t.id)?'text-black/50':'text-white/30'}`}>{t.durationLabel}</span>
                                  <button onClick={()=> toggleLike(t.id, t)} className={`w-8 h-8 grid place-items-center rounded-full ${liked.has(t.id)? 'text-[#C35445]':'text-white/30 hover:text-white'}`}><Heart filled={liked.has(t.id)} size={16}/></button>
                                  <div className="hidden sm:flex items-center gap-1">
                                    <button onClick={()=> setShowAddToPl(t)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 text-white/70 hover:text-white"><PlusIcon/></button>
                                    <button onClick={()=> handleDownload(t)} disabled={downloadingId===t.id} className={`w-8 h-8 grid place-items-center rounded-full border ${isDl? 'bg-emerald-500 border-emerald-500 text-white':'border-white/10 text-white/60 hover:text-white'}`}>{downloadingId===t.id? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <DownloadIcon size={14}/>}</button>
                                    <button onClick={()=> playTrack(t, [...onlineResults, ...queue])} className="w-8 h-8 grid place-items-center rounded-full bg-white text-black"><PlayMini size={12}/></button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <div ref={searchSentinelRef} className="h-1" />
                          <div className="min-h-[44px] flex items-center justify-center">
                            {searching && onlineResults.length ? <div className="flex items-center justify-center gap-2 text-xs text-white/50"><span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"/>Loading more results…</div> : (!searching && (searchNoMore || !searchNextPage) && onlineResults.length ? <div className="text-center text-xs text-white/30">✓ {onlineResults.length} matching results — all loaded</div> : <div className="text-center text-xs text-white/30">Showing {onlineResults.length} results • more load automatically on scroll</div>)}
                          </div>
                        </div>
                        {localSongs.length>0 && (
                          <div>
                            <h3 className="font-bold mb-3">Your Local Files • {localSongs.filter(s=> s.title.toLowerCase().includes(search.toLowerCase())).length} matches</h3>
                            <div className="space-y-2">
                              {localSongs.filter(s=> s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase())).slice(0,5).map(t=>(
                                <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                                  <button onClick={()=> playTrack(t, [...localSongs, ...queue])} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                    <CoverImg track={t} className="w-12 h-12 rounded-lg object-cover shrink-0"/>
                                    <span className="flex-1 min-w-0 block"><span className="block text-sm font-medium truncate">{t.title}</span><span className="block text-xs text-white/50 truncate">{t.artist} • Local</span></span>
                                  </button>
                                  <button onClick={()=> playTrack(t, [...localSongs, ...queue])} className="w-8 h-8 grid place-items-center rounded-full bg-white text-black shrink-0"><PlayMini size={12}/></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : nav==='library' ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#A154D6] to-[#6A418E] grid place-items-center text-2xl">♥</div>
                  <div><h2 className="text-2xl font-bold font-display">{t('ylib')}</h2><p className="text-sm text-white/60">{liked.size} {t('wd_liked')} • {playlists.length} {t('wd_playlists')} • {localSongs.length} {t('wd_local')} • {downloaded.length} {t('wd_offline')}</p></div>
                  <div className="ml-auto flex gap-2">
                    <button onClick={()=> setShowCreatePl(true)} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-bold"><PlusIcon/> {t('newpl')}</button>
                    <button onClick={()=> fileInputRef.current?.click()} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-white text-sm font-semibold"><PlusIcon/> {t('addlocal')}</button>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {["Playlists","Liked","Local","Downloads","Songs"].map(tab=> (
                    <button key={tab} onClick={()=> setLibTab(tab)} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border ${libTab===tab? 'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/70'}`}>{t('libtab_'+tab)}</button>
                  ))}
                </div>

                {libTab==="Playlists" && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                      <button onClick={()=> setShowCreatePl(true)} className="glass rounded-[18px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-white/10 border-dashed border-2 border-white/15 min-h-[200px]">
                        <span className="w-12 h-12 rounded-full bg-white text-black grid place-items-center text-2xl">+</span><span className="text-sm font-semibold">Create Playlist</span><span className="text-xs text-white/50">Add your favourite tracks</span>
                      </button>
                      {playlists.map(pl=> (
                        <div key={pl.id} onClick={()=> openPlaylist(pl)} className="glass rounded-[18px] p-3 hover:bg-white/10 transition group relative cursor-pointer">
                          <div className="relative aspect-square rounded-xl overflow-hidden mb-3">
                            <CoverImg track={pl} className="w-full h-full object-cover group-hover:scale-105 transition duration-500"/>
                            <div className={`absolute inset-0 bg-gradient-to-br ${pl.color} opacity-60 mix-blend-overlay`}/>
                            <button onClick={(e)=>{ e.stopPropagation(); playPlaylistNow(pl) }} className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-[#D5AA55] text-black grid place-items-center shadow-lg translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></button>
                            <div className="absolute top-2 left-2 text-[11px] font-bold bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">{pl.count}</div>
                          </div>
                          <div className="text-sm font-semibold leading-tight line-clamp-1">{pl.title}</div><div className="text-xs text-white/50 line-clamp-2 leading-relaxed">{pl.subtitle}</div>
                          <div className="mt-3 flex gap-1">
                            <button onClick={(e)=>{ e.stopPropagation(); playPlaylistNow(pl) }} className="flex-1 py-1.5 rounded-full bg-white text-black text-xs font-bold">Play</button>
                            <button onClick={(e)=>{ e.stopPropagation(); setPlaylists(prev=> prev.filter(x=> x.id!==pl.id)); showToast("Playlist deleted")}} className="w-8 h-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 border border-white/5"><CloseIcon/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {playlists.length===0 && <div className="text-center py-6 text-white/50 text-sm">No playlists yet — create your first!</div>}
                  </>
                )}

                {libTab==="Liked" && (
                  <div className="glass rounded-[20px] overflow-hidden">
                    <div className="p-5 flex gap-4 items-center bg-gradient-to-br from-[#A154D6]/30 to-[#543551]/30 border-b border-white/5">
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#A154D6] to-[#6A418E] grid place-items-center text-3xl">♥</div>
                      <div><h3 className="text-xl font-bold">Liked Songs</h3><p className="text-sm text-white/60">{likedTracks.length} songs • by {user.name}</p><button onClick={()=>{ if(likedTracks.length){ setQueue(likedTracks); setCurrentIndex(0); setIsPlaying(true) }}} className="mt-3 px-5 py-2 rounded-full bg-[#D5AA55] text-black text-sm font-bold flex items-center gap-2"><PlayMini/> Play all</button></div>
                    </div>
                    <div className="divide-y divide-white/5">
                      {likedTracks.length===0 ? (
                        <div className="py-16 text-center"><div className="w-16 h-16 mx-auto rounded-full bg-white/5 grid place-items-center text-2xl mb-3">♡</div><div className="font-medium">No liked songs yet</div><div className="text-sm text-white/50">Tap ♥ on any track to save here</div></div>
                      ) : likedTracks.map((t,i)=>{
                        const isCur = String(current?.id)===String(t.id)
                        return (
                          <div key={t.id} className={`flex items-center gap-3 px-4 py-2 hover:bg-white/5 group ${isCur?'bg-white/10':''}`}>
                            <span className="w-6 text-center text-xs text-white/30 group-hover:hidden">{String(i+1).padStart(2,'0')}</span><button onClick={()=> playTrack(t, likedTracks)} className="w-6 hidden group-hover:grid place-items-center"><PlayMini dark/></button>
                            <button onClick={()=> playTrack(t, likedTracks)} className="flex items-center gap-3 flex-1 min-w-0 text-left"><CoverImg track={t} className="w-10 h-10 rounded-md object-cover"/><div className="min-w-0"><div className={`text-sm font-medium truncate ${isCur?'text-[#D5AA55]':''}`}>{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div></button>
                            <span className="hidden sm:block text-xs text-white/40">{t.plays}</span><span className="text-xs text-white/60">{t.durationLabel}</span>
                            <button onClick={()=> toggleLike(t.id, t)} className="w-8 h-8 grid place-items-center text-[#C35445]"><Heart filled/></button>
                            <button onClick={()=> handleDownload(t)} className="w-8 h-8 grid place-items-center rounded-full border border-white/10 text-white/60"><DownloadIcon size={12}/></button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {libTab==="Local" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={()=> fileInputRef.current?.click()} className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-bold flex items-center gap-2"><PlusIcon/> Add Local Songs</button>
                      <span className="text-xs text-white/50 self-center">MP3, WAV, M4A, FLAC • Stored locally on this device</span>
                    </div>
                    {localSongs.length===0 ? (
                      <div className="glass rounded-[20px] p-10 text-center">
                        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[#D5AA55] to-[#6A418E] grid place-items-center text-2xl">♫</div>
                        <h3 className="font-bold mt-4">No local songs yet</h3><p className="text-sm text-white/50 max-w-md mx-auto mt-1">Tap "Add Local Songs" and pick audio files from your phone/computer. They'll play instantly without upload — just like Spotify's Local Files.</p>
                        <button onClick={()=> fileInputRef.current?.click()} className="mt-4 px-6 py-2.5 rounded-full bg-white text-black text-sm font-bold">Choose Files</button>
                      </div>
                    ) : (
                      <div className="glass rounded-[20px] overflow-hidden">
                        {localSongs.map((t,i)=>(
                          <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5">
                            <span className="w-6 text-center text-xs text-white/30">{String(i+1).padStart(2,'0')}</span>
                            <CoverImg track={t} className="w-10 h-10 rounded-md object-cover"/>
                            <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist} • Local File</div></div>
                            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">Local</span>
                            <button onClick={()=> playTrack(t, localSongs)} className="w-9 h-9 rounded-full bg-white text-black grid place-items-center"><PlayMini size={14}/></button>
                            <button onClick={()=> { setLocalSongs(prev=> prev.filter(x=> x.id!==t.id)); showToast("Removed local song")}} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 text-white/40"><CloseIcon/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {libTab==="Downloads" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-600/10 border border-emerald-500/20">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 grid place-items-center text-white"><DownloadIcon/></div>
                      <div className="flex-1"><div className="font-semibold text-sm">Offline Songs</div><div className="text-xs text-white/60">{downloaded.length} songs saved for offline listening{!isPro && ` • ${Math.max(0,FREE_DL_MAX-downloaded.length)} free left`}</div></div>
                      {downloaded.length>0 && <button onClick={async()=>{ for(const d of downloaded) await deleteDownload(d.id); setDownloaded([]); showToast("Cleared downloads")}} className="px-4 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold">Clear All</button>}
                    </div>
                    {downloaded.length===0 ? (
                      <div className="glass rounded-[20px] p-10 text-center">
                        <div className="w-16 h-16 mx-auto rounded-full bg-white/5 grid place-items-center text-2xl">↓</div>
                        <h3 className="font-bold mt-4">No downloads yet</h3><p className="text-sm text-white/50">Tap the <span className="inline-flex w-5 h-5 rounded-full bg-white/10 border border-white/10 items-center justify-center align-middle"><DownloadIcon size={10}/></span> icon on any song (Search, Home, Library) to download for offline.</p>
                      </div>
                    ) : (
                      <div className="glass rounded-[20px] overflow-hidden">
                        {downloaded.map(({track},i)=>(
                          <div key={track.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5">
                            <span className="w-6 text-center text-xs text-white/30">{String(i+1).padStart(2,'0')}</span>
                            <CoverImg track={track} className="w-10 h-10 rounded-md object-cover"/>
                            <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{track.title}</div><div className="text-xs text-white/50 truncate">{track.artist} • Offline</div></div>
                            <span className="hidden sm:block text-xs text-emerald-400">Offline ✓</span>
                            <button onClick={()=> playTrack(track, downloaded.map(d=>d.track))} className="w-9 h-9 rounded-full bg-white text-black grid place-items-center"><PlayMini size={14}/></button>
                            <button onClick={()=> handleRemoveDownload(track.id)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 text-white/40"><CloseIcon/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {libTab==="Songs" && (
                  <div className="glass rounded-[20px] overflow-hidden">
                    <div className="px-4 py-3 text-xs font-semibold tracking-widest text-white/40 border-b border-white/5">ALL SONGS • {allSongsForLibrary.length}</div>
                    <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                      {allSongsForLibrary.map((t,i)=>(
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5">
                          <span className="w-6 text-center text-xs text-white/30">{i+1}</span>
                          <button onClick={()=> playTrack(t, allSongsForLibrary)} className="flex items-center gap-3 flex-1 min-w-0 text-left"><CoverImg track={t} className="w-10 h-10 rounded-md object-cover"/><div className="min-w-0"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist} {t.isLocal && <span className="ml-1 text-emerald-400">• Local</span>}</div></div></button>
                          <button onClick={()=> setShowAddToPl(t)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10 text-white/60"><PlusIcon/></button>
                          <button onClick={()=> handleDownload(t)} className="w-8 h-8 grid place-items-center rounded-full border border-white/10 text-white/60"><DownloadIcon size={12}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <div className="flex flex-wrap items-baseline gap-3 mb-4"><h1 className="text-[28px] sm:text-[32px] font-bold font-display tracking-tight">{t('gm_'+greeting)}, {user.name.split(' ')[0]}</h1><span className="text-sm text-white/50 hidden sm:block">Ready to vibe? {localSongs.length>0? `${localSongs.length} local +`:''} {downloaded.length} offline • {activeCat==="All"? "All genres":"Category: "+activeCat}</span></div>
                  {activeCat!=="All" && (
                    <div className="mb-4 p-4 rounded-[20px] bg-gradient-to-br from-[#6A418E]/30 to-[#543551]/30 border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-white text-black grid place-items-center text-lg shrink-0">{categories.find(c=> c.id===activeCat)?.icon}</div>
                        <div className="min-w-0 flex-1"><div className="font-bold truncate">{activeCat} Playlist</div><div className="text-xs text-white/60">{homeTracks.length || getCategoryTracks(activeCat).length} songs • tap any song or Play All below</div></div>
                        <button onClick={()=> setActiveCat("All")} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs shrink-0">All</button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={()=>{ const tk = homeTracks.length? homeTracks : getCategoryTracks(activeCat); if(tk.length){ setQueue(tk); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing ${activeCat} • ${tk.length} tracks`) } else showToast('Pehle tracks load hojne do — Retry dabao') }} className="flex-1 py-2.5 rounded-full bg-white text-black text-sm font-bold flex items-center justify-center gap-2"><PlayMini/> {t('playall')}</button>
                      </div>
                    </div>
                  )}
                  {homeErr && !homeLoading && <div className="mb-3 p-4 rounded-[20px] bg-white/5 border border-white/10 flex items-center gap-3"><span className="text-sm text-white/70 flex-1">Internet/Lag delay — {activeCat} load nahi ho paya</span><button onClick={()=>{ setHomeErr(false); setHomeLoading(true); homePagerRef.current = createPager(); fetchCategoryPage(activeCat, null, 24, langs).then(({tracks:tr, nextCursor})=>{ setHomeTracks(tr||[]); setNext(nextCursor||null); setHomeLoading(false); if(tr&&tr.length) setHomeErr(false) }) }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold">{t('retry')}</button></div>}
                  {homeLoading ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9,10,11,12].map(i=> <div key={i} className="h-[64px] rounded-xl bg-white/5 animate-pulse border border-white/5"/> )}</div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {homeTracks.map(t=>{
                      const idx=queue.findIndex(x=> String(x.id)===String(t.id))
                      const isReal = t.source && !t.source.includes('tone')
                      return (
                        <button key={t.id} onClick={()=> playTrack(t, homeTracks)} className={`group flex items-center gap-3 pr-2 rounded-xl overflow-hidden text-left border transition ${idx===currentIndex? 'bg-white text-black border-white':'bg-white/[0.07] hover:bg-white/10 border-white/5'}`}>
                          <div className="relative w-14 h-14 sm:w-[64px] sm:h-[64px] shrink-0 overflow-hidden"><CoverImg track={t} className="w-full h-full object-cover"/><span className={`absolute inset-0 grid place-items-center bg-black/30 opacity-0 group-hover:opacity-100 ${idx===currentIndex && isPlaying? '!opacity-100':''}`}>{idx===currentIndex && isPlaying? <PauseIcon/>:<PlayIcon/>}</span>{!isReal && <span className="absolute bottom-1 left-1 text-[8px] bg-black/60 text-white px-1 py-0.5 rounded">tone</span>}</div>
                          <span className={`text-sm font-semibold leading-tight line-clamp-2 pr-2 ${idx===currentIndex? 'text-black':'text-white'}`}>{t.title}<span className="block text-xs font-normal opacity-60">{t.artist} {t.source? `• ${t.source.replace(" • Full","")}`:""}</span></span>
                          {liked.has(t.id) && <span className="ml-auto hidden sm:block text-[#C35445] mr-2"><Heart filled size={16}/></span>}
                        </button>
                      )
                    })}
                  </div>}
                  <div ref={homeSentinelRef} className="h-1" />
                  <div className="min-h-[56px] flex items-center justify-center">
                    {homeNextPage ? <button onClick={handleLoadMoreHome} disabled={homeLoadingMore} className="px-6 h-[42px] min-w-[280px] rounded-full bg-white/10 border border-white/10 text-sm font-bold hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-80">{homeLoadingMore? t('loadingmore') : t('loadmore')}</button> : (homeEnded && !homeLoading && homeTracks.length>0 && <div className="text-center text-xs text-white/30">{t('theend')}</div>)}
                  </div>
                  <div className="text-center text-xs text-white/30">Loaded {homeTracks.length} unique {activeCat} songs • Provider total not reported{homeNextPage ? ' • Scroll for more' : ''}</div>
                  {localSongs.length>0 && (
                    <div className="mt-4 glass rounded-2xl p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D5AA55] to-[#6A418E] grid place-items-center">♫</div>
                      <div className="flex-1"><div className="text-sm font-semibold">Local Files ready — {localSongs.length} songs</div><div className="text-xs text-white/60">Tap to play your device music, like Spotify Local Files</div></div>
                      <button onClick={()=>{ setNav('library'); setLibTab('Local')}} className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold">Open</button>
                    </div>
                  )}
                </div>

                <section>
                  <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold font-display">{activeCat==="All"? t('curated') : `${activeCat} Playlists • ${getCategoryPlaylists(activeCat).length || homeTracks.length || '—'} mixes`}</h2><button onClick={()=>{ setNav('library'); setLibTab('Playlists')}} className="text-sm font-semibold text-white/60 hover:text-white">{t('showall')}</button></div>
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-none snap-x">
                    {( (activeCat==="All"? playlists : getCategoryPlaylists(activeCat)).length? (activeCat==="All"? playlists : getCategoryPlaylists(activeCat)) : homeTracks.slice(0,8).map((tr,i)=> ({ id:`home-curated-${i}`, title: tr.title, subtitle: tr.artist + ' • ' + (tr.source||'Full'), cover: tr.cover, color: 'from-[#6A418E] to-[#543551]', count: tr.durationLabel, songs: [] })) ).map(pl=> (
                      <div key={pl.id} onClick={()=> openPlaylist(pl)} className="shrink-0 w-[172px] sm:w-[188px] glass rounded-[20px] p-3 snap-start hover:bg-white/[0.09] transition group cursor-pointer">
                        <div className="relative aspect-square rounded-[16px] overflow-hidden mb-3">
                          <CoverImg track={pl} className="w-full h-full object-cover group-hover:scale-105 transition duration-700"/>
                          <div className={`absolute inset-0 bg-gradient-to-br ${pl.color} opacity-70 mix-blend-overlay`}/>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"/>
                          <button onClick={(e)=>{ e.stopPropagation(); playPlaylistNow(pl) }} className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-white text-black grid place-items-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></button>
                          <div className="absolute top-3 left-3 text-[11px] font-bold tracking-widest bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">{pl.count || `${(pl.songs||[]).length} songs`}</div>
                        </div>
                        <div className="font-semibold text-sm leading-tight line-clamp-1">{pl.title}</div><div className="text-xs text-white/50 line-clamp-2 leading-relaxed mt-1">{pl.subtitle}</div>
                      </div>
                    ))}
                    {activeCat!=="All" && getCategoryPlaylists(activeCat).length===0 && <div className="shrink-0 w-full glass rounded-[20px] p-6 text-center text-white/50">No {activeCat} mixes yet — try All</div>}
                  </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6 min-w-0 max-w-full">
                  <section className="glass rounded-[24px] p-4 sm:p-5 min-w-0 max-w-full">
                    <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg">{t('recent')} — {recentlyPlayed.length? `${recentlyPlayed.length} songs`:'Real history'}</h3><button onClick={()=> { if(recentlyPlayed.length){ setQueue(recentlyPlayed); setCurrentIndex(0); setIsPlaying(true) }}} className="w-8 h-8 rounded-full bg-white text-black grid place-items-center"><ChevronRight/></button></div>
                    {recentlyPlayed.length===0 ? <div className="text-center py-8 text-sm text-white/50">Play any song — it will appear here (like Spotify history, saved to DB)</div> : null}
                    <div className="space-y-1">
                      {(recentlyPlayed.length? recentlyPlayed : queue).filter(isRealTrack).slice(0,7).map((t,i)=>{
                        const isCur = String(current?.id)===String(t.id)
                        return (
                          <div key={t.id+String(i)} className={`flex items-center gap-3 p-2 rounded-xl transition ${isCur? 'bg-white text-black':'hover:bg-white/5'}`}>
                            <span className={`hidden sm:block w-6 text-center text-xs font-bold ${isCur? 'text-black/40':'text-white/30'}`}>{String(i+1).padStart(2,'0')}</span>
                            <button onClick={()=> playTrack(t)} className="flex items-center gap-3 flex-1 min-w-0 text-left"><span className="relative block w-11 h-11 rounded-lg overflow-hidden shrink-0"><CoverImg track={t} className="w-full h-full object-cover"/><span className={`absolute inset-0 grid place-items-center bg-black/40 opacity-0 hover:opacity-100 ${isCur? 'opacity-100 bg-black/20':''}`}>{isCur && isPlaying? <PauseMini dark/>:<PlayMini dark/>}</span></span><span className="min-w-0 flex-1 block"><span className={`block text-sm font-medium truncate ${isCur? 'text-black':'text-white'}`}>{t.title} {t.source && <span className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded-full border border-black/10 ml-1">{t.source}</span>}</span><span className={`block text-xs truncate ${isCur? 'text-black/60':'text-white/50'}`}>{t.artist}</span></span></button>
                            <button onClick={()=> toggleLike(t.id, t)} className={`hidden sm:grid w-8 h-8 place-items-center rounded-full ${liked.has(t.id)? 'text-[#C35445]': isCur? 'text-black/30':'text-white/30 hover:text-white'}`}><Heart filled={liked.has(t.id)} size={16}/></button>
                            <button onClick={()=> handleDownload(t)} className={`hidden sm:grid w-8 h-8 place-items-center rounded-full border ${downloaded.find(d=> String(d.id)===String(t.id))? 'bg-emerald-500 border-emerald-500 text-white':'border-white/10 text-white/40'}`}><DownloadIcon size={12}/></button>
                            <span className={`text-xs font-medium ${isCur? 'text-black/60':'text-white/40'}`}>{t.durationLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                  <div className="space-y-6 min-w-0 max-w-full">
                    <section className="glass rounded-[24px] p-5 min-w-0 max-w-full">
                      <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg">{activeCat==="All"? "Top artists this month" : `${activeCat} Artists`}</h3><span className="text-xs text-white/40">{getFilteredArtists(activeCat).length} artists</span></div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {getFilteredArtists(activeCat).slice(0,6).map(a=>(
                          <button key={a.name} onClick={()=> handleArtistClick(a.name)} className="group text-center min-w-0 max-w-full">
                            <div className="relative mx-auto w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-[#D5AA55]/70 transition group-hover:scale-105"><ArtistAvatar name={a.name} src={a.image || ''} className="w-full h-full object-cover text-xl"/><div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition grid place-items-end justify-center pb-2"><span className="text-[10px] font-bold bg-white text-black px-2 py-0.5 rounded-full">Play</span></div></div>
                            <div className="text-xs font-semibold mt-2 leading-tight break-words group-hover:text-[#D5AA55]">{a.name}</div><div className="text-[11px] text-white/40">{a.plays} • {a.cat}</div>
                          </button>
                        ))}
                      </div>
                      <button onClick={()=> setShowAllArtists(true)} className="mt-5 w-full py-2.5 rounded-full bg-white text-black text-sm font-bold">View all artists</button>
                    </section>
                    <section className="relative rounded-[24px] overflow-hidden p-5 bg-gradient-to-br from-[#543551] via-[#6A418E] to-[#A154D6]">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"/><div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"/>
                      <div className="relative">
                        <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">✨ MAXMUSIC ORIGINALS</div>
                        <h3 className="text-2xl font-bold font-display leading-tight mt-3">Monsoon Mix 2025</h3><p className="text-sm text-white/80 mt-2 leading-relaxed">Baarishein, Heeriye & 30 soulful tracks for chai & late nights.</p>
                        <div className="flex items-center gap-3 mt-4"><button onClick={()=>{ if(homeTracks.length) playTrack(homeTracks[0], homeTracks); else showToast('Pehle tracks load hojne do…') }} className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-bold flex items-center gap-2"><PlayMini/> Play</button><button onClick={()=>{ if(homeTracks.length){ toggleLike(homeTracks[0].id, homeTracks[0]) } }} className={`w-10 h-10 rounded-full backdrop-blur grid place-items-center border ${homeTracks.length&&liked.has(homeTracks[0].id)? 'bg-[#C35445] border-[#C35445] text-white':'bg-white/15 border-white/15 text-white'}`}><Heart filled={!!(homeTracks.length&&liked.has(homeTracks[0].id))}/></button></div>
                        <div className="flex -space-x-2 mt-5">{homeTracks.slice(0,4).map(x=> (<CoverImg key={x.id} track={x} className="w-8 h-8 rounded-full object-cover border-2 border-[#6A418E]"/>))}{homeTracks.length>4 && <span className="w-8 h-8 rounded-full bg-black/30 backdrop-blur border-2 border-white/20 grid place-items-center text-xs font-bold">+{homeTracks.length-4}</span>}</div>
                      </div>
                    </section>
                  </div>
                </div>

                <section>
                  <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold font-display">{activeCat==="All"? "Jump back in — Online + Local" : `${activeCat} • Jump back in`}</h2><span className="text-xs text-white/40 hidden sm:block">{activeCat==="All"? "Based on your listening + downloads" : `${getCategoryTracks(activeCat).length} songs in ${activeCat}`}</span></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {(activeCat==="All"? (homeTracks.length? homeTracks.slice(0,6) : []) : (homeTracks.length? homeTracks.slice(0,12) : [])).map(t=>(
                      <button key={t.id} onClick={()=> playTrack(t, activeCat==="All"? (homeTracks.length? homeTracks : localSongs) : getCategoryTracks(activeCat))} className="text-left glass rounded-[18px] p-3 hover:bg-white/10 transition group">
                        <div className="relative aspect-square rounded-xl overflow-hidden mb-3"><CoverImg track={t} className="w-full h-full object-cover group-hover:scale-105 transition duration-700"/><span className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-[#D5AA55] text-black grid place-items-center shadow-lg translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></span>{t.isLocal && <span className="absolute top-2 left-2 text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">LOCAL</span>}{activeCat!=="All" && <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded-full border border-white/10">{activeCat}</span>}</div>
                        <div className="text-sm font-semibold leading-tight truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>

          {current && <div className={`fixed bottom-0 left-0 right-0 z-40 lg:left-[300px] ${showFull? 'hidden':''}`}>
            <div className="mx-3 lg:mx-4 mb-3 lg:mb-4">
              <div className="relative glass-strong rounded-[20px] lg:rounded-[18px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/10"><div className="h-full bg-[#D5AA55] rounded-r-full transition-all" style={{ width:`${duration? Math.min(100,(progress/duration)*100):0}%`}}/></div>
                <div className="flex items-center gap-3 px-3 py-3 lg:px-4">
                  <button onClick={()=> setShowFull(true)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl overflow-hidden shrink-0"><CoverImg track={current} className="w-full h-full object-cover"/><div className="absolute inset-0 ring-1 ring-white/10 rounded-xl"/></div>
                    <div className="min-w-0"><div className="text-sm font-semibold leading-tight truncate pr-2">{current.title} {current.source && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full border border-white/10 ml-1">{current.source}</span>}</div><div className="text-xs text-white/60 truncate pr-2 flex items-center gap-2">{current.artist}<span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-white/10 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/> {downloaded.find(d=> String(d.id)===String(current.id))? 'Offline':'Live'}</span></div></div>
                  </button>
                  <button onClick={()=> toggleLike(current.id, current)} className={`hidden sm:grid w-9 h-9 place-items-center rounded-full border ${liked.has(current.id)? 'bg-[#C35445] border-[#C35445] text-white':'border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}><Heart filled={liked.has(current.id)}/></button>
                  <div className="hidden md:flex items-center gap-1">
                    <button onClick={()=> setShuffle(!shuffle)} className={`w-8 h-8 grid place-items-center rounded-full ${shuffle? 'text-[#D5AA55] bg-[#D5AA55]/15':'text-white/60 hover:text-white'}`}><ShuffleIcon active={shuffle}/></button>
                    <button onClick={handlePrev} className="w-9 h-9 grid place-items-center text-white hover:bg-white/10 rounded-full"><PrevIcon/></button>
                    <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-white text-black grid place-items-center hover:scale-105 transition shadow-lg">{isPlaying? <PauseIcon dark/>:<PlayIcon dark/>}</button>
                    <button onClick={handleNext} className="w-9 h-9 grid place-items-center text-white hover:bg-white/10 rounded-full"><NextIcon/></button>
                    <button onClick={()=> setRepeat(r=> (r+1)%3)} className={`w-8 h-8 grid place-items-center rounded-full ${repeat!==0? 'text-[#D5AA55] bg-[#D5AA55]/15':'text-white/60 hover:text-white'}`}><RepeatIcon mode={repeat}/></button>
                  </div>
                  <div className="flex md:hidden items-center gap-2"><button onClick={togglePlay} className="w-9 h-9 rounded-full bg-white text-black grid place-items-center">{isPlaying? <PauseMini/>:<PlayMini/>}</button><button onClick={handleNext} className="w-9 h-9 grid place-items-center text-white/80"><NextIcon/></button></div>
                  <div className="hidden lg:flex items-center gap-3 pl-3 border-l border-white/10">
                    <button onClick={()=> setShowLyrics(!showLyrics)} className={`hidden xl:grid w-8 h-8 place-items-center rounded-full ${showLyrics? 'bg-white text-black':'text-white/60 hover:text-white hover:bg-white/10'}`}><MicIcon/></button>
                    <button onClick={()=> setShowQueue(!showQueue)} className={`w-8 h-8 grid place-items-center rounded-full ${showQueue? 'bg-white text-black':'text-white/60 hover:text-white hover:bg-white/10'}`}><QueueIcon/></button>
                    <div className="hidden xl:flex items-center gap-2"><button onClick={()=> setIsMuted(!isMuted)} className="w-8 h-8 grid place-items-center text-white/60 hover:text-white"><VolumeIcon muted={isMuted} volume={volume}/></button><input type="range" min={0} max={1} step={0.01} value={isMuted?0:volume} onChange={e=>{ setVolume(Number(e.target.value)); setIsMuted(false)}} className="range w-20 accent-white"/></div>
                    <button onClick={()=> setShowFull(true)} className="w-8 h-8 grid place-items-center text-white/60 hover:text-white hover:bg-white/10 rounded-full"><ExpandIcon/></button>
                  </div>
                  <button onClick={()=> setShowFull(true)} className="lg:hidden w-8 h-8 grid place-items-center text-white/60"><ExpandIcon/></button>
                </div>
              </div>
            </div>
          </div>}

          {/* itrace-24: Playlist detail page */}
          {selectedPlaylist && (()=>{
            const pl = playlists.find(x=> x.id===selectedPlaylist)
            if(!pl) return null
            const tracks = playlistTracks(pl)
            return (
              <div className="fixed inset-0 z-50 bg-[#060306] overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 py-5 pb-32">
                  <button onClick={()=> setSelectedPlaylist(null)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-4"><ChevronLeft/> Back</button>
                  <div className="flex gap-4 items-center">
                    <CoverImg track={pl} className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover shadow-xl shrink-0"/>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold tracking-widest text-white/50">PLAYLIST</div>
                      <h2 className="text-2xl font-bold font-display leading-tight truncate">{pl.title}</h2>
                      <div className="text-sm text-white/60 mt-1 truncate">{pl.subtitle}</div>
                      <div className="text-xs text-white/50 mt-1">{tracks.length} songs</div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={()=> playPlaylistNow(pl)} className="px-6 py-2 rounded-full bg-white text-black text-sm font-bold flex items-center gap-2"><PlayMini/> Play</button>
                        <button onClick={()=>{ if(!tracks.length) return; const sh=[...tracks].sort(()=>Math.random()-0.5); setQueue(sh); setCurrentIndex(0); setIsPlaying(true); showToast(`Shuffling • ${pl.title}`) }} className="px-5 py-2 rounded-full bg-white/10 border border-white/10 text-sm font-bold">Shuffle</button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-1">
                    {tracks.length===0 && <div className="text-center py-10 text-white/50 text-sm">No songs yet — open any song → Add to playlist</div>}
                    {tracks.map((t,i)=>{
                      const isCur = String(current?.id)===String(t.id)
                      return (
                        <div key={String(t.id)+i} className={`flex items-center gap-3 p-2 rounded-xl ${isCur?'bg-white text-black':'hover:bg-white/5'}`}>
                          <span className={`w-6 text-center text-xs font-bold shrink-0 ${isCur?'text-black/40':'text-white/30'}`}>{String(i+1).padStart(2,'0')}</span>
                          <button onClick={()=> playTrack(t, tracks)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                            <CoverImg track={t} className="w-11 h-11 rounded-lg object-cover shrink-0"/>
                            <span className="min-w-0 flex-1 block"><span className={`block text-sm font-medium truncate ${isCur?'text-black':'text-white'}`}>{t.title}</span><span className={`block text-xs truncate ${isCur?'text-black/60':'text-white/50'}`}>{t.artist}</span></span>
                          </button>
                          <span className={`text-xs hidden sm:block shrink-0 ${isCur?'text-black/60':'text-white/40'}`}>{t.durationLabel}</span>
                          <button onClick={()=> toggleLike(t.id, t)} className={`w-8 h-8 grid place-items-center shrink-0 ${liked.has(t.id)?'text-[#C35445]':isCur?'text-black/30':'text-white/30'}`}><Heart filled={liked.has(t.id)} size={16}/></button>
                          <button onClick={()=> handleRemoveFromPlaylist(pl.id, t.id)} title="Remove from playlist" className={`w-8 h-8 grid place-items-center rounded-full shrink-0 ${isCur?'text-black/40 hover:text-black':'text-white/40 hover:text-white'}`}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
          {/* Dedicated artist page: portrait from provider profile metadata
              only (initials fallback), credited songs, real pagination. */}
          {artistPageOpen && selectedArtist && (
            <div className="fixed inset-0 z-[60] bg-[#060306] overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 py-5 pb-32">
                <button onClick={closeArtistPage} className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-4"><ChevronLeft/> Back</button>
                <div className="flex gap-4 items-center">
                  <ArtistAvatar name={selectedArtist} src={artistPortraitFor(selectedArtist)} className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover shadow-xl shrink-0 text-4xl border-2 border-white/10"/>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold tracking-widest text-white/50">ARTIST</div>
                    <h2 className="text-2xl font-bold font-display leading-tight truncate">{selectedArtist}</h2>
                    <div className="text-xs text-white/50 mt-1">Loaded {artistTracks.length} unique songs • Total: {artistTotal != null ? artistTotal : 'not reported by provider'}</div>
                    {artistProfile && artistProfile.followers != null && <div className="text-xs text-white/50 mt-0.5">{artistProfile.followers} followers</div>}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button onClick={toggleFollow} className={`px-5 py-2 rounded-full text-sm font-bold border ${followed.has(selectedArtist)?'bg-white text-black border-white':'bg-white/10 border-white/10'}`}>{followed.has(selectedArtist)?'✓ '+t('following'):'+ '+t('follow')}</button>
                      <button onClick={()=>{ if(artistTracks.length){ setQueue(artistTracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing ${selectedArtist}`) } }} className="px-6 py-2 rounded-full bg-white text-black text-sm font-bold flex items-center gap-2"><PlayMini/> Play All</button>
                      <button onClick={()=>{ if(artistTracks.length){ const sh=[...artistTracks].sort(()=>Math.random()-0.5); setQueue(sh); setCurrentIndex(0); setIsPlaying(true); showToast(`Shuffling • ${selectedArtist}`) } }} className="px-5 py-2 rounded-full bg-white/10 border border-white/10 text-sm font-bold">Shuffle</button>
                    </div>
                  </div>
                </div>
                <div className="mt-5 space-y-1">
                  {artistLoading && artistTracks.length===0 && <div className="text-center py-10 text-white/50 text-sm">Loading {selectedArtist}…</div>}
                  {!artistLoading && artistTracks.length===0 && <div className="text-center py-10 text-white/50 text-sm">No credited tracks found for this artist yet.</div>}
                  {artistTracks.map((tr,i)=>{
                    const isCur = String(current?.id)===String(tr.id)
                    return (
                      <div key={String(tr.id)+i} className={`flex items-center gap-3 p-2 rounded-xl ${isCur?'bg-white text-black':'hover:bg-white/5'}`}>
                        <span className={`w-6 text-center text-xs font-bold shrink-0 ${isCur?'text-black/40':'text-white/30'}`}>{String(i+1).padStart(2,'0')}</span>
                        <button onClick={()=> playTrack(tr, artistTracks)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <CoverImg track={tr} className="w-11 h-11 rounded-lg object-cover shrink-0"/>
                          <span className="min-w-0 flex-1 block"><span className={`block text-sm font-medium truncate ${isCur?'text-black':'text-white'}`}>{tr.title}</span><span className={`block text-xs truncate ${isCur?'text-black/60':'text-white/50'}`}>{tr.artist}</span></span>
                        </button>
                        <span className={`text-xs hidden sm:block shrink-0 ${isCur?'text-black/60':'text-white/40'}`}>{tr.durationLabel}</span>
                        <button onClick={()=> toggleLike(tr.id, tr)} className={`w-8 h-8 grid place-items-center shrink-0 ${liked.has(tr.id)?'text-[#C35445]':isCur?'text-black/30':'text-white/30'}`}><Heart filled={liked.has(tr.id)} size={16}/></button>
                      </div>
                    )
                  })}
                </div>
                <div ref={artistSentinelRef} className="h-1" />
                <div className="min-h-[48px] flex items-center justify-center">
                  {artistNextPage ? <button onClick={handleLoadMoreArtist} disabled={artistLoadingMore} className="px-6 h-[40px] min-w-[240px] rounded-full bg-white/10 border border-white/10 text-xs font-bold hover:bg-white hover:text-black disabled:opacity-50">{artistLoadingMore? 'Loading more…':'Load more songs'}</button> : (artistEnded && artistTracks.length>0 ? <div className="text-center text-xs text-white/30">End of available results for this artist • Loaded {artistTracks.length} unique songs • Total: {artistTotal != null ? artistTotal : 'not reported by provider'}</div> : null)}
                </div>
              </div>
            </div>
          )}
          {/* itrace-24: All artists page */}
          {showAllArtists && (
            <div className="fixed inset-0 z-50 bg-[#060306] overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 py-5 pb-32">
                <button onClick={()=> setShowAllArtists(false)} className="flex items-center gap-2 text-sm text-white/70 hover:text-white mb-4"><ChevronLeft/> Back</button>
                <h2 className="text-2xl font-bold font-display">All artists <span className="text-sm font-normal text-white/50">• {getFilteredArtists(activeCat).length}</span></h2>
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {getFilteredArtists(activeCat).map(a=>(
                    <button key={a.name} onClick={()=> handleArtistClick(a.name)} className="glass rounded-2xl p-3 text-center hover:bg-white/10 transition">
                      <ArtistAvatar name={a.name} src={a.image || ''} className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/10 text-lg"/>
                      <div className="text-xs font-semibold mt-2 leading-tight break-words">{a.name}</div>
                      <div className="text-[11px] text-white/40">{a.plays} • {a.cat}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* itrace-27: app update popup */}
          {showUpdate && updateInfo && (()=>{ const highlights = (updateInfo.features && updateInfo.features.length ? updateInfo.features : updateInfo.notes) || []; return (
            <div className="fixed inset-0 z-[80] grid place-items-center p-4">
              <div onClick={()=> setShowUpdate(false)} className="absolute inset-0 bg-black/75 backdrop-blur-md"/>
              <div className="relative w-full max-w-sm glass-strong rounded-[28px] p-6 text-center overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full blur-[70px] opacity-30 pointer-events-none" style={{ background:`radial-gradient(circle, ${activeTheme.accent} 0%, transparent 70%)` }}/>
                <div className="relative">
                  <div className="mx-auto w-16 h-16 rounded-[22px] grid place-items-center shadow-2xl" style={{ background:`linear-gradient(135deg, ${activeTheme.accent}, ${activeTheme.accent2})` }}><span className="text-3xl text-white drop-shadow">⬆</span></div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 border border-emerald-400/25 px-3 py-1 text-[10px] font-extrabold tracking-[0.16em] text-emerald-300 uppercase"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Update available</div>
                  <h3 className="font-bold text-[22px] leading-tight font-display mt-3">A new version is ready</h3>
                  <p className="text-sm text-white/60 mt-1">Version {updateInfo.version || '—'} • Build {updateInfo.build}</p>
                  <p className="text-[11px] text-white/40 mt-1">You are currently on build {APP_BUILD_NO || '—'}</p>
                  {highlights.length>0 ? (
                    <div className="text-left mt-5 rounded-[22px] bg-white/[0.06] border border-white/10 p-4">
                      <div className="text-[10px] font-extrabold tracking-[0.18em] text-white/45 uppercase mb-3">What’s new</div>
                      <ul className="space-y-2.5">{highlights.slice(0,6).map((n,i)=> <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-white/80"><span className="mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] font-black text-black" style={{ background: activeTheme.accent }}>✓</span><span>{n}</span></li>)}</ul>
                    </div>
                  ) : (
                    <p className="text-sm text-white/65 leading-relaxed mt-5 rounded-[22px] bg-white/[0.06] border border-white/10 p-4">This update includes performance improvements and bug fixes.</p>
                  )}
                  <button onClick={()=> openExternal(updateInfo.apk)} className="mt-5 w-full py-3.5 rounded-full text-sm font-extrabold text-black shadow-lg active:scale-[0.99] transition" style={{ background:`linear-gradient(135deg, ${activeTheme.accent}, ${activeTheme.accent2})` }}>Download update</button>
                  <button onClick={()=> setShowUpdate(false)} className="mt-2.5 w-full py-3 rounded-full bg-white/10 border border-white/10 text-sm font-bold hover:bg-white/15">Maybe later</button>
                  <p className="text-[11px] leading-relaxed text-white/40 mt-4">Open the downloaded file and tap Install. Your library, playlists and downloads will remain intact.</p>
                </div>
              </div>
            </div>
          )})()}
          {/* Full player */}
          {current && <div style={{ background: activeTheme.bg }} className={`fixed inset-0 z-50 w-full max-w-[100vw] overflow-y-auto overflow-x-hidden transition-transform duration-500 ${showFull? 'translate-y-0':'translate-y-full'}`}
            onTouchStart={e=>{ touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } }}
            onTouchEnd={e=>{ const s = touchRef.current; if(!s) return; const dx = e.changedTouches[0].clientX - s.x; const dy = e.changedTouches[0].clientY - s.y; if(Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)*1.4){ if(dx < 0) handleNext(); else handlePrev(); } else if(dy > 120 && Math.abs(dy) > Math.abs(dx)*1.2){ setShowFull(false) } touchRef.current=null }}>
            <div className="min-h-screen relative">
              <div className="absolute inset-0 overflow-hidden"><CoverImg track={current} className="w-full h-full object-cover scale-110 blur-[60px] opacity-30"/><div className="absolute inset-0" style={{ background:`linear-gradient(to bottom, ${activeTheme.bg}66, ${activeTheme.bg}B3, ${activeTheme.bg})` }}/><div className="absolute inset-0" style={{ background:`radial-gradient(600px 600px at 50% 0%, ${activeTheme.accent}40, transparent)`}}/></div>
              <div className="relative max-w-[980px] mx-auto px-4 lg:px-6 py-4 lg:py-6">
                <div className="flex items-center justify-between gap-4">
                  <button onClick={()=> setShowFull(false)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/10 grid place-items-center hover:bg-white/15"><ChevronDownLarge/></button>
                  <div className="text-center"><div className="text-xs tracking-[0.18em] font-bold text-white/50">NOW PLAYING</div><div className="text-sm font-semibold">Playing from <span className="text-[#D5AA55]">{current.source || 'MaxMusic'}</span></div></div>
                  <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/10 grid place-items-center hover:bg-white/15"><MoreIcon/></button>
                </div>
                <div className="mt-6 lg:mt-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center min-w-0">
                  <div className="relative mx-auto w-full max-w-[520px] min-w-0">
                    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)] bg-black">
                      <CoverImg track={current} className={`w-full h-full object-cover ${isPlaying? 'scale-[1.02]':'scale-100'} transition duration-[2000ms]`}/>
                      <div className="absolute inset-0 rounded-[32px] ring-1 ring-white/10"/>
                      <div className={`absolute inset-0 grid place-items-center transition-opacity ${showLyrics? 'opacity-0':'opacity-100'}`}>
                        <div className={`w-[18%] aspect-square rounded-full bg-black/70 backdrop-blur border-4 border-white/10 grid place-items-center shadow-2xl ${isPlaying? 'animate-spin':''}`} style={{ animationDuration:'8s'}}><div className="w-3 h-3 rounded-full bg-[#D5AA55]"/></div>
                      </div>
                    </div>
                    <div className="absolute -bottom-4 left-4 right-4 flex justify-center"><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 text-xs font-medium"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/> {downloaded.find(d=> String(d.id)===String(current.id))? 'Offline • Downloaded':'Lossless • 24-bit / 48 kHz'}</div></div>
                    <div className="hidden lg:flex absolute -right-6 top-10 flex-col gap-2">
                      <button onClick={()=> toggleLike(current.id, current)} className={`w-11 h-11 rounded-full backdrop-blur-xl border grid place-items-center shadow-lg ${liked.has(current.id)? 'bg-[#C35445] border-[#C35445] text-white':'bg-white/10 border-white/15 text-white hover:bg-white/15'}`}><Heart filled={liked.has(current.id)}/></button>
                      <button onClick={()=> handleDownload(current)} className={`w-11 h-11 rounded-full backdrop-blur-xl border grid place-items-center ${downloaded.find(d=> String(d.id)===String(current.id))? 'bg-emerald-500 border-emerald-500 text-white':'bg-white/10 border-white/15 text-white hover:bg-white/15'}`}><DownloadIcon/></button>
                      <button onClick={()=> setShowAddToPl(current)} className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 grid place-items-center text-white hover:bg-white/15"><PlusIcon/></button>
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="text-center lg:text-left">
                      <h1 className="text-[32px] lg:text-[40px] font-bold font-display leading-none tracking-tight break-words [overflow-wrap:anywhere] line-clamp-2">{current.title}</h1><p className="text-lg text-white/70 mt-2 truncate">{current.artist}</p><p className="text-sm text-white/40 mt-1 break-words [overflow-wrap:anywhere]">{[ (current.album && current.album!=='—')? current.album : null, /^\d+(\.\d+)?[MK]$/i.test(String(current.plays||''))? `${current.plays} plays` : null, current.source || null ].filter(Boolean).join(' • ')}</p>
                      <div className="lg:hidden flex items-center justify-center gap-3 mt-5">
                        <button onClick={()=> toggleLike(current.id, current)} className={`w-11 h-11 rounded-full border grid place-items-center ${liked.has(current.id)? 'bg-[#C35445] border-[#C35445] text-white':'bg-white/10 border-white/10 text-white'}`}><Heart filled={liked.has(current.id)}/></button>
                        <button onClick={()=> handleDownload(current)} className={`px-5 py-2.5 rounded-full text-sm font-bold border ${downloaded.find(d=> String(d.id)===String(current.id))? 'bg-emerald-500 border-emerald-500 text-white':'bg-white/10 border-white/10 text-white'}`}>{downloaded.find(d=> String(d.id)===String(current.id))? 'Downloaded ✓':'Download'}</button>
                        <button onClick={()=> setShowAddToPl(current)} className="px-5 py-2.5 rounded-full bg-white/10 border border-white/10 text-sm font-semibold">+ Playlist</button>
                      </div>
                    </div>
                    <div className="mt-8 lg:mt-10">
                      <div className="flex items-center gap-3"><span className="text-xs font-medium tabular-nums text-white/70 w-10 text-right">{formatTime(progress)}</span><div className="flex-1 relative h-6 -my-2 cursor-pointer touch-none" onPointerDown={e=>{ scrubRef.current=true; e.currentTarget.setPointerCapture(e.pointerId); scrubTo(e.clientX, e.currentTarget) }} onPointerMove={e=>{ if(scrubRef.current) scrubTo(e.clientX, e.currentTarget) }} onPointerUp={()=>{ scrubRef.current=false }} onPointerCancel={()=>{ scrubRef.current=false }}>
                          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#D5AA55] to-white rounded-full" style={{width:`${duration? Math.min(100,(progress/duration)*100):0}%`}}/></div>
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[14px] h-[14px] rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.25),0_2px_8px_rgba(0,0,0,0.6)]" style={{left:`${duration? Math.min(100,(progress/duration)*100):0}%`}}/>
                        </div><span className="text-xs font-medium tabular-nums text-white/70 w-10">-{formatTime(Math.max(0,(duration||0)-progress))}</span></div>
                      <div className="flex items-center justify-between mt-6"><button onClick={()=> setShuffle(!shuffle)} className={`w-10 h-10 grid place-items-center rounded-full ${shuffle? 'text-[#D5AA55] bg-[#D5AA55]/15':'text-white/60 hover:text-white'}`}><ShuffleIcon active={shuffle}/></button><button onClick={handlePrev} className="w-12 h-12 grid place-items-center text-white hover:bg-white/10 rounded-full"><PrevIcon large/></button><button onClick={togglePlay} className="w-[72px] h-[72px] rounded-full bg-white text-black grid place-items-center shadow-[0_10px_30px_rgba(255,255,255,0.25)] hover:scale-[1.02] active:scale-[0.98] transition">{isPlaying? <PauseIcon large dark/>:<PlayIcon large dark/>}</button><button onClick={handleNext} className="w-12 h-12 grid place-items-center text-white hover:bg-white/10 rounded-full"><NextIcon large/></button><button onClick={()=> setRepeat(r=> (r+1)%3)} className={`w-10 h-10 grid place-items-center rounded-full ${repeat!==0? 'text-[#D5AA55] bg-[#D5AA55]/15':'text-white/60 hover:text-white'}`}><RepeatIcon mode={repeat}/></button></div>
                      <div className="flex items-center justify-between mt-8 gap-3"><button onClick={()=> setShowLyrics(!showLyrics)} className={`flex-1 py-3 rounded-full text-sm font-bold border transition ${showLyrics? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10 hover:bg-white/15'}`}>{lyricsLoading? 'Lyrics…' : showLyrics? 'Hide Lyrics':'View Lyrics'}</button><button onClick={()=> setShowQueue(!showQueue)} className={`px-5 py-3 rounded-full text-sm font-bold border shrink-0 ${showQueue? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10'}`}>Queue</button></div>
                      <div className="hidden lg:flex items-center gap-3 mt-6"><VolumeIcon muted={isMuted} volume={volume}/><input type="range" min={0} max={1} step={0.01} value={isMuted?0:volume} onChange={e=>{ setVolume(Number(e.target.value)); setIsMuted(false)}} className="range flex-1 accent-white"/><button onClick={()=> setIsMuted(!isMuted)} className="text-xs font-semibold text-white/60 hover:text-white">{isMuted? 'Muted':'Volume'}</button></div>
                    </div>
                  </div>
                </div>
                {showLyrics && (
                  <div ref={lyricsBoxRef} className="mt-8 glass rounded-[24px] p-6 max-h-[40vh] overflow-y-auto"><h3 className="font-bold mb-4 flex items-center gap-2 flex-wrap break-words [overflow-wrap:anywhere]"><MicIcon/> Lyrics — <span className="min-w-0 truncate max-w-[70vw]">{current.title}</span>{lyrics && lyrics.synced ? <span className="text-[9px] font-bold tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">AUTO-SYNCED</span> : null}</h3>
                    {lyricsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-white/40 py-4"><span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"/>Finding real lyrics…</div>
                    ) : !lyrics ? (
                      <div className="text-sm text-white/40 py-3 leading-relaxed">No verified lyrics found for this track yet.<br/><span className="text-white/25">We only show real lyrics — never dummy text.</span></div>
                    ) : (
                      <div className="space-y-2.5 text-[15px] leading-relaxed">
                        {lyrics.lines.map((ln,i)=>{
                          const active = lyrics.synced && progress >= ln.t && (i+1 >= lyrics.lines.length || progress < lyrics.lines[i+1].t)
                          return <p key={i} {...(active? {'data-active':'1'}:{})} className={active? 'rounded-lg bg-white text-black font-bold px-2.5 py-1 -mx-1.5' : lyrics.synced? 'text-white/40' : 'text-white/80'} style={{overflowWrap:'anywhere', wordBreak:'break-word'}}>{ln.text}</p>
                        })}
                        <p className="text-white/25 text-xs pt-3">Lyrics via LRCLIB {lyrics.synced ? '• synced to playback' : '• plain text'}</p>
                      </div>
                    )}
                  </div>
                )}
                {showQueue && (
                  <div className="mt-8 glass rounded-[24px] p-6"><div className="flex items-center justify-between mb-4"><h3 className="font-bold">Up next</h3><button onClick={()=> setShowQueue(false)} className="text-sm text-white/60 hover:text-white">Close</button></div><div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">{queue.slice(currentIndex+1, currentIndex+6).map(t=> (<button key={t.id} onClick={()=>{ const idx=queue.findIndex(x=> String(x.id)===String(t.id)); setCurrentIndex(idx); setIsPlaying(true)}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 text-left"><CoverImg track={t} className="w-11 h-11 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div><span className="text-xs text-white/40">{t.durationLabel}</span></button>))}</div></div>
                )}
              </div>
            </div>
          </div>}

          {current && showQueue && !showFull && (
            <div className="fixed inset-0 z-40"><div onClick={()=> setShowQueue(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm"/><div className="absolute bottom-[88px] right-4 left-4 lg:left-auto lg:right-6 w-auto lg:w-[380px] glass-strong rounded-[20px] p-4 max-h-[60vh] flex flex-col shadow-2xl"><div className="flex items-center justify-between mb-3"><h3 className="font-bold">Queue</h3><button onClick={()=> setShowQueue(false)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10"><CloseIcon/></button></div><div className="text-xs font-semibold tracking-widest text-white/40 mb-2">NOW PLAYING</div><div className="flex items-center gap-3 p-2 rounded-xl bg-white text-black mb-3"><CoverImg track={current} className="w-11 h-11 rounded-lg object-cover"/><div className="min-w-0"><div className="text-sm font-semibold truncate">{current.title}</div><div className="text-xs text-black/60 truncate">{current.artist}</div></div><Equalizer dark/></div><div className="text-xs font-semibold tracking-widest text-white/40 mb-2">NEXT UP</div><div className="space-y-1 overflow-y-auto flex-1 pr-1">{queue.slice(currentIndex+1, currentIndex+7).map(t=> (<button key={t.id} onClick={()=>{ const idx=queue.findIndex(x=> String(x.id)===String(t.id)); setCurrentIndex(idx); setIsPlaying(true)}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left"><CoverImg track={t} className="w-10 h-10 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div><PlayMini/></button>))}</div><button onClick={()=>{ setShuffle(true); handleNext()}} className="mt-3 w-full py-2.5 rounded-full bg-white text-black text-sm font-bold">Shuffle play</button></div></div>
          )}

          {/* itrace-25: npPermBar nag banner removed — permission auto-granted, no popup on open */}

          {crashTrace && crashOpen && (
            <div className="fixed inset-0 z-[90] grid place-items-center p-4">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=> setCrashOpen(false)}/>
              <div className="relative w-full max-w-lg glass-strong rounded-[20px] p-5 border border-red-500/30">
                <h3 className="font-bold text-red-300 flex items-center gap-2">⚠︎ App crashed last time</h3>
                <p className="text-xs text-white/60 mt-1">Ye trace developer ke liye hai — Copy karke bhej do. Iske baad Safe-mode se native player off karke bhi chala sakte ho.</p>
                <pre className="mt-3 max-h-[36vh] overflow-auto rounded-xl bg-black/50 border border-white/10 p-3 text-[10px] leading-relaxed text-white/80 whitespace-pre-wrap break-all">{crashTrace}</pre>
                <div className="mt-4 flex flex-wrap gap-2 justify-end">
                  <button onClick={()=>{ try{ navigator.clipboard.writeText(crashTrace); showToast? showToast('Crash trace copied') : null }catch{ try{ const ta=document.createElement('textarea'); ta.value=crashTrace; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }catch{} } }} className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90">Copy trace</button>
                  <button onClick={()=>{ npSetDisabled(true); showToast('Safe mode ON — app is restarting without native player…'); setTimeout(()=>{ try{ location.reload() }catch{} }, 600) } } className="rounded-full border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-xs font-bold text-amber-200">Safe mode ON + reload</button>
                  <button onClick={()=> setCrashOpen(false)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70">Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Modals */}
          {showAuth && (
            <div className="fixed inset-0 z-[70] grid place-items-center p-4"><div onClick={()=> setShowAuth(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-sm glass-strong rounded-[24px] p-6">
              <h3 className="text-lg font-bold">{authForm.mode==='login' ? "Welcome back" : "Create your account"}</h3>
              <p className="text-xs text-white/50 mt-1">{authForm.mode==='login' ? 'Sign in — liked songs + playlists cloud se sync honge.' : 'Naam + email se account — sab kuch cloud me save, device badlo, music saath.'}</p>
              {authForm.mode==='signup' && <input autoFocus value={authForm.name} onChange={e=> setAuthForm({...authForm, name:e.target.value})} placeholder="Naam" className="mt-4 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30"/>}
              <input type="email" value={authForm.email} onChange={e=> setAuthForm({...authForm, email:e.target.value})} placeholder="email@example.com" className={`${authForm.mode==='login'?'mt-4':''} mt-2 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30`}/>
              <input type="password" value={authForm.password} onChange={e=> setAuthForm({...authForm, password:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter') handleAuthSubmit() }} placeholder="Password (min 6)" className="mt-2 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30"/>
              <button onClick={handleAuthSubmit} disabled={authBusy} className="mt-4 w-full py-2.5 rounded-full bg-[#D5AA55] text-black font-bold disabled:opacity-50">{authBusy ? 'Connecting…' : (authForm.mode==='login' ? 'Sign in ☁' : 'Create account ☁')}</button>
              <button onClick={()=> setAuthForm({...authForm, mode: authForm.mode==='login'?'signup':'login'})} className="mt-3 w-full text-xs text-white/60 hover:text-white">{authForm.mode==='login' ? 'Naya account chahiye? Sign up' : 'Pehle se account hai? Sign in'}</button>
            </div></div>
          )}
          {showWelcome && (
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#060306]">
              <div className="min-h-full grid place-items-center p-4">
                <div className="w-full max-w-sm text-center py-8 min-w-0">
                  <div className="w-16 h-16 mx-auto rounded-[20px] bg-gradient-to-br from-[#D5AA55] to-[#6A418E] grid place-items-center text-3xl shadow-2xl">🎵</div>
                  <h1 className="text-3xl font-bold font-display mt-4">MaxMusic</h1>
                  <p className="text-sm text-white/50 mt-1">Full songs • background play • lock-screen controls</p>
                  {welcomeMode==='home' ? (<>
                    <button onClick={()=>{ setAuthForm(f=>({...f,mode:'login'})); setWelcomeErr(''); setWelcomeMode('login') }} className="mt-8 w-full py-3 rounded-full bg-[#D5AA55] text-black font-bold">Log in</button>
                    <button onClick={()=>{ setAuthForm(f=>({...f,mode:'signup'})); setWelcomeErr(''); setWelcomeMode('signup') }} className="mt-3 w-full py-3 rounded-full bg-white/10 border border-white/10 font-bold">Create account</button>
                    <button onClick={chooseGuest} className="mt-3 w-full py-3 rounded-full text-sm text-white/60 hover:text-white">Continue as Guest →</button>
                    <p className="text-[11px] text-white/30 mt-5 leading-relaxed">Guest = full music, data stays on this device.<br/>Account = liked + playlists sync on every device ☁</p>
                  </>) : (<>
                    <button onClick={()=>{ setWelcomeMode('home'); setWelcomeErr('') }} className="mt-6 text-xs text-white/60 hover:text-white">← Back</button>
                    <h3 className="text-lg font-bold mt-2">{authForm.mode==='login' ? 'Welcome back' : 'Create your account'}</h3>
                    {authForm.mode==='signup' && <input autoFocus value={authForm.name} onChange={e=> setAuthForm({...authForm, name:e.target.value})} placeholder="Naam" className="mt-4 w-full h-12 px-4 rounded-2xl bg-white/10 border border-white/10 text-sm outline-none focus:border-[#D5AA55]/60"/>}
                    <input type="email" value={authForm.email} onChange={e=> setAuthForm({...authForm, email:e.target.value})} placeholder="email@example.com" className="mt-3 w-full h-12 px-4 rounded-2xl bg-white/10 border border-white/10 text-sm outline-none focus:border-[#D5AA55]/60"/>
                    <input type="password" value={authForm.password} onChange={e=> setAuthForm({...authForm, password:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter') handleWelcomeSubmit() }} placeholder="Password (6+ chars)" className="mt-3 w-full h-12 px-4 rounded-2xl bg-white/10 border border-white/10 text-sm outline-none focus:border-[#D5AA55]/60"/>
                    {welcomeErr && <div className="mt-3 text-xs font-semibold text-[#E8837A] break-words">{welcomeErr}</div>}
                    <button onClick={handleWelcomeSubmit} disabled={authBusy} className="mt-4 w-full py-3 rounded-full bg-[#D5AA55] text-black font-bold disabled:opacity-50">{authBusy ? 'Connecting…' : (authForm.mode==='login' ? 'Log in' : 'Create account')}</button>
                    <button onClick={()=>{ setAuthForm({...authForm, mode: authForm.mode==='login'?'signup':'login' }); setWelcomeErr('') }} className="mt-3 w-full text-xs text-white/60 hover:text-white">{authForm.mode==='login' ? 'New here? Create account' : 'Have an account? Log in'}</button>
                  </>)}
                </div>
              </div>
            </div>
          )}
          {showCreatePl && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4"><div onClick={()=> setShowCreatePl(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-md glass-strong rounded-[24px] p-6"><h3 className="text-lg font-bold">Create playlist</h3><p className="text-sm text-white/60 mt-1">Give your playlist a name — you can add songs later from Search or Library.</p><input autoFocus value={newPlName} onChange={e=> setNewPlName(e.target.value)} placeholder="My Playlist #1" className="mt-4 w-full h-11 px-4 rounded-full bg-white text-black placeholder:text-black/40 outline-none"/><div className="flex gap-2 mt-4"><button onClick={()=> setShowCreatePl(false)} className="flex-1 py-2.5 rounded-full bg-white/10 border border-white/10 font-semibold">Cancel</button><button onClick={handleCreatePlaylist} className="flex-1 py-2.5 rounded-full bg-white text-black font-bold">Create</button></div></div></div>
          )}
          {showAddToPl && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4"><div onClick={()=> setShowAddToPl(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-md glass-strong rounded-[24px] p-6 max-h-[80vh] flex flex-col"><h3 className="font-bold">Add to playlist</h3><p className="text-sm text-white/60 truncate">"{showAddToPl.title}" • {showAddToPl.artist}</p><div className="mt-4 space-y-2 overflow-y-auto flex-1 pr-1">{playlists.map(pl=> (<button key={pl.id} onClick={()=> handleAddToPlaylist(pl.id, showAddToPl)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 text-left"><CoverImg track={pl} className="w-12 h-12 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{pl.title}</div><div className="text-xs text-white/50">{pl.count}</div></div><PlusIcon/></button>))}<button onClick={()=>{ setShowCreatePl(true); setShowAddToPl(null)}} className="w-full mt-2 py-3 rounded-xl border-2 border-dashed border-white/15 text-sm font-semibold hover:bg-white/5">+ New Playlist</button></div><button onClick={()=> setShowAddToPl(null)} className="mt-4 w-full py-2.5 rounded-full bg-white/10 border border-white/10">Close</button></div></div>
          )}

          {showEQ && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4">
              <div onClick={()=> setShowEQ(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/>
              <div className="relative w-full max-w-md glass-strong rounded-[24px] p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-1"><h3 className="text-xl font-bold font-display">{t('eq')}</h3><button onClick={()=> setShowEQ(false)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10"><CloseIcon/></button></div>
                {!isPro ? (
                  <div className="text-center py-6"><div className="text-4xl mb-2">🎚️</div><p className="text-sm text-white/70">Equalizer is unlocked with <b>MaxMusic Pro</b></p><button onClick={()=>{ setShowEQ(false); setShowSubscribe(true) }} className="mt-4 px-6 py-2.5 rounded-full bg-[#D5AA55] text-black text-sm font-bold">Go Pro ₹79</button></div>
                ) : (<>
                  <div className="flex items-center justify-between py-3"><span className="text-sm font-semibold">Equalizer {eq.on?'ON':'OFF'}</span><button onClick={eqUserToggle} className={`w-12 h-7 rounded-full transition ${eq.on?'bg-emerald-500':'bg-white/15'}`}><span className={`block w-5 h-5 mx-1 rounded-full bg-white transition ${eq.on?'translate-x-5':''}`}/></button></div>
                  <div className="flex flex-wrap gap-2 mb-4">{Object.keys(EQ_PRESETS).map(p=> <button key={p} onClick={()=> eqUserPreset(p)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${eq.preset===p?'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/70'}`}>{p}</button>)}</div>
                  {EQ_FREQS.map((f,i)=> (
                    <div key={f} className="flex items-center gap-3 py-1.5"><span className="w-14 text-xs text-white/60">{f}</span><input type="range" min="-12" max="12" step="1" value={eq.gains[i]||0} onChange={e=> eqUserGain(i, Number(e.target.value))} className="flex-1 accent-[#D5AA55]"/><span className="w-10 text-right text-xs font-bold">{(eq.gains[i]>0?'+':'')}{eq.gains[i]||0}</span></div>
                  ))}
                  <p className="text-[11px] text-white/40 mt-3">Works on streaming + downloads • Sliders apply LIVE • Not on YouTube tracks • Auto-recovers if a stream goes silent</p><button onClick={()=>{ hardResetAudio(); showToast('Audio reset') }} className="mt-2 w-full py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold">Reset audio (no sound?)</button>
                </>)}
              </div>
            </div>
          )}

          {showSubscribe && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4">
              <div onClick={()=> setShowSubscribe(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/>
              <div className="relative w-full max-w-lg glass-strong rounded-[24px] p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold font-display">Choose your plan</h3>
                  <button onClick={()=> setShowSubscribe(false)} className="w-8 h-8 grid place-items-center rounded-full bg-white/10"><CloseIcon/></button>
                </div>
                <div className="grid gap-3">
                  {[
                    { id:'free', name:'Free', price:'₹0', feats:['5 offline downloads','Standard quality 160kbps','Equalizer locked'], cta:'Current plan', active: !isPro },
                    { id:'pro', name:'MaxMusic Pro', price:'₹79/mo', feats:['Unlimited downloads','HD quality 320kbps','Equalizer unlocked','Custom themes and appearance','Priority new features'], cta:'Go Pro ₹79', active: isPro, highlight:true },
                  ].map(p=> (
                    <div key={p.id} className={`p-4 rounded-2xl border-2 ${p.highlight? 'bg-white text-black border-white':'bg-white/5 border-white/10 text-white'} ${p.active? 'ring-2 ring-emerald-400':''}`}>
                      <div className="flex items-center justify-between"><div className="font-bold">{p.name} {p.highlight && <span className="ml-2 text-xs bg-black text-white px-2 py-0.5 rounded-full">POPULAR</span>}</div><div className="font-bold">{p.price}</div></div>
                      <ul className="mt-3 space-y-1 text-sm">
                        {p.feats.map(f=> <li key={f} className="flex gap-2"><span className={p.highlight? 'text-emerald-600':'text-emerald-400'}>✓</span>{f}</li>)}
                      </ul>
                      <button onClick={()=>{ if(p.id==='free' || p.active) setShowSubscribe(false); else setProStep('code') }} className={`mt-4 w-full py-2.5 rounded-full font-bold ${p.highlight? 'bg-black text-white': p.active? 'bg-white/10 text-white border border-white/20':'bg-white text-black'}`}>{p.active? 'Active ✓': p.cta}</button>
                    </div>
                  ))}
                </div>
                {proStep==='code' && !isPro && (
                  <div className="mt-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-sm font-bold">Activation code dalo</div>
                    <p className="text-xs text-white/50 mt-1">₹79 wala Pro code yahan dalo — Pro turant khul jayega.</p>
                    <div className="mt-2 flex flex-col gap-2"><input value={proCode} onChange={e=> setProCode(e.target.value)} placeholder="ENTER CODE" className="w-full h-11 px-4 rounded-2xl bg-white/10 border border-white/10 text-sm outline-none uppercase"/><button onClick={activatePro} className="w-full h-11 rounded-2xl bg-emerald-500 text-black text-sm font-bold">Activate Pro</button></div>
                    {proErr && <div className="text-xs text-red-300 mt-2">{proErr}</div>}
                  </div>
                )}
                <p className="text-xs text-white/40 mt-4 text-center">Pro code nahi hai? ₹79 me lo — unlimited + HD + EQ • Google Play Billing jald aa raha hai</p>
              </div>
            </div>
          )}

          {toast && <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] text-center bg-white text-black px-5 py-2.5 rounded-2xl text-sm font-semibold shadow-xl break-words">{toast}</div>}

          <nav className="lg:hidden fixed bottom-[84px] left-3 right-3 z-30">
            <div className="glass-strong rounded-full px-2 py-2 flex items-center justify-around shadow-xl">
              {[
                { id:'home', label:'Home', icon:HomeIcon },
                { id:'search', label:'Search', icon:SearchIcon },
                { id:'library', label:'Library', icon:LibraryIcon },
                { id:'profile', label:'You', icon:ProfileIcon },
              ].map(item=> (
                <button key={item.id} onClick={()=> setNav(item.id)} className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-full transition ${nav===item.id? 'bg-white text-black':'text-white/60'}`}><item.icon active={nav===item.id} size={20}/><span className="text-[11px] font-semibold">{t('navb_'+item.id)}</span></button>
              ))}
            </div>
          </nav>
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

function ProfileView({ npEngine, user, setUser, editUser, setEditUser, liked, playlists, localSongs, downloaded, showToast, authUser, onSignIn, onSignOut, onDeleteAccount, x }){
  const X = x||{}
  const t = X.t || ((k)=>k)
  const [tab, setTab] = useState("Overview")
  // Hidden diagnostics: 5 rapid taps on the avatar (or the version footer below)
  // toggles the debug card + backend banner. Default OFF so shared installs look clean.
  const [showDiag, setShowDiag] = useState(false)
  const [showDelAcc, setShowDelAcc] = useState(false)
  const diagTap = useRef({ n:0, t:0 })
  const pokeDiag = ()=>{ const d = diagTap.current, now = Date.now(); d.n = (now - d.t < 2000) ? d.n+1 : 1; d.t = now; if(d.n >= 5){ d.n = 0; setShowDiag(v=>!v); showToast(showDiag ? 'Diagnostics hidden' : 'Diagnostics ON — band karne ke liye dobara 5 tap') } }
  const minsStr = (()=>{ try{ const m = Math.floor(((X.stats&&X.stats.secs)||0)/60); return m.toLocaleString('en-IN') }catch{ return '0' } })()
  const topLang = (()=>{ try{ const L=(X.stats&&X.stats.langs)||{}; const ks=Object.keys(L); if(!ks.length) return '—'; ks.sort((a,b)=>L[b]-L[a]); const m={hindi:'Hindi',punjabi:'Punjabi',english:'English',tamil:'Tamil',telugu:'Telugu',bengali:'Bengali',marathi:'Marathi',gujarati:'Gujarati',malayalam:'Malayalam',kannada:'Kannada',urdu:'Urdu'}; return m[ks[0]]||ks[0] }catch{ return '—' } })()
  const isEditing = !!editUser
  const startEdit = ()=> setEditUser({...user})
  const saveEdit = ()=>{ const u = {...editUser, _edited:1}; if(!u.avatar) u.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name||'MaxMusic')}&radius=50`; setUser(u); setEditUser(null); showToast("Profile updated ✓") }
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="relative rounded-[32px] overflow-hidden glass p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#6A418E]/30 via-[#A154D6]/20 to-[#C35445]/20"/>
        <div className="relative flex flex-col md:flex-row gap-6">
          <div className="relative shrink-0">
            <span onClick={pokeDiag} className="block"><Avatar src={user.avatar} name={user.name} className="w-28 h-28 rounded-[24px] object-cover border-4 border-white/10 shadow-xl"/></span>
            <button onClick={startEdit} className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white text-black grid place-items-center shadow-lg border"><PlusIcon/></button>
          </div>
          <div className="flex-1 min-w-0">
            {!isEditing ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h1 className="text-2xl font-bold font-display">{user.name}</h1><p className="text-sm text-white/60">{user.email} • <span className="text-[#D5AA55] font-semibold">{user.plan} Plan</span></p><p className="text-sm text-white/70 mt-2 leading-relaxed max-w-xl">{user.bio}</p></div>
                  <button onClick={startEdit} className="px-5 py-2 rounded-full bg-white text-black text-sm font-bold">{t('editp')}</button>
                </div>
                <div className="flex gap-6 mt-5">
                  <div><div className="text-xl font-bold">{X.followedCount||0}</div><div className="text-xs text-white/50">{t('following')}</div></div>
                  <div><div className="text-xl font-bold">{playlists.length}</div><div className="text-xs text-white/50">{t('playlists')}</div></div>
                  <div><div className="text-xl font-bold">{downloaded.length}</div><div className="text-xs text-white/50">{t('downloads')}</div></div>
                  <div><div className="text-xl font-bold">{liked.size}</div><div className="text-xs text-white/50">{t('liked')}</div></div>
                </div>
                {!X.isPro && <div className="mt-4 max-w-md"><button onClick={X.onSubscribe} className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#D5AA55] to-[#C35445] text-black text-sm font-bold">★ {t('goPro')} — unlimited downloads + HD + Equalizer</button></div>}
                {showDiag && <NpDiagCard toast={showToast} engine={npEngine}/>}
                {/* itrace-26: top cloud-sync card removed — Settings > Cloud sync is the single place */}
              </>
            ) : (
              <div className="space-y-3">
                <h3 className="font-bold">Edit Profile</h3>
                <input value={editUser.name} onChange={e=> setEditUser({...editUser, name:e.target.value})} placeholder="Name" className="w-full h-10 rounded-full px-4 bg-white text-black outline-none"/>
                <input value={editUser.email} onChange={e=> setEditUser({...editUser, email:e.target.value})} placeholder="Email" className="w-full h-10 rounded-full px-4 bg-white text-black outline-none"/>
                <input value={editUser.avatar} onChange={e=> setEditUser({...editUser, avatar:e.target.value})} placeholder="Avatar URL (ya upload karo)" className="w-full h-10 rounded-full px-4 bg-white/10 border border-white/10 text-white outline-none"/>
                <div className="flex gap-2">
                  <label className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-center text-sm font-semibold cursor-pointer hover:bg-white/15"><input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ const img=new Image(); img.onload=()=>{ try{ const S=256, cv=document.createElement('canvas'); cv.width=S; cv.height=S; const cx=cv.getContext('2d'); const m=Math.min(img.width,img.height); cx.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S); setEditUser({...editUser, avatar: cv.toDataURL('image/jpeg',0.82)}) }catch{ setEditUser({...editUser, avatar: String(rd.result)}) } }; img.onerror=()=> setEditUser({...editUser, avatar: String(rd.result)}); img.src=String(rd.result) }; rd.readAsDataURL(f) }}/>⬆ Upload photo</label>
                  <button type="button" onClick={()=> setEditUser({...editUser, avatar: '' })} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-sm font-semibold">✖ Remove</button>
                </div>
                <textarea value={editUser.bio} onChange={e=> setEditUser({...editUser, bio:e.target.value})} placeholder="Bio" rows={2} className="w-full rounded-2xl p-3 bg-white/10 border border-white/10 outline-none resize-none"/>
                <div className="flex gap-2"><button onClick={()=> setEditUser(null)} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 font-semibold">{t('cancel')}</button><button onClick={saveEdit} className="flex-1 py-2 rounded-full bg-white text-black font-bold">{t('save')}</button></div>
              </div>
            )}
          </div>
        </div>
        <div className="relative mt-6 flex gap-2 overflow-x-auto scrollbar-none">
          {["Overview","Playlists","Listening","Settings"].map(t=> (
            <button key={t} onClick={()=> setTab(t)} className={`px-4 py-1.5 rounded-full text-sm font-medium border shrink-0 ${tab===t? 'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/70'}`}>{X.t? X.t('tab_'+t) : t}</button>
          ))}
        </div>
      </div>

      {tab==="Overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass rounded-[24px] p-5">
            <h3 className="font-bold mb-3">{t('listeningstats')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-white/60">{t('minutes')}</span><span className="font-bold">{minsStr}</span></div>
              <div className="flex justify-between"><span className="text-white/60">{t('songsplayed')}</span><span className="font-bold">{(X.stats&&X.stats.plays)||0}</span></div>
              <div className="flex justify-between"><span className="text-white/60">{t('topgenre')}</span><span className="font-bold">{topLang}</span></div>
              <div className="flex justify-between"><span className="text-white/60">{t('likedsongs')}</span><span className="font-bold">{liked.size}</span></div>
              <div className="flex justify-between"><span className="text-white/60">{t('offlinesongs')}</span><span className="font-bold">{downloaded.length}</span></div>
              <div className="flex justify-between"><span className="text-white/60">{t('localfiles')}</span><span className="font-bold">{localSongs.length}</span></div>
            </div>
            {showDiag && <div className="mt-4 p-3 rounded-2xl bg-white text-black text-sm"><span className="font-bold">Backend Live:</span> localStorage + IndexedDB + iTunes/Saavn APIs</div>}
          </div>
          <div className="glass rounded-[24px] p-5">
            <h3 className="font-bold mb-3">{t('recentpl')}</h3>
            <div className="space-y-2">
              {playlists.slice(0,3).map(pl=> (
                <div key={pl.id} onClick={()=> X.onOpenPlaylist && X.onOpenPlaylist(pl.id)} className="flex gap-3 items-center p-2 rounded-xl hover:bg-white/5 cursor-pointer"><CoverImg track={pl} className="w-12 h-12 rounded-lg object-cover"/><div><div className="text-sm font-semibold">{pl.title}</div><div className="text-xs text-white/50">{pl.count}</div></div></div>
              ))}
              {playlists.length===0 && <div className="text-sm text-white/50">{t('nopl')}</div>}
            </div>
            <button onClick={X.onShareProfile} className="mt-4 w-full py-2 rounded-full bg-white text-black text-sm font-bold">{t('share')}</button>
          </div>
        </div>
      )}
      {tab==="Settings" && (
        <div className="glass rounded-[24px] p-5 space-y-1">
          <h3 className="font-bold pb-2">{t('settings')}</h3>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('pro')}</div><div className="text-xs text-white/50">{X.isPro?'Active ✓ — unlimited + HD + EQ':'Free — 5 downloads • HD + EQ locked'}</div></div>{X.isPro? <span className="text-xs text-emerald-400 font-bold">PRO ✓</span> : <button onClick={X.onSubscribe} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#D5AA55] text-black">{t('goPro')}</button>}</div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('quality')}</div><div className="text-xs text-white/50">{X.quality==='hd'?'HD 320kbps':X.quality==='eco'?'Eco 96kbps':'Standard 160kbps'} • from next song</div></div><button onClick={X.qCycle} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">{X.quality==='hd'?'HD 320':X.quality==='eco'?'Eco 96':'Std 160'}</button></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('eq')}</div><div className="text-xs text-white/50">{X.eqOn?('ON • '+(X.eqPreset||'')):'5-band • streaming songs'}</div></div><button onClick={X.onOpenEQ} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">{X.isPro?'Open':'🔒 Pro'}</button></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('autoplay')}</div><div className="text-xs text-white/50">Related songs after queue ends</div></div><button onClick={()=> X.setAutoplay(!X.autoplay)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${X.autoplay?'bg-emerald-500 text-black border-emerald-500':'bg-white/10 border-white/10'}`}>{X.autoplay?t('on'):t('off')}</button></div>
          <div className="py-3 border-b border-white/5"><div className="text-sm font-medium">{t('muslang')}</div><div className="text-xs text-white/50 mb-2">Shapes your Home mix</div><div className="flex gap-2">{['hindi','punjabi','english'].map(L=> <button key={L} onClick={()=> X.toggleLang(L)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${(X.langs||[]).includes(L)?'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/60'}`}>{L[0].toUpperCase()+L.slice(1)}</button>)}</div></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('applang')}</div><div className="text-xs text-white/50">Interface language</div></div><div className="flex gap-2">{[['en','English'],['hi','हिंदी']].map(([v,l])=> <button key={v} onClick={()=> X.setLang(v)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${X.lang===v?'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/60'}`}>{l}</button>)}</div></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('sleep')}</div><div className="text-xs text-white/50">{X.sleepMin?`Stops after ${X.sleepMin} min`:'Music keeps playing'}</div></div><button onClick={X.cycleSleep} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">{X.sleepMin?X.sleepMin+'m':t('off')}</button></div>
          <div className="py-3 border-b border-white/5">
            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">Appearance</div><div className="text-xs text-white/50">Choose a look for the app</div></div><span className="text-[10px] font-extrabold tracking-widest text-white/35 uppercase">Themes</span></div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {(X.themes||[]).filter(th=> !th.pro).map(th=> (
                <button key={th.id} onClick={()=> X.onSelectTheme && X.onSelectTheme(th)} className={`p-3 rounded-2xl border text-left transition ${X.themeId===th.id?'bg-white text-black border-white':'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                  <span className="flex -space-x-1 mb-2">{th.swatch.map(c=> <span key={c} className="w-5 h-5 rounded-full border border-black/20" style={{ background:c }}/>)}</span>
                  <span className="block text-xs font-extrabold">{th.mode==='light'?'☀ ':'☾ '}{th.name}</span><span className={`block text-[10px] mt-0.5 ${X.themeId===th.id?'text-black/55':'text-white/40'}`}>{th.tagline}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 mb-2"><div className="text-xs font-extrabold tracking-widest text-white/40 uppercase">Custom themes</div>{!X.isPro && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#D5AA55] text-black">PRO</span>}</div>
            <div className="grid grid-cols-3 gap-2">
              {(X.themes||[]).filter(th=> th.pro).map(th=> (
                <button key={th.id} onClick={()=> X.onSelectTheme && X.onSelectTheme(th)} className={`p-3 rounded-2xl border text-left transition relative overflow-hidden ${X.themeId===th.id?'bg-white text-black border-white':'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background:`linear-gradient(90deg, ${th.accent}, ${th.accent2})` }}/>
                  <span className="flex -space-x-1 mb-2 mt-1">{th.swatch.map(c=> <span key={c} className="w-5 h-5 rounded-full border border-black/20" style={{ background:c }}/>)}</span>
                  <span className="block text-[11px] font-extrabold leading-tight">{th.name}</span><span className={`block text-[10px] mt-1 ${X.themeId===th.id?'text-black/55':'text-white/40'}`}>{X.isPro ? th.tagline : 'Pro only'}</span>
                  {!X.isPro && <span className="absolute top-2 right-2 text-[11px]">🔒</span>}
                  {X.themeId===th.id && <span className="absolute top-2 right-2 text-[11px] font-black">✓</span>}
                </button>
              ))}
            </div>
            {!X.isPro && <button onClick={X.onSubscribe} className="mt-3 w-full py-2.5 rounded-full bg-gradient-to-r from-[#D5AA55] to-[#C35445] text-black text-xs font-extrabold">Unlock custom themes with Pro</button>}
          </div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">App updates</div><div className="text-xs text-white/50">v{(X.updCur&&X.updCur.version)||'?'} • build {(X.updCur&&X.updCur.build)||'—'}{X.updInfo&&X.updInfo.hasUpdate?' • Update available':''}</div></div><button onClick={()=> X.onCheckUpdate && X.onCheckUpdate()} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">{X.updChecking?'Checking…':'Check'}</button></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('onlinemusic')}</div><div className="text-xs text-white/50">JioSaavn + YouTube — full length</div></div><span className="text-xs text-emerald-400">●</span></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('offlinemode')}</div><div className="text-xs text-white/50">{downloaded.length>0? `${downloaded.length} songs saved offline`:'No downloads yet'}</div></div><span className="text-xs text-emerald-400">●</span></div>
          <div className="flex items-center justify-between py-3 border-b border-white/5"><div><div className="text-sm font-medium">{t('cloudsync')}</div><div className="text-xs text-white/50">{authUser? `ON — ${authUser.email}`:'Off — sign in to sync'}</div></div>{authUser? <button onClick={onSignOut} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">{t('signout')}</button> : <button onClick={onSignIn} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#D5AA55] text-black">{t('signin')}</button>}</div>
          <div className="flex gap-2 pt-2"><button onClick={X.onClearHistory} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold">{t('clearhist')}</button><button onClick={X.onClearSearches} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold">{t('clearsearch')}</button></div>
          {authUser && <button onClick={()=> setShowDelAcc(true)} className="w-full mt-3 py-3 rounded-full bg-[#C35445]/15 text-[#C35445] border border-[#C35445]/30 text-sm font-bold">Delete Account</button>}
          {authUser && showDelAcc && (<div className="fixed inset-0 z-[80] grid place-items-center p-4"><div onClick={()=> setShowDelAcc(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-sm glass-strong rounded-[24px] p-6 text-center"><div className="text-4xl mb-2">⚠️</div><h3 className="font-bold text-lg">Delete your account?</h3><p className="text-sm text-white/60 mt-1">Likes + playlists cloud se delete ho jayenge. Ye undo nahi hoga.</p><div className="flex gap-2 mt-5"><button onClick={()=> setShowDelAcc(false)} className="flex-1 py-2.5 rounded-full bg-white/10 border border-white/10 font-bold">No, keep it</button><button onClick={()=>{ setShowDelAcc(false); onDeleteAccount() }} className="flex-1 py-2.5 rounded-full bg-[#C35445] text-white font-bold">Yes, delete</button></div></div></div>)}
          <button onClick={()=>{ localStorage.clear(); indexedDB.deleteDatabase('sur_sangam_db'); showToast("Data cleared — refresh"); setTimeout(()=> location.reload(),800)}} className="w-full mt-3 py-3 rounded-full bg-[#C35445] text-white text-sm font-bold">{t('clearall')}</button>
        </div>
      )}
      {tab==="Playlists" && (
        <div className="glass rounded-[24px] p-5">
          <div className="flex items-center justify-between mb-3"><h3 className="font-bold">Playlists • {playlists.length}</h3><button onClick={()=> X.onCreatePlaylist && X.onCreatePlaylist()} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-black">+ New</button></div>
          {playlists.length===0 ? <div className="text-sm text-white/50 text-center py-6">No playlists yet — create your first!</div> : (
            <div className="space-y-2">
              {playlists.map(pl=> (
                <div key={pl.id} className="flex gap-3 items-center p-2 rounded-xl hover:bg-white/5">
                  <button onClick={()=> X.onOpenPlaylist && X.onOpenPlaylist(pl.id)} className="flex gap-3 items-center flex-1 min-w-0 text-left"><CoverImg track={pl} className="w-12 h-12 rounded-lg object-cover shrink-0"/><div className="min-w-0"><div className="text-sm font-semibold truncate">{pl.title}</div><div className="text-xs text-white/50">{pl.count || `${(pl.tracks||pl.songs||[]).length} songs`}</div></div></button>
                  <button onClick={()=> X.onPlayPlaylist && X.onPlayPlaylist(pl)} className="w-9 h-9 rounded-full bg-white text-black grid place-items-center shrink-0"><PlayMini/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab==="Listening" && (
        <div className="space-y-4">
          <div className="glass rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold">Recently played • {(X.recently||[]).length}</h3>{(X.recently||[]).length>0 && <button onClick={()=> X.onPlayAllRecent && X.onPlayAllRecent()} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white text-black">Play all</button>}</div>
            {(X.recently||[]).length===0 ? <div className="text-sm text-white/50 text-center py-6">Play any song — it will appear here</div> : (
              <div className="space-y-1 max-h-[360px] overflow-y-auto">
                {(X.recently||[]).slice(0,20).map((t,i)=> (
                  <button key={String(t.id)+i} onClick={()=> X.onPlayTrack && X.onPlayTrack(t, X.recently)} className="w-full flex gap-3 items-center p-2 rounded-xl hover:bg-white/5 text-left">
                    <span className="w-6 text-center text-xs text-white/30 shrink-0">{String(i+1).padStart(2,'0')}</span>
                    <CoverImg track={t} className="w-10 h-10 rounded-lg object-cover shrink-0"/>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div>
                    <span className="text-xs text-white/40 shrink-0">{t.durationLabel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="glass rounded-[24px] p-5">
            <h3 className="font-bold mb-3">Artists you follow • {(X.followedList||[]).length}</h3>
            {(X.followedList||[]).length===0 ? <div className="text-sm text-white/50">No followed artists yet — tap + Follow on any artist</div> : (
              <div className="flex flex-wrap gap-2">{(X.followedList||[]).map(n=> <span key={n} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">✓ {n}</span>)}</div>
            )}
          </div>
        </div>
      )}
      <div onClick={pokeDiag} className="pt-1 text-center text-[11px] text-white/35 select-none">© 2026 MaxMusic • {t('version')} {APP_VERSION}</div>
    </div>
  )
}

/* Icons */
function HomeIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth={active?0:1.8}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
// Track artwork with a real fallback chain (itrace-29): canonical same-video
// YouTube thumbnail / normalized Saavn CDN URL first, the track's own cover
// next, and a neutral LOCAL placeholder last. A dead URL can never surface as
// a broken-image glyph again, and no other song's art is ever substituted.
function CoverImg({ track, src, videoId, className, style }){
  const t = track || { cover: src, videoId }
  const list = coverCandidates(t)
  const sig = list.join('\n')
  const [idx, setIdx] = useState(0)
  useEffect(()=>{ setIdx(0) },[sig])
  const cur = list[Math.min(idx, list.length-1)] || list[list.length-1]
  return <img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={cur} alt="" className={className} style={style} onError={()=>{
    try{ const h = String(cur||'').replace(/^https?:\/\//,'').split('/')[0]; if(h) window.__artFail = h }catch{}
    setIdx(i=> Math.min(i+1, list.length-1))
  }}/>
}
// Artist portrait: ONLY a genuine provider artist/profile image. Anything
// else (no metadata, dead URL) falls back to neutral initials — never a
// song/album cover, stock photo, or another person's face.
function ArtistAvatar({ name, src, className, style }){
  const [bad, setBad] = useState(false)
  useEffect(()=>{ setBad(false) },[src])
  const initials = String(name||'?').trim().split(/\s+/).slice(0,2).map(w=> w[0]||'').join('').toUpperCase() || '?'
  if(!src || bad) return <div className={`${className||''} grid place-items-center bg-[#2A1E2A] text-[#D5AA55] font-bold select-none`} style={style}>{initials}</div>
  return <img loading="lazy" decoding="async" src={src} alt="" className={className} style={style} onError={()=> setBad(true)}/>
}
function Avatar({ src, name, className, style }){
  const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' rx='20' fill='#2A1E2A'/><text x='48' y='64' font-size='42' font-family='system-ui,sans-serif' font-weight='700' fill='#D5AA55' text-anchor='middle'>${((String(name||'').trim()[0])||'S').toUpperCase()}</text></svg>`)}`
  return <img loading="lazy" decoding="async" src={src || fallback} alt="" className={className} style={style} onError={e=>{ e.currentTarget.onerror=null; e.currentTarget.src = fallback }}/>
}

function SearchIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.8}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> }
function LibraryIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.8}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function ProfileIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2:1.7}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function PlayIcon({ dark, large }){ const s=large?28:20; return <svg width={s} height={s} viewBox="0 0 24 24" fill={dark?"black":"white"}><path d="M8 5.14v14l11-7z"/></svg> }
function PauseIcon({ dark, large }){ const s=large?28:20; return <svg width={s} height={s} viewBox="0 0 24 24" fill={dark?"black":"white"}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> }
function PlayMini({ dark, size=16 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={dark?"white":"black"}><path d="M8 5.14v14l11-7z"/></svg> }
function PauseMini({ dark, size=16 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={dark?"white":"black"}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> }
function PrevIcon({ large }){ const s=large?24:18; return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6z"/></svg> }
function NextIcon({ large }){ const s=large?24:18; return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M13 6v12l8.5-6zM11 6v12l-8.5-6z" /></svg> }
function ChevronLeft(){ return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg> }
function ChevronRight(){ return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg> }
function ChevronDown(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg> }
function ChevronDownLarge(){ return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg> }
function CloseIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg> }
function BellIcon(){ return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7-6 5-6 5s-6 2-6-5"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg> }
function PlusIcon(){ return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg> }
function Heart({ filled, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled?"currentColor":"none"} stroke="currentColor" strokeWidth="1.7"><path d="M19.5 5.5a5.2 5.2 0 0 0-7.4 0L12 5.6l-.1-.1a5.2 5.2 0 0 0-7.4 7.4l7.4 7.4 7.4-7.4a5.2 5.2 0 0 0 .2-7.4z"/></svg> }
function ShuffleIcon({ active }){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.7}><polyline points="16 3 21 3 21 8"/><line x1="4" x2="21" y1="14" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" x2="21" y1="21" y2="16"/><line x1="4" x2="9" y1="10" y2="10"/></svg> }
function RepeatIcon({ mode }){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={mode?2.2:1.7}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>{mode===2 && <text x="11" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="800">1</text>}</svg> }
function VolumeIcon({ muted, volume }){ if(muted||volume===0) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="1" y1="9" y2="23"/></svg>; return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> }
function QueueIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M21 12h-4"/><path d="M21 6h-4"/><path d="M21 18h-4"/></svg> }
function MicIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" x2="12" y1="19" y2="22"/></svg> }
function ExpandIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg> }
function MoreIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> }
function ShareIcon(){ return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" x2="15.4" y1="13.5" y2="17.5"/><line x1="15.7" x2="8.3" y1="6.5" y2="10.5"/></svg> }
function DownloadIcon({ size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> }
function Equalizer({ dark }){ return <span className="flex items-end gap-[2px] h-3"><span className={`w-[3px] rounded-full animate-[eq_0.6s_ease-in-out_infinite] ${dark? 'bg-black':'bg-emerald-400'}`} style={{ height:'10px'}}/><span className={`w-[3px] rounded-full animate-[eq_0.7s_ease-in-out_infinite_0.15s] ${dark? 'bg-black':'bg-emerald-400'}`} style={{ height:'14px'}}/><span className={`w-[3px] rounded-full animate-[eq_0.5s_ease-in-out_infinite_0.3s] ${dark? 'bg-black':'bg-emerald-400'}`} style={{ height:'8px'}}/><style>{`@keyframes eq{0%,100%{height:6px}50%{height:14px}}`}</style></span> }
