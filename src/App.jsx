import { useEffect, useRef, useState, useMemo } from 'react'
import { unifiedSearch, unifiedSearchPaginated, searchPiped, getRelatedTracks, trendingByCategory, artistSongs, artistSongsPaginated, resolvePipedAudio, searchSaavn, apiSignup, apiDeleteAccount, apiLogin, apiMe, apiLogout, isAuthEnabled, getAuthToken, apiPushLikes, apiPullLikes, apiPushPlaylists, apiPullPlaylists } from './lib/api.js'
import { saveDownload, getDownloads, deleteDownload } from './lib/db.js'

const BASE = import.meta.env.BASE_URL || '/'

const fallbackTracks = [
  { id: 1, title: "Kesariya", artist: "Arijit Singh, Pritam", album: "Brahmāstra", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone1.wav", durationLabel: "4:28", color: "#C35445", plays: "412M" },
  { id: 2, title: "Chaleya", artist: "Arijit Singh, Shilpa Rao", album: "Jawan", cover: "https://images.unsplash.com/photo-1500099817043-86d46000d58f?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone2.wav", durationLabel: "3:21", color: "#6A418E", plays: "298M" },
  { id: 3, title: "Heeriye", artist: "Jasleen Royal, Arijit Singh", album: "Heeriye • Single", cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone3.wav", durationLabel: "3:19", color: "#A154D6", plays: "567M" },
  { id: 4, title: "Tum Hi Ho", artist: "Arijit Singh", album: "Aashiqui 2", cover: "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone4.wav", durationLabel: "4:21", color: "#543551", plays: "1.2B" },
  { id: 5, title: "Raataan Lambiyan", artist: "Jubin Nautiyal, Asees Kaur", album: "Shershaah", cover: "https://images.unsplash.com/photo-1506152983158-b4a74a01c721?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone5.wav", durationLabel: "3:50", color: "#572223", plays: "890M" },
  { id: 6, title: "With You", artist: "AP Dhillon", album: "With You • Single", cover: "https://images.unsplash.com/photo-1471478331149-c72f17e33c73?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone1.wav", durationLabel: "2:59", color: "#D5AA55", plays: "341M" },
  { id: 7, title: "295", artist: "Sidhu Moose Wala", album: "Moosetape", cover: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone2.wav", durationLabel: "4:32", color: "#0f0f0f", plays: "512M" },
  { id: 8, title: "Calm Down", artist: "Rema, Selena Gomez", album: "Rave & Roses", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone3.wav", durationLabel: "3:59", color: "#C35445", plays: "1.8B" },
  { id: 9, title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone4.wav", durationLabel: "3:20", color: "#A154D6", plays: "3.2B" },
  { id: 10, title: "As It Was", artist: "Harry Styles", album: "Harry's House", cover: "https://images.unsplash.com/photo-1506152983158-b4a74a01c721?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone5.wav", durationLabel: "2:47", color: "#E9CDC2", plays: "2.1B" },
  { id: 11, title: "Pasoori", artist: "Ali Sethi, Shae Gill", album: "Coke Studio", cover: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone1.wav", durationLabel: "4:01", color: "#543551", plays: "672M" },
  { id: 12, title: "Manike", artist: "Yohani, Jubin Nautiyal", album: "Thank God", cover: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone2.wav", durationLabel: "3:26", color: "#572223", plays: "420M" },
  { id: 13, title: "Srivalli", artist: "Sid Sriram", album: "Pushpa", cover: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone3.wav", durationLabel: "3:41", color: "#D5AA55", plays: "380M" },
  { id: 14, title: "Baarishein", artist: "Anuv Jain", album: "Baarishein • Single", cover: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2c4?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone4.wav", durationLabel: "3:28", color: "#6A418E", plays: "156M" },
  { id: 15, title: "Brown Munde", artist: "AP Dhillon, Gurinder Gill", album: "Brown Munde • Single", cover: "https://images.unsplash.com/photo-1499364615650-ec38552f4f34?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone5.wav", durationLabel: "3:20", color: "#C35445", plays: "487M" },
  { id: 16, title: "Arabic Kuthu", artist: "Anirudh Ravichander", album: "Beast", cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=60", audio: BASE + "audio/tone1.wav", durationLabel: "4:38", color: "#A154D6", plays: "290M" },
]

const defaultPlaylists = []

// v2: ek baar purane demo likes/playlists clear — defaults ab khali (user demand)
try{ if(localStorage.getItem('sur_ver')!=='v2'){ ['sur_liked','sur_liked_map','sur_playlists','sur_recent'].forEach(k=> localStorage.removeItem(k)); localStorage.setItem('sur_ver','v2') } }catch{}

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
  { name:"Sidhu Moose Wala", img:"https://api.dicebear.com/7.x/initials/svg?seed=Sidhu%20Moose%20Wala&backgroundColor=C35445,6A418E&radius=50", cat:"Punjabi", plays:"1.6B" },
  { name:"AP Dhillon", img:"https://api.dicebear.com/7.x/initials/svg?seed=AP%20Dhillon&backgroundColor=6A418E,A154D6&radius=50", cat:"Punjabi", plays:"890M" },
  { name:"Diljit Dosanjh", img:"https://api.dicebear.com/7.x/initials/svg?seed=Diljit%20Dosanjh&backgroundColor=A154D6,543551&radius=50", cat:"Punjabi", plays:"1.2B" },
  { name:"Mankirt Aulakh", img:"https://api.dicebear.com/7.x/initials/svg?seed=Mankirt%20Aulakh&backgroundColor=543551,572223&radius=50", cat:"Punjabi", plays:"620M" },
  { name:"Karan Aujla", img:"https://api.dicebear.com/7.x/initials/svg?seed=Karan%20Aujla&backgroundColor=D5AA55,C35445&radius=50", cat:"Punjabi", plays:"780M" },
  { name:"Shubh", img:"https://api.dicebear.com/7.x/initials/svg?seed=Shubh&backgroundColor=572223,060306&radius=50", cat:"Punjabi", plays:"740M" },
  { name:"Arijit Singh", img:"https://api.dicebear.com/7.x/initials/svg?seed=Arijit%20Singh&backgroundColor=C35445,6A418E&radius=50", cat:"Hindi", plays:"2.4B" },
  { name:"Shreya Ghoshal", img:"https://api.dicebear.com/7.x/initials/svg?seed=Shreya%20Ghoshal&backgroundColor=6A418E,E9CDC2&radius=50", cat:"Hindi", plays:"1.1B" },
  { name:"Jubin Nautiyal", img:"https://api.dicebear.com/7.x/initials/svg?seed=Jubin%20Nautiyal&backgroundColor=572223,D5AA55&radius=50", cat:"Hindi", plays:"980M" },
  { name:"Pritam", img:"https://api.dicebear.com/7.x/initials/svg?seed=Pritam&backgroundColor=543551,6A418E&radius=50", cat:"Bollywood", plays:"1.4B" },
  { name:"Anuv Jain", img:"https://api.dicebear.com/7.x/initials/svg?seed=Anuv%20Jain&backgroundColor=A154D6,543551&radius=50", cat:"Indie", plays:"340M" },
  { name:"Kumar Sanu", img:"https://api.dicebear.com/7.x/initials/svg?seed=Kumar%20Sanu&backgroundColor=E9CDC2,A154D6&radius=50", cat:"90s", plays:"890M" },
  { name:"Alka Yagnik", img:"https://api.dicebear.com/7.x/initials/svg?seed=Alka%20Yagnik&backgroundColor=D5AA55,572223&radius=50", cat:"90s", plays:"760M" },
  { name:"The Weeknd", img:"https://api.dicebear.com/7.x/initials/svg?seed=The%20Weeknd&backgroundColor=060306,D5AA55&radius=50", cat:"Trending", plays:"4.2B" },
]

function getFilteredArtists(cat){
  if(cat==="All") return allArtists
  if(cat==="Punjabi") return allArtists.filter(a=> a.cat==="Punjabi")
  if(cat==="Hindi") return allArtists.filter(a=> a.cat==="Hindi"||a.cat==="Bollywood")
  if(cat==="Bollywood") return allArtists.filter(a=> a.cat==="Bollywood"||a.cat==="Hindi")
  if(cat==="Love") return allArtists.filter(a=> ["Hindi","Bollywood"].includes(a.cat))
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
  const [nav, setNav] = useState("home") // home, search, library, profile
  const [libTab, setLibTab] = useState("Playlists") // Playlists, Songs, Liked, Local, Downloads
  const [showFull, setShowFull] = useState(false)
  const touchRef = useRef(null)
  const wakeLockRef = useRef(null)
  const [showQueue, setShowQueue] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)
  const [showCreatePl, setShowCreatePl] = useState(false)
  const [newPlName, setNewPlName] = useState("")
  const [showAddToPl, setShowAddToPl] = useState(null) // track id
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [toast, setToast] = useState(null)
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [recentlyPlayed, setRecentlyPlayed] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('sur_recent')||'[]') }catch{ return [] } })
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [homeTracks, setHomeTracks] = useState([])
  const [homeErr, setHomeErr] = useState(false)
  const [homeLoading, setHomeLoading] = useState(true)
  const [homeNextPage, setHomeNextPage] = useState(null)
  const [homeLoadingMore, setHomeLoadingMore] = useState(false)
  const homeSentinelRef = useRef(null)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [artistTracks, setArtistTracks] = useState([])
  const [artistNextPage, setArtistNextPage] = useState(null)
  const [artistLoadingMore, setArtistLoadingMore] = useState(false)
  const artistSentinelRef = useRef(null)
  const [searchPage, setSearchPage] = useState(1)
  const [searchNextPage, setSearchNextPage] = useState(null)
  const searchSentinelRef = useRef(null)

  // user
  const [user, setUser] = useState(()=>{
    try{ const v=JSON.parse(localStorage.getItem('sur_user')||'null'); return v||{ name:"Amit Valmiki", email:"amit@sur-sangam.app", avatar:"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=60", plan:"Free", followers: 342, following: 89, bio:"Music lover • Jaipur • Arijit & Sidhu fan" } }catch{ return { name:"Amit Valmiki", email:"amit@sur-sangam.app", avatar:"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=60", plan:"Free", followers:342, following:89, bio:"Music lover • Jaipur • Arijit & Sidhu fan" }}
  })
  const [editUser, setEditUser] = useState(null)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const ytReadyRef = useRef(false)
  const [ytReady, setYtReady] = useState(false)
  const ytProgressRef = useRef(null)
  const current = queue[currentIndex] || null

  // persist
  useEffect(()=>{ localStorage.setItem('sur_liked', JSON.stringify([...liked])) },[liked])
  // cloud account state (Sur Sangam backend)
  const [authUser, setAuthUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authForm, setAuthForm] = useState({ mode:'login', name:'', email:'', password:'' })
  const [authBusy, setAuthBusy] = useState(false)
  const likedMetaRef = useRef((()=>{ try{ return JSON.parse(localStorage.getItem('sur_liked_map')||'{}') }catch{ return {} } })())
  const likeSyncTimer = useRef(null)
  const plSyncTimer = useRef(null)
  const plFirstRun = useRef(true)
  useEffect(()=>{ localStorage.setItem('sur_playlists', JSON.stringify(playlists)) },[playlists])
  useEffect(()=>{ localStorage.setItem('sur_user', JSON.stringify(user)) },[user])
  // restore cloud session on load
  useEffect(()=>{ (async()=>{
    if(!isAuthEnabled() || !getAuthToken()) return
    const me = await apiMe()
    if(me){ setAuthUser(me); setUser(prev=> ({ ...prev, name: me.name||prev.name, email: me.email||prev.email, avatar: me.avatar||prev.avatar, plan: me.plan||prev.plan })) }
  })() },[])
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
  useEffect(()=>{ localStorage.setItem('sur_recent', JSON.stringify(recentlyPlayed.slice(0,30))) },[recentlyPlayed])
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
    let cancelled=false
    setHomeTracks([])
    setHomeLoading(true)
    setHomeNextPage(null)
    const qcat = activeCat==="All"? 'Trending' : activeCat
    trendingByCategory(qcat, 24).then(t=>{
      if(cancelled) return
      if(t && t.length){
        setHomeTracks(t)
        const qmap = {
          Punjabi: "Punjabi songs Sidhu Moose Wala AP Dhillon official audio",
          Hindi: "Hindi songs Arijit Singh official audio 2024",
          Love: "Hindi love songs romantic official audio",
          "90s": "90s Hindi songs Kumar Sanu official audio",
          Bollywood: "Bollywood songs Pritam Arijit official audio",
          Indie: "Indie songs Anuv Jain official audio",
          Trending: "Trending Hindi Punjabi songs official audio",
          New: "New Hindi Punjabi songs official audio",
          All: "Hindi Punjabi songs official audio trending"
        }
        const q = qmap[qcat] || qcat
        searchPiped(q, 24).then(res=>{
          if(!cancelled && res.nextpage) setHomeNextPage(res.nextpage)
        }).catch(()=>{})
        setRecentlyPlayed(prev=>{
          const filtered = prev.filter(x=>{
            const low=(x.title||"").toLowerCase()
            return !(low.includes("street fried")||low.includes("cooking")||low.includes("gta 5")||low.includes("china street")||low.includes("chain together"))
          })
          if(filtered.length!==prev.length) return filtered
          return prev
        })
      } else {
        if(!cancelled){ setHomeTracks([]); setHomeErr(true); setHomeLoading(false) }
        return
      }
      setHomeLoading(false)
    }).catch(()=>{ if(!cancelled){ setHomeTracks([]); setHomeErr(true); setHomeLoading(false) }})
    return ()=> { cancelled=true }
  },[activeCat])

  // infinite scroll for home category — auto load total on scroll like YouTube Music
  const handleLoadMoreHome = async()=>{
    if(homeLoadingMore || !homeNextPage) return
    setHomeLoadingMore(true)
    try{
      const qmap = {
        Punjabi: "Punjabi songs Sidhu Moose Wala AP Dhillon official audio",
        Hindi: "Hindi songs Arijit Singh official audio 2024",
        Love: "Hindi love songs romantic official audio",
        "90s": "90s Hindi songs Kumar Sanu official audio",
        Bollywood: "Bollywood songs Pritam Arijit official audio",
        Indie: "Indie songs Anuv Jain official audio",
        Trending: "Trending Hindi Punjabi songs official audio",
        New: "New Hindi Punjabi songs official audio",
        All: "Hindi Punjabi songs official audio trending"
      }
      const q = qmap[activeCat] || activeCat
      const res = await searchPiped(q, 20, homeNextPage)
      if(res.tracks.length){
        setHomeTracks(prev=> {
          const seen = new Set(prev.map(x=> String(x.id)))
          const filtered = res.tracks.filter(x=> !seen.has(String(x.id)))
          return [...prev, ...filtered]
        })
        setHomeNextPage(res.nextpage)
      } else {
        setHomeNextPage(null)
      }
    }catch(e){ console.warn('home loadMore', e) }
    setHomeLoadingMore(false)
  }

  useEffect(()=>{
    if(homeLoading || !homeNextPage) return
    const el = homeSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting) handleLoadMoreHome()
    }, { rootMargin: '600px' })
    io.observe(el)
    return ()=> io.disconnect()
  }, [homeLoading, homeNextPage, homeTracks.length])
  // Media Session + background playback
  useEffect(()=>{
    if(!current) return
    if('mediaSession' in navigator){
      try{
        navigator.mediaSession.metadata = new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album,
          artwork: [{src: current.cover, sizes:'512x512', type:'image/jpeg'}]
        })
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
        const dur = (duration && isFinite(duration) && duration>1)? duration : (audioRef.current?.duration||0)
        if(dur>1) navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(progress||0, dur), playbackRate: 1 })
      }catch{}
    }
    tick()
    const id = setInterval(tick, 4000)
    return ()=> clearInterval(id)
  },[isPlaying, duration])
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

  // YouTube IFrame API — for YouTube • Full tracks (YouTube Music-like)
  useEffect(()=>{
    if(window.YT && window.YT.Player && ytPlayerRef.current) return
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if(!existing){
      const tag = document.createElement('script')
      tag.src = "https://www.youtube.com/iframe_api"
      document.body.appendChild(tag)
    }
    window.onYouTubeIframeAPIReady = ()=>{
      if(ytPlayerRef.current) return
      ytPlayerRef.current = new window.YT.Player('yt-player', {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1, controls: 0, modestbranding: 1, rel: 0, origin: window.location.origin, enablejsapi: 1 },
        events: {
          onReady: ()=>{ ytReadyRef.current=true; setYtReady(true); console.log('YT ready') },
          onStateChange: (e)=>{
            const YTState = window.YT.PlayerState
            if(e.data === YTState.ENDED){ handleNext() }
            if(e.data === YTState.PLAYING){ setIsPlaying(true); setAudioError(null) }
            // PAUSED handled via toggle
          },
          onError: (e)=>{ console.error('YT error', e.data); setAudioError("YouTube playback error"); showToast("YouTube error — try next"); setIsPlaying(false) }
        }
      })
    }
    // if already loaded
    if(window.YT && window.YT.Player){
      window.onYouTubeIframeAPIReady()
    }
  },[])

  // Sync progress for YouTube tracks
  useEffect(()=>{
    if(!current?.videoId || !ytReady) return
    if(ytProgressRef.current) clearInterval(ytProgressRef.current)
    ytProgressRef.current = setInterval(()=>{
      const p = ytPlayerRef.current
      if(p && p.getCurrentTime && p.getDuration){
        try{
          const ct = p.getCurrentTime()
          const dur = p.getDuration()
          if(isFinite(ct)) setProgress(ct)
          if(isFinite(dur) && dur>0) setDuration(dur)
        }catch{}
      }
    }, 500)
    return ()=> { if(ytProgressRef.current) clearInterval(ytProgressRef.current) }
  },[current, ytReady])

  // audio — robust playback with error fallback + direct user-gesture play
  const [audioError, setAudioError] = useState(null)
  useEffect(()=>{
    const a=audioRef.current; if(!a) return
    const onTime=()=> setProgress(a.currentTime)
    const onLoaded=()=> { setDuration(a.duration||0); setAudioError(null) }
    const onEnded=()=>{ if(repeat===2){ a.currentTime=0; a.play().catch(()=>{}) } else handleNext() }
    const onErr=()=>{ 
      const src = a.currentSrc || a.src || ""
      console.error("audio error", src)
      setAudioError("Playback failed — check network"); 
      showToast("Audio failed — try next or check network"); 
      setIsPlaying(false)
      // don't auto-skip to avoid infinite loop; user can tap next
    }
    a.addEventListener('timeupdate', onTime); a.addEventListener('loadedmetadata', onLoaded); a.addEventListener('ended', onEnded); a.addEventListener('error', onErr)
    return ()=>{ a.removeEventListener('timeupdate',onTime); a.removeEventListener('loadedmetadata',onLoaded); a.removeEventListener('ended',onEnded); a.removeEventListener('error',onErr) }
  },[repeat, currentIndex, shuffle, queue])

  useEffect(()=>{ const a=audioRef.current; if(a) a.volume = isMuted?0:volume },[volume,isMuted])
  // play/pause reacts to isPlaying + current change — handles both YouTube and audio
  useEffect(()=>{
    if(current?.videoId){
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
    // non-YouTube: use audio element
    const a=audioRef.current; if(!a) return
    // pause YT if playing
    if(ytPlayerRef.current?.pauseVideo) try{ ytPlayerRef.current.pauseVideo() }catch{}
    if(isPlaying){
      const tryPlay = ()=> a.play().catch(err=>{
        if(err?.name==="NotAllowedError") showToast("Tap Play ▶ to start audio")
        else { setAudioError(err.message); showToast("Tap Play to start") }
      })
      if(a.readyState < 2){ a.load(); a.addEventListener('canplay', tryPlay, {once:true}); setTimeout(tryPlay, 200) } else tryPlay()
    } else a.pause()
  },[isPlaying, currentIndex, queue, ytReady, current])
  // when queue/current changes while playing, force reload (audio only — YT handled in playEffect)
  useEffect(()=>{
    if(current?.videoId) return
    if(isPlaying && audioRef.current){
      audioRef.current.load()
      audioRef.current.play().catch(()=>{})
    }
  },[currentIndex, current])

  // search online ONLY (user demand — no hardcoded/local), YouTube Music-like paginated
  useEffect(()=>{
    if(!search.trim()){ setOnlineResults([]); setSearching(false); setSearchPage(1); setSearchNextPage(null); return }
    const tm = setTimeout(async()=>{
      setSearching(true)
      setSearchPage(1)
      try{
        // JioSaavn-like fast search — Saavn first, then Piped
        const fb = await unifiedSearch(search, 30)
        if(fb.length){
          setOnlineResults(fb)
          setSearchNextPage(null)
        } else {
          const {tracks, nextpage} = await unifiedSearchPaginated(search, 30, null)
          setSearchNextPage(nextpage)
          setOnlineResults(tracks)
        }
      }catch{
        try{
          const fb = await unifiedSearch(search, 30)
          setOnlineResults(fb)
        }catch{ setOnlineResults([]) }
      }
      setSearching(false)
    }, 180)
    return ()=> clearTimeout(tm)
  },[search])
  // infinite scroll for search — auto load when sentinel visible
  useEffect(()=>{
    if(!search.trim() || searching) return
    const el = searchSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{
      if(entries[0].isIntersecting){
        handleLoadMoreSearch()
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return ()=> io.disconnect()
  }, [search, searching, onlineResults.length, searchPage])

  const handleLoadMoreSearch = async()=>{
    if(!search.trim() || searching) return
    setSearching(true)
    try{
      if(searchNextPage){
        const {tracks: more, nextpage} = await unifiedSearchPaginated(search, 20, searchNextPage)
        if(more.length){
          setOnlineResults(prev=> [...prev, ...more.filter(m=> !prev.some(p=> String(p.id)===String(m.id)))])
          setSearchNextPage(nextpage)
          setSearchPage(p=> p+1)
        } else {
          // fallback to piped direct
          const res = await searchPiped(search, 20, searchNextPage)
          if(res.tracks.length){
            setOnlineResults(prev=> [...prev, ...res.tracks.filter(m=> !prev.some(p=> String(p.id)===String(m.id)))])
            setSearchNextPage(res.nextpage)
            setSearchPage(p=> p+1)
          }
        }
      } else {
        const more = await unifiedSearch(search + " page " + (searchPage+1), 20)
        if(more.length){
          setOnlineResults(prev=> [...prev, ...more.filter(m=> !prev.some(p=> String(p.id)===String(m.id)))])
          setSearchPage(p=> p+1)
        }
      }
    }catch(e){ console.warn('loadMore', e) }
    setSearching(false)
  }

  const filteredLocal = useMemo(()=>{
    if(!search.trim()) return fallbackTracks
    const q=search.toLowerCase()
    return fallbackTracks.filter(t=> t.title.toLowerCase().includes(q)|| t.artist.toLowerCase().includes(q))
  },[search])

  const greeting = useMemo(()=>{ const h=new Date().getHours(); if(h<12) return "Good morning"; if(h<17) return "Good afternoon"; return "Good evening" },[])

  const showToast = (msg)=>{ setToast(msg); setTimeout(()=> setToast(null), 2200) }

  const togglePlay = ()=>{
    if(current?.videoId && ytPlayerRef.current && ytReadyRef.current){
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
  const seek = e=>{ const v=Number(e.target.value); if(current?.videoId && ytPlayerRef.current?.seekTo){ try{ ytPlayerRef.current.seekTo(v, true); setProgress(v) }catch{} return } if(audioRef.current){ audioRef.current.currentTime=v; setProgress(v)} }
  const seekToTime = (v)=>{ if(!current) return; v=Math.max(0, Math.min(v, duration||v)); if(current.videoId && ytPlayerRef.current?.seekTo){ try{ ytPlayerRef.current.seekTo(v, true); setProgress(v); return }catch{} } if(audioRef.current){ try{ audioRef.current.currentTime=v }catch{} setProgress(v) } }
  const scrubRef = useRef(false)
  const scrubTo = (clientX, el)=>{ const r = el.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (clientX - r.left)/r.width)); seekToTime(frac * (duration||0)) }
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
        setAuthUser(u)
        setUser(prev=> ({ ...prev, name: u.name||prev.name, email: u.email||email.trim(), avatar: u.avatar||prev.avatar }))
        setShowAuth(false); setAuthForm({ mode:'login', name:'', email:'', password:'' })
        showToast(`Welcome ${u.name||''} ☁ liked + playlists ab cloud me save`)
      } else showToast('Server reachable nahi / galat credentials — local sync phir bhi chalega')
    } finally { setAuthBusy(false) }
  }
  const handleSignOut = ()=>{ apiLogout(); setAuthUser(null); showToast('Signed out — local data safe hai') }
  const handleDeleteAccount = async ()=>{ const ok = await apiDeleteAccount(); setAuthUser(null); showToast(ok? 'Account cloud se delete ho gaya' : 'Server reachable nahi — session sign out kiya') }

  const playTrack = async (track, list)=>{
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
    } else {
      resolvedTrack = track
    }
    setQueue(newQueue); setCurrentIndex(newIdx); setIsPlaying(true)
    // recently played DB
    setRecentlyPlayed(prev=> [track, ...prev.filter(x=> String(x.id)!==String(track.id))].slice(0,30))
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
      const name = f.name.replace(/\.[^/.]+$/,'')
      newSongs.push({ id:`local-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, title:name, artist:"Local File • "+ (f.name.split('.').pop().toUpperCase()), album:"Local Songs", cover:`https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=60&random=${Math.random()}`, audio:url, durationLabel:"--:--", color:"#543551", plays:"—", source:"Local", isLocal:true, file: f })
    })
    setLocalSongs(prev=> [...newSongs, ...prev])
    showToast(`${newSongs.length} local song(s) added • Library → Local`)
    setNav('library'); setLibTab('Local')
    e.target.value=""
  }

  const handleDownload = async (track)=>{
    if(downloadingId) return
    setDownloadingId(track.id)
    try{
      const existing = downloaded.find(d=> String(d.id)===String(track.id) || String(d.track?.id)===String(track.id))
      if(existing && existing.blob && existing.blob.size>0){ showToast("Already downloaded ✓"); setDownloadingId(null); return }
      showToast("Downloading…")
      let audioUrl = track.audio
      // If YT track (videoId) without audio, resolve to direct URL first
      if(!audioUrl && track.videoId){
        showToast("Resolving audio for download…")
        audioUrl = await resolvePipedAudio(track)
        if(!audioUrl) throw new Error("resolve failed")
      }
      if(!audioUrl) throw new Error("no audio")
      // For offline, fetch with CORS mode
      const res = await fetch(audioUrl)
      if(!res.ok) throw new Error("fetch failed")
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

  const handleCreatePlaylist = ()=>{
    if(!newPlName.trim()) return
    const pl = { id:`pl-${Date.now()}`, title:newPlName.trim(), subtitle:"Custom playlist • "+user.name, cover:`https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&auto=format&fit=crop&q=60&random=${Date.now()}`, color:"from-[#6A418E] to-[#543551]", count:"0 songs", songs:[] }
    setPlaylists(prev=> [pl, ...prev])
    setNewPlName(""); setShowCreatePl(false); showToast(`Playlist "${pl.title}" created`)
  }
  const handleArtistClick = async (artistName)=>{
    setSelectedArtist(artistName)
    setArtistTracks([])
    setArtistNextPage(null)
    showToast(`Loading ${artistName}… LIVE`)
    setSearching(true)
    try{
      const { tracks, nextpage } = await artistSongsPaginated(artistName, 24)
      if(tracks.length){
        setArtistTracks(tracks)
        setArtistNextPage(nextpage)
        showToast(`${artistName} • ${tracks.length} tracks LIVE — scroll for total`)
      } else {
        const songs = await artistSongs(artistName, 24)
        if(songs.length){
          setArtistTracks(songs)
          showToast(`${artistName} • ${songs.length} tracks LIVE`)
        } else showToast(`No tracks for ${artistName}`)
      }
    }catch{ showToast(`Failed ${artistName}`)}
    setSearching(false)
  }
  const handleLoadMoreArtist = async()=>{
    if(artistLoadingMore || !artistNextPage || !selectedArtist) return
    setArtistLoadingMore(true)
    try{
      const { tracks, nextpage } = await artistSongsPaginated(selectedArtist, 20, artistNextPage)
      if(tracks.length){
        setArtistTracks(prev=>{
          const seen=new Set(prev.map(x=> String(x.id)))
          const filtered=tracks.filter(x=> !seen.has(String(x.id)))
          return [...prev, ...filtered]
        })
        setArtistNextPage(nextpage)
      } else setArtistNextPage(null)
    }catch(e){ console.warn('artist loadMore',e)}
    setArtistLoadingMore(false)
  }
  useEffect(()=>{
    if(!selectedArtist || !artistNextPage) return
    const el = artistSentinelRef.current
    if(!el) return
    const io = new IntersectionObserver(entries=>{ if(entries[0].isIntersecting) handleLoadMoreArtist() }, { rootMargin:'600px'})
    io.observe(el)
    return ()=> io.disconnect()
  },[selectedArtist, artistNextPage, artistTracks.length])
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
    <div className="min-h-screen bg-[#060306] text-white selection:bg-[#D5AA55]/30 selection:text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-[30%] -left-[20%] w-[90%] h-[80%] rounded-full blur-[120px] opacity-[0.18]" style={{ background:'radial-gradient(circle, #A154D6 0%, #6A418E 30%, transparent 70%)'}}/>
        <div className="absolute top-[10%] -right-[20%] w-[80%] h-[60%] rounded-full blur-[140px] opacity-[0.15]" style={{ background:'radial-gradient(circle, #C35445 0%, #572223 40%, transparent 70%)'}}/>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] h-[50%] blur-[100px] opacity-[0.12]" style={{ background:'radial-gradient(ellipse at center, #543551 0%, transparent 70%)'}}/>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#060306]"/>
      </div>

      <audio ref={audioRef} src={current?.videoId ? undefined : current?.audio} preload="metadata" crossOrigin="anonymous" playsInline onError={()=> showToast("Audio error — check net, trying next…")} />
      <div id="yt-player" style={{position:'absolute', left:'-9999px', width:'1px', height:'1px', overflow:'hidden', opacity:0, pointerEvents:'none'}} />
      {audioError && <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-[#C35445] text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg">{audioError}</div>}

      <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleLocalFiles} className="hidden"/>

      <div className="relative flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-4 p-3 pr-0 sticky top-0 h-screen">
          <div className="glass rounded-[24px] p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D5AA55] to-[#C35445] grid place-items-center font-bold text-black">♪</div>
              <div>
                <div className="font-display font-bold leading-none text-[18px] tracking-tight">Sur Sangam</div>
                <div className="text-[11px] tracking-[0.18em] text-white/60 font-semibold uppercase">Music • India • Backend Live</div>
              </div>
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Backend connected"/>
            </div>
            <nav className="space-y-1">
              {[
                { id:'home', label:'Home', icon:HomeIcon, active:nav==='home' },
                { id:'search', label:'Search', icon:SearchIcon, active:nav==='search' },
                { id:'library', label:'Your Library', icon:LibraryIcon, active:nav==='library' },
                { id:'profile', label:'Profile', icon:ProfileIcon, active:nav==='profile' },
              ].map(item=> (
                <button key={item.id} onClick={()=> setNav(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${item.active? 'bg-white text-black':'text-white/70 hover:text-white hover:bg-white/10'}`}>
                  <item.icon active={item.active}/>{item.label}
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
                <button key={pl.id} onClick={()=>{ setNav('library'); setLibTab('Playlists')}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left group">
                  <img src={pl.cover} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"/>
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
              <div className="flex items-center gap-2 lg:hidden"><div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D5AA55] to-[#C35445] grid place-items-center font-bold text-black text-sm">♪</div><span className="font-display font-bold text-sm">Sur Sangam</span><span className="hidden xs:inline text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full ml-1">Backend Live</span></div>
              <div className="hidden lg:flex items-center gap-2"><button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur grid place-items-center border border-white/10 hover:bg-white/10"><ChevronLeft/></button><button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur grid place-items-center border border-white/10 opacity-50"><ChevronRight/></button></div>
              <div className="flex-1 flex justify-center lg:justify-start max-w-[680px] mx-auto lg:mx-4">
                <div className="relative w-full">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"><SearchIcon size={18}/></span>
                  <input value={search} onChange={e=>{ setSearch(e.target.value); if(e.target.value) setNav('search')}} onFocus={()=> setNav('search')} placeholder="Real search • Try 'Arijit', 'Sidhu', 'Calm Down' — online + local" className="w-full h-10 pl-10 pr-10 rounded-full bg-white/10 hover:bg-white/[0.14] focus:bg-white text-sm placeholder:text-white/50 focus:placeholder:text-black/40 focus:text-black outline-none border border-white/10 focus:border-white transition"/>
                  {search && <button onClick={()=> setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full bg-black/20 hover:bg-black/30 text-white/70"><CloseIcon/></button>}
                  {searching && <span className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={()=> fileInputRef.current?.click()} className="hidden sm:grid w-9 h-9 place-items-center rounded-full bg-white/10 hover:bg-white/15 border border-white/10" title="Add Local Songs"><PlusIcon/></button>
                <button className="hidden sm:grid w-9 h-9 place-items-center rounded-full bg-white text-black hover:bg-white/90"><BellIcon/></button>
                <div className="relative">
                  <button onClick={()=> setShowProfileMenu(v=>!v)} className="hidden sm:flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/10 border border-white/10 hover:bg-white/15">
                    <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover"/><span className="text-sm font-medium hidden lg:block">{user.name.split(' ')[0]}</span><ChevronDown/>
                  </button>
                  {showProfileMenu && (
                    <div className="absolute right-0 top-11 w-[300px] glass-strong rounded-2xl p-3 shadow-2xl z-50">
                      <div className="flex gap-3 p-2">
                        <img src={user.avatar} alt="" className="w-12 h-12 rounded-full object-cover"/>
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
                <button onClick={()=> setNav('profile')} className="lg:hidden w-9 h-9 rounded-full overflow-hidden border border-white/10"><img src={user.avatar} alt="" className="w-full h-full object-cover"/></button>
              </div>
            </div>
            <div className="px-4 lg:px-6 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
              {categories.map(c=> (
                <button key={c.id} onClick={()=>{ setActiveCat(c.id); showToast(c.id==="All"? "All songs • curated" : `Showing ${c.label} • ${homeTracks.length? homeTracks.length: getCategoryTracks(c.id).length} songs — tap Play` ) }} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition flex items-center gap-1.5 ${activeCat===c.id? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10 hover:bg-white/15'}`}><span>{c.icon}</span>{c.label}</button>
              ))}
              <span className="ml-auto hidden lg:flex items-center gap-2 text-xs text-white/40"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>Tap category → auto-queue • Offline ready</span>
            </div>
          </header>

          <main className="flex-1 px-4 lg:px-6 py-6 pb-28 lg:pb-28 space-y-7">
            {nav==='profile' ? (
              <ProfileView user={user} setUser={setUser} editUser={editUser} setEditUser={setEditUser} liked={liked} playlists={playlists} localSongs={localSongs} downloaded={downloaded} showToast={showToast} authUser={authUser} onSignIn={()=> setShowAuth(true)} onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} />
            ) : nav==='search' ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-2xl font-bold font-display">{search? `Search "${search}"` : "Browse all"} <span className="text-sm font-normal text-white/50">• Real-time online + local</span></h2>
                  <span className="text-sm text-white/50">{search ? `${onlineResults.length||filteredLocal.length} results` : `${fallbackTracks.length} curated • ${localSongs.length} local`}</span>
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
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {(homeTracks.length? homeTracks : fallbackTracks).slice(0,12).map(t=>{
                          const idx=queue.findIndex(x=> String(x.id)===String(t.id))
                          return (
                            <div key={t.id} className={`flex items-center gap-3 p-2 pr-2 rounded-xl border text-left ${idx===currentIndex?'bg-white text-black border-white':'bg-white/5 hover:bg-white/10 border-white/5'}`}>
                              <button onClick={()=> playTrack(t)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                <img src={t.cover} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0"/>
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
                                  <button onClick={()=> playTrack(t, [...onlineResults, ...queue])} className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                                    <img src={t.cover} alt="" className="w-full h-full object-cover"/>
                                    <span className={`absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 ${String(current?.id)===String(t.id)? '!opacity-100 bg-black/20':''}`}>{inQueue? <PauseMini dark/> : <PlayMini dark/>}</span>
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className={`text-sm font-medium truncate ${String(current?.id)===String(t.id)?'text-black':'text-white'}`}>{t.title} {t.source && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 align-middle">{t.source}</span>}</div>
                                    <div className={`text-xs truncate ${String(current?.id)===String(t.id)?'text-black/60':'text-white/60'}`}>{t.artist} • {t.album}</div>
                                  </div>
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
                          {onlineResults.length>=10 && <button onClick={handleLoadMoreSearch} disabled={searching} className="mt-4 w-full py-2.5 rounded-full bg-white/10 border border-white/10 text-white text-sm font-bold hover:bg-white hover:text-black disabled:opacity-50">{searching? "Loading more worldwide…":"Load more — scroll for auto-load"}</button>}
                          <div className="text-center text-xs text-white/30 mt-2">Showing {onlineResults.length} worldwide full-length tracks • Scroll for auto-load</div>
                        </div>
                        {localSongs.length>0 && (
                          <div>
                            <h3 className="font-bold mb-3">Your Local Files • {localSongs.filter(s=> s.title.toLowerCase().includes(search.toLowerCase())).length} matches</h3>
                            <div className="space-y-2">
                              {localSongs.filter(s=> s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase())).slice(0,5).map(t=>(
                                <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                                  <img src={t.cover} alt="" className="w-12 h-12 rounded-lg object-cover"/>
                                  <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist} • Local</div></div>
                                  <button onClick={()=> playTrack(t, [...localSongs, ...queue])} className="w-8 h-8 grid place-items-center rounded-full bg-white text-black"><PlayMini size={12}/></button>
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
                  <div><h2 className="text-2xl font-bold font-display">Your Library</h2><p className="text-sm text-white/60">{liked.size} liked • {playlists.length} playlists • {localSongs.length} local • {downloaded.length} offline</p></div>
                  <div className="ml-auto flex gap-2">
                    <button onClick={()=> setShowCreatePl(true)} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-sm font-bold"><PlusIcon/> New Playlist</button>
                    <button onClick={()=> fileInputRef.current?.click()} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-white text-sm font-semibold"><PlusIcon/> Add Local</button>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {["Playlists","Liked","Local","Downloads","Songs"].map(tab=> (
                    <button key={tab} onClick={()=> setLibTab(tab)} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border ${libTab===tab? 'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/70'}`}>{tab}</button>
                  ))}
                </div>

                {libTab==="Playlists" && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                      <button onClick={()=> setShowCreatePl(true)} className="glass rounded-[18px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-white/10 border-dashed border-2 border-white/15 min-h-[200px]">
                        <span className="w-12 h-12 rounded-full bg-white text-black grid place-items-center text-2xl">+</span><span className="text-sm font-semibold">Create Playlist</span><span className="text-xs text-white/50">Add your favourite tracks</span>
                      </button>
                      {playlists.map(pl=> (
                        <div key={pl.id} className="glass rounded-[18px] p-3 hover:bg-white/10 transition group relative">
                          <div className="relative aspect-square rounded-xl overflow-hidden mb-3">
                            <img src={pl.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500"/>
                            <div className={`absolute inset-0 bg-gradient-to-br ${pl.color} opacity-60 mix-blend-overlay`}/>
                            <button onClick={()=> showToast(`Playing playlist • ${pl.title}`)} className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-[#D5AA55] text-black grid place-items-center shadow-lg translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></button>
                            <div className="absolute top-2 left-2 text-[11px] font-bold bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">{pl.count}</div>
                          </div>
                          <div className="text-sm font-semibold leading-tight line-clamp-1">{pl.title}</div><div className="text-xs text-white/50 line-clamp-2 leading-relaxed">{pl.subtitle}</div>
                          <div className="mt-3 flex gap-1">
                            <button onClick={async()=>{ 
                              if(pl.tracks?.length){
                                setQueue(pl.tracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title} • ${pl.tracks.length}`)
                                return
                              }
                              if(pl.songs?.length){ 
                                const ids=pl.songs; 
                                let tracksToPlay = ids.map(id=> localSongs.find(t=> String(t.id)===String(id))).filter(Boolean); 
                                // curated/legacy — fetch real from Saavn
                                if(tracksToPlay.length < 3){
                                  const q = pl.title
                                  try{
                                    const real = await searchSaavn(q, 12)
                                    if(real.length) tracksToPlay = real
                                  }catch{}
                                }
                                if(tracksToPlay.length){ setQueue(tracksToPlay); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title}`) } else showToast("Kuch nahi mila — internet check karke phir try karo") 
                              } else {
                                // empty custom playlist — try to fetch real for its name
                                try{
                                  const real = await searchSaavn(pl.title, 12)
                                  if(real.length){ setQueue(real); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title} • ${real.length} real`) }
                                  else showToast("Empty playlist — add songs from Search")
                                }catch{ showToast("Empty playlist — add songs from Search") }
                              }
                            }} className="flex-1 py-1.5 rounded-full bg-white text-black text-xs font-bold">Play</button>
                            <button onClick={()=>{ setPlaylists(prev=> prev.filter(x=> x.id!==pl.id)); showToast("Playlist deleted")}} className="w-8 h-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 border border-white/5"><CloseIcon/></button>
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
                            <span className="w-6 text-center text-xs text-white/30 group-hover:hidden">{String(i+1).padStart(2,'0')}</span><button onClick={()=> playTrack(t, likedTracks)} className="w-6 hidden group-hover:grid place-items-center"><PlayMini/></button>
                            <button onClick={()=> playTrack(t, likedTracks)} className="flex items-center gap-3 flex-1 min-w-0 text-left"><img src={t.cover} alt="" className="w-10 h-10 rounded-md object-cover"/><div className="min-w-0"><div className={`text-sm font-medium truncate ${isCur?'text-[#D5AA55]':''}`}>{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div></button>
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
                            <img src={t.cover} alt="" className="w-10 h-10 rounded-md object-cover"/>
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
                      <div className="flex-1"><div className="font-semibold text-sm">Offline Songs — IndexedDB</div><div className="text-xs text-white/60">{downloaded.length} songs cached for offline playback • Real download via fetch + blob</div></div>
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
                            <img src={track.cover} alt="" className="w-10 h-10 rounded-md object-cover"/>
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
                          <button onClick={()=> playTrack(t, allSongsForLibrary)} className="flex items-center gap-3 flex-1 min-w-0 text-left"><img src={t.cover} alt="" className="w-10 h-10 rounded-md object-cover"/><div className="min-w-0"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist} {t.isLocal && <span className="ml-1 text-emerald-400">• Local</span>}</div></div></button>
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
                  <div className="flex flex-wrap items-baseline gap-3 mb-4"><h1 className="text-[28px] sm:text-[32px] font-bold font-display tracking-tight">{greeting}, {user.name.split(' ')[0]}</h1><span className="text-sm text-white/50 hidden sm:block">Ready to vibe? {localSongs.length>0? `${localSongs.length} local +`:''} {downloaded.length} offline • {activeCat==="All"? "All genres":"Category: "+activeCat}</span></div>
                  {activeCat!=="All" && (
                    <div className="mb-4 p-4 rounded-[20px] bg-gradient-to-br from-[#6A418E]/30 to-[#543551]/30 border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-white text-black grid place-items-center text-lg shrink-0">{categories.find(c=> c.id===activeCat)?.icon}</div>
                        <div className="min-w-0 flex-1"><div className="font-bold truncate">{activeCat} Playlist</div><div className="text-xs text-white/60">{homeTracks.length || getCategoryTracks(activeCat).length} songs • tap any song or Play All below</div></div>
                        <button onClick={()=> setActiveCat("All")} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs shrink-0">All</button>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={()=>{ const tk = homeTracks.length? homeTracks : getCategoryTracks(activeCat); if(tk.length){ setQueue(tk); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing ${activeCat} • ${tk.length} tracks`) } else showToast('Pehle tracks load hojne do — Retry dabao') }} className="flex-1 py-2.5 rounded-full bg-white text-black text-sm font-bold flex items-center justify-center gap-2"><PlayMini/> Play All</button>
                      </div>
                    </div>
                  )}
                  {homeErr && !homeLoading && <div className="mb-3 p-4 rounded-[20px] bg-white/5 border border-white/10 flex items-center gap-3"><span className="text-sm text-white/70 flex-1">Internet/Lag delay — {activeCat} load nahi ho paya</span><button onClick={()=>{ setHomeErr(false); setHomeLoading(true); trendingByCategory(activeCat, 20).then(tr=>{ setHomeTracks(tr||[]); setHomeLoading(false); if(tr&&tr.length) setHomeErr(false) }) }} className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold">Retry</button></div>}
                  {homeLoading ? <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9,10,11,12].map(i=> <div key={i} className="h-[64px] rounded-xl bg-white/5 animate-pulse border border-white/5"/> )}</div> : <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {homeTracks.map(t=>{
                      const idx=queue.findIndex(x=> String(x.id)===String(t.id))
                      const isReal = t.source && !t.source.includes('tone')
                      return (
                        <button key={t.id} onClick={()=> playTrack(t, homeTracks)} className={`group flex items-center gap-3 pr-2 rounded-xl overflow-hidden text-left border transition ${idx===currentIndex? 'bg-white text-black border-white':'bg-white/[0.07] hover:bg-white/10 border-white/5 backdrop-blur'}`}>
                          <div className="relative w-14 h-14 sm:w-[64px] sm:h-[64px] shrink-0 overflow-hidden"><img src={t.cover} alt="" className="w-full h-full object-cover"/><span className={`absolute inset-0 grid place-items-center bg-black/30 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 ${idx===currentIndex && isPlaying? '!opacity-100':''}`}>{idx===currentIndex && isPlaying? <PauseIcon/>:<PlayIcon/>}</span>{!isReal && <span className="absolute bottom-1 left-1 text-[8px] bg-black/60 text-white px-1 py-0.5 rounded">tone</span>}</div>
                          <span className={`text-sm font-semibold leading-tight line-clamp-2 pr-2 ${idx===currentIndex? 'text-black':'text-white'}`}>{t.title}<span className="block text-xs font-normal opacity-60">{t.artist} {t.source? `• ${t.source.replace(" • Full","")}`:""}</span></span>
                          {liked.has(t.id) && <span className="ml-auto hidden sm:block text-[#C35445] mr-2"><Heart filled size={16}/></span>}
                        </button>
                      )
                    })}
                  </div>}
                  <div ref={homeSentinelRef} className="h-1" />
                  {homeNextPage && <div className="text-center py-3"><button onClick={handleLoadMoreHome} disabled={homeLoadingMore} className="px-6 py-2 rounded-full bg-white/10 border border-white/10 text-sm font-bold hover:bg-white hover:text-black disabled:opacity-50">{homeLoadingMore? "Loading more music..." : "Load more — scroll for auto-load"}</button></div>}
                  <div className="text-center text-xs text-white/30">Showing {homeTracks.length} {activeCat} tracks • Scroll down for auto-load (total, not just 20-25)</div>
                  {localSongs.length>0 && (
                    <div className="mt-4 glass rounded-2xl p-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D5AA55] to-[#6A418E] grid place-items-center">♫</div>
                      <div className="flex-1"><div className="text-sm font-semibold">Local Files ready — {localSongs.length} songs</div><div className="text-xs text-white/60">Tap to play your device music, like Spotify Local Files</div></div>
                      <button onClick={()=>{ setNav('library'); setLibTab('Local')}} className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold">Open</button>
                    </div>
                  )}
                </div>

                <section>
                  <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold font-display">{activeCat==="All"? "Curated for you — Backend Playlists" : `${activeCat} Playlists • ${getCategoryPlaylists(activeCat).length || homeTracks.length || '—'} mixes`}</h2><button onClick={()=>{ setNav('library'); setLibTab('Playlists')}} className="text-sm font-semibold text-white/60 hover:text-white">Show all</button></div>
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-none snap-x">
                    {( (activeCat==="All"? playlists : getCategoryPlaylists(activeCat)).length? (activeCat==="All"? playlists : getCategoryPlaylists(activeCat)) : homeTracks.slice(0,8).map((tr,i)=> ({ id:`home-curated-${i}`, title: tr.title, subtitle: tr.artist + ' • ' + (tr.source||'Full'), cover: tr.cover, color: 'from-[#6A418E] to-[#543551]', count: tr.durationLabel, songs: [] })) ).map(pl=> (
                      <div key={pl.id} className="shrink-0 w-[172px] sm:w-[188px] glass rounded-[20px] p-3 snap-start hover:bg-white/[0.09] transition group">
                        <div className="relative aspect-square rounded-[16px] overflow-hidden mb-3">
                          <img src={pl.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-700"/>
                          <div className={`absolute inset-0 bg-gradient-to-br ${pl.color} opacity-70 mix-blend-overlay`}/>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"/>
                          <button onClick={async()=>{
                            // JioSaavn-like real play — fetch genuine tracks for this playlist theme
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
                              // trendingByCategory already Saavn-first, so real
                              let tracks = real
                              if(!tracks.length){
                                const s = await searchSaavn(q, 20)
                                tracks = s
                              }
                              if(tracks.length){
                                setQueue(tracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing • ${pl.title} • ${tracks.length} real`)
                              } else if(pl.tracks?.length){
                                setQueue(pl.tracks); setCurrentIndex(0); setIsPlaying(true); showToast(`Playing saved • ${pl.title}`)
                              } else showToast("Network nahi mila — thodi der baad try karo")
                            }catch{
                              if(pl.tracks?.length){ setQueue(pl.tracks); setCurrentIndex(0); setIsPlaying(true) } else showToast("Network nahi mila — retry karo")
                            }
                          }} className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-white text-black grid place-items-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></button>
                          <div className="absolute top-3 left-3 text-[11px] font-bold tracking-widest bg-black/40 backdrop-blur px-2 py-1 rounded-full border border-white/10">{pl.count || `${(pl.songs||[]).length} songs`}</div>
                        </div>
                        <div className="font-semibold text-sm leading-tight line-clamp-1">{pl.title}</div><div className="text-xs text-white/50 line-clamp-2 leading-relaxed mt-1">{pl.subtitle}</div>
                      </div>
                    ))}
                    {activeCat!=="All" && getCategoryPlaylists(activeCat).length===0 && <div className="shrink-0 w-full glass rounded-[20px] p-6 text-center text-white/50">No {activeCat} mixes yet — try All</div>}
                  </div>
                </section>

                <div className="grid lg:grid-cols-[1.7fr_1fr] gap-6">
                  <section className="glass rounded-[24px] p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg">Recently played — {recentlyPlayed.length? `${recentlyPlayed.length} songs`:'Real history'}</h3><button onClick={()=> { if(recentlyPlayed.length){ setQueue(recentlyPlayed); setCurrentIndex(0); setIsPlaying(true) }}} className="w-8 h-8 rounded-full bg-white text-black grid place-items-center"><ChevronRight/></button></div>
                    {recentlyPlayed.length===0 ? <div className="text-center py-8 text-sm text-white/50">Play any song — it will appear here (like Spotify history, saved to DB)</div> : null}
                    <div className="space-y-1">
                      {(recentlyPlayed.length? recentlyPlayed : queue).slice(0,7).map((t,i)=>{
                        const isCur = String(current?.id)===String(t.id)
                        return (
                          <div key={t.id+String(i)} className={`flex items-center gap-3 p-2 rounded-xl transition ${isCur? 'bg-white text-black':'hover:bg-white/5'}`}>
                            <span className={`hidden sm:block w-6 text-center text-xs font-bold ${isCur? 'text-black/40':'text-white/30'}`}>{String(i+1).padStart(2,'0')}</span>
                            <button onClick={()=> playTrack(t)} className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0"><img src={t.cover} alt="" className="w-full h-full object-cover"/><span className={`absolute inset-0 grid place-items-center bg-black/40 opacity-0 hover:opacity-100 ${isCur? 'opacity-100 bg-black/20':''}`}>{isCur && isPlaying? <PauseMini dark={!isCur}/>:<PlayMini dark={!isCur}/>}</span></button>
                            <div className="min-w-0 flex-1"><div className={`text-sm font-medium truncate ${isCur? 'text-black':'text-white'}`}>{t.title} {t.source && <span className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded-full border border-black/10 ml-1">{t.source}</span>}</div><div className={`text-xs truncate ${isCur? 'text-black/60':'text-white/50'}`}>{t.artist}</div></div>
                            <button onClick={()=> toggleLike(t.id, t)} className={`hidden sm:grid w-8 h-8 place-items-center rounded-full ${liked.has(t.id)? 'text-[#C35445]': isCur? 'text-black/30':'text-white/30 hover:text-white'}`}><Heart filled={liked.has(t.id)} size={16}/></button>
                            <button onClick={()=> handleDownload(t)} className={`hidden sm:grid w-8 h-8 place-items-center rounded-full border ${downloaded.find(d=> String(d.id)===String(t.id))? 'bg-emerald-500 border-emerald-500 text-white':'border-white/10 text-white/40'}`}><DownloadIcon size={12}/></button>
                            <span className={`text-xs font-medium ${isCur? 'text-black/60':'text-white/40'}`}>{t.durationLabel}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                  <div className="space-y-6">
                    <section className="glass rounded-[24px] p-5">
                      <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg">{activeCat==="All"? "Top artists this month" : `${activeCat} Artists`}</h3><span className="text-xs text-white/40">{getFilteredArtists(activeCat).length} artists</span></div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {getFilteredArtists(activeCat).slice(0,6).map(a=>(
                          <button key={a.name} onClick={()=> handleArtistClick(a.name)} className="group text-center">
                            <div className="relative mx-auto w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-[#D5AA55]/70 transition group-hover:scale-105"><img src={a.img} alt="" className="w-full h-full object-cover"/><div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition grid place-items-end justify-center pb-2"><span className="text-[10px] font-bold bg-white text-black px-2 py-0.5 rounded-full">Play</span></div></div>
                            <div className="text-xs font-semibold mt-2 leading-tight group-hover:text-[#D5AA55]">{a.name}</div><div className="text-[11px] text-white/40">{a.plays} • {a.cat}</div>
                          </button>
                        ))}
                      </div>
                      {selectedArtist && artistTracks.length>0 && (
                        <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10">
                          <div className="flex items-center justify-between mb-2"><span className="text-sm font-bold">{selectedArtist} — {artistTracks.length} tracks</span><button onClick={()=> setSelectedArtist(null)} className="text-xs text-white/60 hover:text-white">Clear</button></div>
                          <div className="space-y-1 max-h-[300px] overflow-y-auto">
                            {artistTracks.map(tr=>(
                              <button key={tr.id} onClick={()=> playTrack(tr, artistTracks)} className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/10 text-left">
                                <img src={tr.cover} alt="" className="w-8 h-8 rounded-lg object-cover"/>
                                <div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{tr.title}</div><div className="text-[11px] text-white/50 truncate">{tr.artist}</div></div>
                                <PlayMini size={10}/>
                              </button>
                            ))}
                          </div>
                          <div ref={artistSentinelRef} className="h-1" />
                          {artistNextPage && <button onClick={handleLoadMoreArtist} disabled={artistLoadingMore} className="w-full mt-2 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold hover:bg-white hover:text-black disabled:opacity-50">{artistLoadingMore? "Loading more...":"Load more — scroll for auto-load"}</button>}
                          <div className="text-center text-[10px] text-white/40 mt-1">Showing {artistTracks.length} LIVE tracks • Scroll for total (not just 6)</div>
                          <button onClick={()=>{ setQueue(artistTracks); setCurrentIndex(0); setIsPlaying(true) }} className="mt-2 w-full py-2 rounded-full bg-white text-black text-xs font-bold">Play All {selectedArtist}</button>
                        </div>
                      )}
                      <button onClick={()=> showToast("All artists • " + getFilteredArtists(activeCat).map(a=>a.name).join(", "))} className="mt-5 w-full py-2.5 rounded-full bg-white text-black text-sm font-bold">View all artists</button>
                    </section>
                    <section className="relative rounded-[24px] overflow-hidden p-5 bg-gradient-to-br from-[#543551] via-[#6A418E] to-[#A154D6]">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"/><div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"/>
                      <div className="relative">
                        <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest bg-white/15 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">✨ SUR SANGAM ORIGINALS</div>
                        <h3 className="text-2xl font-bold font-display leading-tight mt-3">Monsoon Mix 2025</h3><p className="text-sm text-white/80 mt-2 leading-relaxed">Baarishein, Heeriye & 30 soulful tracks for chai & late nights.</p>
                        <div className="flex items-center gap-3 mt-4"><button onClick={()=> playTrack(fallbackTracks[13])} className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-bold flex items-center gap-2"><PlayMini/> Play</button><button onClick={()=> toggleLike(fallbackTracks[13].id, fallbackTracks[13])} className={`w-10 h-10 rounded-full backdrop-blur grid place-items-center border ${liked.has(fallbackTracks[13].id)? 'bg-[#C35445] border-[#C35445] text-white':'bg-white/15 border-white/15 text-white'}`}><Heart filled={liked.has(fallbackTracks[13].id)}/></button></div>
                        <div className="flex -space-x-2 mt-5">{[0,1,2,3].map(i=> (<img key={i} src={fallbackTracks[i].cover} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-[#6A418E]"/>))}<span className="w-8 h-8 rounded-full bg-black/30 backdrop-blur border-2 border-white/20 grid place-items-center text-xs font-bold">+34</span></div>
                      </div>
                    </section>
                  </div>
                </div>

                <section>
                  <div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold font-display">{activeCat==="All"? "Jump back in — Online + Local" : `${activeCat} • Jump back in`}</h2><span className="text-xs text-white/40 hidden sm:block">{activeCat==="All"? "Based on your listening + downloads" : `${getCategoryTracks(activeCat).length} songs in ${activeCat}`}</span></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {(activeCat==="All"? (homeTracks.length? homeTracks.slice(0,6) : []) : (homeTracks.length? homeTracks.slice(0,12) : [])).map(t=>(
                      <button key={t.id} onClick={()=> playTrack(t, activeCat==="All"? [...fallbackTracks, ...localSongs] : getCategoryTracks(activeCat))} className="text-left glass rounded-[18px] p-3 hover:bg-white/10 transition group">
                        <div className="relative aspect-square rounded-xl overflow-hidden mb-3"><img src={t.cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-700"/><span className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-[#D5AA55] text-black grid place-items-center shadow-lg translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 transition"><PlayMini/></span>{t.isLocal && <span className="absolute top-2 left-2 text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">LOCAL</span>}{activeCat!=="All" && <span className="absolute top-2 right-2 text-[10px] font-bold bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded-full border border-white/10">{activeCat}</span>}</div>
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
                    <div className="relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl overflow-hidden shrink-0"><img src={current.cover} alt="" className="w-full h-full object-cover"/><div className="absolute inset-0 ring-1 ring-white/10 rounded-xl"/></div>
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
                  <div className="flex md:hidden items-center gap-2"><button onClick={togglePlay} className="w-9 h-9 rounded-full bg-white text-black grid place-items-center">{isPlaying? <PauseMini dark/>:<PlayMini dark/>}</button><button onClick={handleNext} className="w-9 h-9 grid place-items-center text-white/80"><NextIcon/></button></div>
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

          {/* Full player */}
          {current && <div className={`fixed inset-0 z-50 bg-[#060306] overflow-y-auto transition-transform duration-500 ${showFull? 'translate-y-0':'translate-y-full'}`}
            onTouchStart={e=>{ touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } }}
            onTouchEnd={e=>{ const s = touchRef.current; if(!s) return; const dx = e.changedTouches[0].clientX - s.x; const dy = e.changedTouches[0].clientY - s.y; if(Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)*1.4){ if(dx < 0) handleNext(); else handlePrev(); } else if(dy > 120 && Math.abs(dy) > Math.abs(dx)*1.2){ setShowFull(false) } touchRef.current=null }}>
            <div className="min-h-screen relative">
              <div className="absolute inset-0 overflow-hidden"><img src={current.cover} alt="" className="w-full h-full object-cover scale-110 blur-[60px] opacity-30"/><div className="absolute inset-0 bg-gradient-to-b from-[#060306]/40 via-[#060306]/70 to-[#060306]"/><div className="absolute inset-0" style={{ background:`radial-gradient(600px 600px at 50% 0%, ${current.color}40, transparent)`}}/></div>
              <div className="relative max-w-[980px] mx-auto px-4 lg:px-6 py-4 lg:py-6">
                <div className="flex items-center justify-between gap-4">
                  <button onClick={()=> setShowFull(false)} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/10 grid place-items-center hover:bg-white/15"><ChevronDownLarge/></button>
                  <div className="text-center"><div className="text-xs tracking-[0.18em] font-bold text-white/50">NOW PLAYING</div><div className="text-sm font-semibold">Playing from <span className="text-[#D5AA55]">{current.source || 'Sur Sangam'}</span></div></div>
                  <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/10 grid place-items-center hover:bg-white/15"><MoreIcon/></button>
                </div>
                <div className="mt-6 lg:mt-10 grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">
                  <div className="relative mx-auto w-full max-w-[520px]">
                    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)] bg-black">
                      <img src={current.cover} alt="" className={`w-full h-full object-cover ${isPlaying? 'scale-[1.02]':'scale-100'} transition duration-[2000ms]`}/>
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
                  <div className="flex flex-col">
                    <div className="text-center lg:text-left">
                      <h1 className="text-[32px] lg:text-[40px] font-bold font-display leading-none tracking-tight">{current.title}</h1><p className="text-lg text-white/70 mt-2">{current.artist}</p><p className="text-sm text-white/40 mt-1">{current.album} • {current.plays} plays {current.source && `• ${current.source}`}</p>
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
                      <div className="flex items-center justify-between mt-8 gap-3"><button onClick={()=> setShowLyrics(!showLyrics)} className={`flex-1 py-3 rounded-full text-sm font-bold border transition ${showLyrics? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10 hover:bg-white/15'}`}>{showLyrics? 'Hide Lyrics':'View Lyrics'}</button><button onClick={()=> setShowQueue(!showQueue)} className={`px-5 py-3 rounded-full text-sm font-bold border ${showQueue? 'bg-white text-black border-white':'bg-white/10 text-white border-white/10'}`}>Queue</button></div>
                      <div className="hidden lg:flex items-center gap-3 mt-6"><VolumeIcon muted={isMuted} volume={volume}/><input type="range" min={0} max={1} step={0.01} value={isMuted?0:volume} onChange={e=>{ setVolume(Number(e.target.value)); setIsMuted(false)}} className="range flex-1 accent-white"/><button onClick={()=> setIsMuted(!isMuted)} className="text-xs font-semibold text-white/60 hover:text-white">{isMuted? 'Muted':'Volume'}</button></div>
                    </div>
                  </div>
                </div>
                {showLyrics && (
                  <div className="mt-8 glass rounded-[24px] p-6 max-h-[40vh] overflow-y-auto"><h3 className="font-bold mb-4 flex items-center gap-2"><MicIcon/> Lyrics — {current.title}</h3><div className="space-y-3 text-sm leading-relaxed"><p className="text-white font-medium">Kesariya tera ishq hai piya</p><p className="text-white/70">Rang jaun jo main hath lagau</p><p className="text-white/70">Din beete saara teri fikr mein</p><p className="text-white">Rain saari teri khair manau</p><p className="text-white/40 mt-4">— Auto-synced • Hindi • Original motion picture soundtrack</p><p className="text-white/30 text-xs">Lyrics by JioSaavn • Sur Sangam</p></div></div>
                )}
                {showQueue && (
                  <div className="mt-8 glass rounded-[24px] p-6"><div className="flex items-center justify-between mb-4"><h3 className="font-bold">Up next</h3><button onClick={()=> setShowQueue(false)} className="text-sm text-white/60 hover:text-white">Close</button></div><div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">{queue.slice(currentIndex+1, currentIndex+6).map(t=> (<button key={t.id} onClick={()=>{ const idx=queue.findIndex(x=> String(x.id)===String(t.id)); setCurrentIndex(idx); setIsPlaying(true)}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 text-left"><img src={t.cover} alt="" className="w-11 h-11 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div><span className="text-xs text-white/40">{t.durationLabel}</span></button>))}</div></div>
                )}
              </div>
            </div>
          </div>}

          {current && showQueue && !showFull && (
            <div className="fixed inset-0 z-40"><div onClick={()=> setShowQueue(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm"/><div className="absolute bottom-[88px] right-4 left-4 lg:left-auto lg:right-6 w-auto lg:w-[380px] glass-strong rounded-[20px] p-4 max-h-[60vh] flex flex-col shadow-2xl"><div className="flex items-center justify-between mb-3"><h3 className="font-bold">Queue</h3><button onClick={()=> setShowQueue(false)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10"><CloseIcon/></button></div><div className="text-xs font-semibold tracking-widest text-white/40 mb-2">NOW PLAYING</div><div className="flex items-center gap-3 p-2 rounded-xl bg-white text-black mb-3"><img src={current.cover} alt="" className="w-11 h-11 rounded-lg object-cover"/><div className="min-w-0"><div className="text-sm font-semibold truncate">{current.title}</div><div className="text-xs text-black/60 truncate">{current.artist}</div></div><Equalizer dark/></div><div className="text-xs font-semibold tracking-widest text-white/40 mb-2">NEXT UP</div><div className="space-y-1 overflow-y-auto flex-1 pr-1">{queue.filter((_,i)=> i!==currentIndex).slice(0,6).map(t=> (<button key={t.id} onClick={()=>{ const idx=queue.findIndex(x=> String(x.id)===String(t.id)); setCurrentIndex(idx); setIsPlaying(true)}} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left"><img src={t.cover} alt="" className="w-10 h-10 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{t.title}</div><div className="text-xs text-white/50 truncate">{t.artist}</div></div><PlayMini/></button>))}</div><button onClick={()=>{ setShuffle(true); handleNext()}} className="mt-3 w-full py-2.5 rounded-full bg-white text-black text-sm font-bold">Shuffle play</button></div></div>
          )}

          {/* Modals */}
          {showAuth && (
            <div className="fixed inset-0 z-[70] grid place-items-center p-4"><div onClick={()=> setShowAuth(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-sm glass-strong rounded-[24px] p-6">
              <h3 className="text-lg font-bold">{authForm.mode==='login' ? "Welcome back" : "Create your account"}</h3>
              <p className="text-xs text-white/50 mt-1">{authForm.mode==='login' ? 'Sign in — liked songs + playlists cloud se sync honge.' : 'Naam + email se account — sab kuch MongoDB me save, device badlo, music saath.'}</p>
              {authForm.mode==='signup' && <input autoFocus value={authForm.name} onChange={e=> setAuthForm({...authForm, name:e.target.value})} placeholder="Naam" className="mt-4 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30"/>}
              <input type="email" value={authForm.email} onChange={e=> setAuthForm({...authForm, email:e.target.value})} placeholder="email@example.com" className={`${authForm.mode==='login'?'mt-4':''} mt-2 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30`}/>
              <input type="password" value={authForm.password} onChange={e=> setAuthForm({...authForm, password:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter') handleAuthSubmit() }} placeholder="Password (min 6)" className="mt-2 w-full h-11 px-4 rounded-full bg-white/10 border border-white/10 outline-none placeholder:text-white/30"/>
              <button onClick={handleAuthSubmit} disabled={authBusy} className="mt-4 w-full py-2.5 rounded-full bg-[#D5AA55] text-black font-bold disabled:opacity-50">{authBusy ? 'Connecting…' : (authForm.mode==='login' ? 'Sign in ☁' : 'Create account ☁')}</button>
              <button onClick={()=> setAuthForm({...authForm, mode: authForm.mode==='login'?'signup':'login'})} className="mt-3 w-full text-xs text-white/60 hover:text-white">{authForm.mode==='login' ? 'Naya account chahiye? Sign up' : 'Pehle se account hai? Sign in'}</button>
            </div></div>
          )}
          {showCreatePl && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4"><div onClick={()=> setShowCreatePl(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-md glass-strong rounded-[24px] p-6"><h3 className="text-lg font-bold">Create playlist</h3><p className="text-sm text-white/60 mt-1">Give your playlist a name — you can add songs later from Search or Library.</p><input autoFocus value={newPlName} onChange={e=> setNewPlName(e.target.value)} placeholder="My Playlist #1" className="mt-4 w-full h-11 px-4 rounded-full bg-white text-black placeholder:text-black/40 outline-none"/><div className="flex gap-2 mt-4"><button onClick={()=> setShowCreatePl(false)} className="flex-1 py-2.5 rounded-full bg-white/10 border border-white/10 font-semibold">Cancel</button><button onClick={handleCreatePlaylist} className="flex-1 py-2.5 rounded-full bg-white text-black font-bold">Create</button></div></div></div>
          )}
          {showAddToPl && (
            <div className="fixed inset-0 z-50 grid place-items-center p-4"><div onClick={()=> setShowAddToPl(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"/><div className="relative w-full max-w-md glass-strong rounded-[24px] p-6 max-h-[80vh] flex flex-col"><h3 className="font-bold">Add to playlist</h3><p className="text-sm text-white/60 truncate">"{showAddToPl.title}" • {showAddToPl.artist}</p><div className="mt-4 space-y-2 overflow-y-auto flex-1 pr-1">{playlists.map(pl=> (<button key={pl.id} onClick={()=> handleAddToPlaylist(pl.id, showAddToPl)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/10 text-left"><img src={pl.cover} alt="" className="w-12 h-12 rounded-lg object-cover"/><div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{pl.title}</div><div className="text-xs text-white/50">{pl.count}</div></div><PlusIcon/></button>))}<button onClick={()=>{ setShowCreatePl(true); setShowAddToPl(null)}} className="w-full mt-2 py-3 rounded-xl border-2 border-dashed border-white/15 text-sm font-semibold hover:bg-white/5">+ New Playlist</button></div><button onClick={()=> setShowAddToPl(null)} className="mt-4 w-full py-2.5 rounded-full bg-white/10 border border-white/10">Close</button></div></div>
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
                    { id:'free', name:'Free', price:'₹0', feats:['Shuffle play','Ads between songs','Online only'], cta:'Current plan', active: user.plan==='Free' },
                    { id:'monthly', name:'Premium Monthly', price:'₹119/mo', feats:['Ad-free','Offline downloads (10k songs)','High quality 320kbps','Real-time lyrics'], cta:'Try 1 month free', active: user.plan==='Premium', highlight:true },
                    { id:'yearly', name:'Premium Yearly', price:'₹999/year', feats:['Save 30%','All Premium features','Family sharing (6)','Early access'], cta:'Choose Yearly', active:false },
                  ].map(p=> (
                    <div key={p.id} className={`p-4 rounded-2xl border-2 ${p.highlight? 'bg-white text-black border-white':'bg-white/5 border-white/10 text-white'} ${p.active? 'ring-2 ring-emerald-400':''}`}>
                      <div className="flex items-center justify-between"><div className="font-bold">{p.name} {p.highlight && <span className="ml-2 text-xs bg-black text-white px-2 py-0.5 rounded-full">POPULAR</span>}</div><div className="font-bold">{p.price}</div></div>
                      <ul className="mt-3 space-y-1 text-sm">
                        {p.feats.map(f=> <li key={f} className="flex gap-2"><span className={p.highlight? 'text-emerald-600':'text-emerald-400'}>✓</span>{f}</li>)}
                      </ul>
                      <button onClick={()=>{ if(p.id==='free') setShowSubscribe(false); else { setUser(u=> ({...u, plan:'Premium'})); setShowSubscribe(false); showToast(`Premium activated — ${p.name} ✓`)} }} className={`mt-4 w-full py-2.5 rounded-full font-bold ${p.highlight? 'bg-black text-white': p.active? 'bg-white/10 text-white border border-white/20':'bg-white text-black'}`}>{p.active? 'Active ✓': p.cta}</button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/40 mt-4 text-center">Mock subscription — locally saved (no payment). For real Uptodown publish, integrate Razorpay / Google Play Billing.</p>
              </div>
            </div>
          )}

          {toast && <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-white text-black px-5 py-2.5 rounded-full text-sm font-semibold shadow-xl">{toast}</div>}

          <nav className="lg:hidden fixed bottom-[84px] left-3 right-3 z-30">
            <div className="glass-strong rounded-full px-2 py-2 flex items-center justify-around shadow-xl">
              {[
                { id:'home', label:'Home', icon:HomeIcon },
                { id:'search', label:'Search', icon:SearchIcon },
                { id:'library', label:'Library', icon:LibraryIcon },
                { id:'profile', label:'You', icon:ProfileIcon },
              ].map(item=> (
                <button key={item.id} onClick={()=> setNav(item.id)} className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-full transition ${nav===item.id? 'bg-white text-black':'text-white/60'}`}><item.icon active={nav===item.id} size={20}/><span className="text-[11px] font-semibold">{item.label}</span></button>
              ))}
            </div>
          </nav>
        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

function ProfileView({ user, setUser, editUser, setEditUser, liked, playlists, localSongs, downloaded, showToast, authUser, onSignIn, onSignOut, onDeleteAccount }){
  const [tab, setTab] = useState("Overview")
  const isEditing = !!editUser
  const startEdit = ()=> setEditUser({...user})
  const saveEdit = ()=>{ const u = {...editUser}; if(!u.avatar) u.avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name||'Sur Sangam')}&radius=50`; setUser(u); setEditUser(null); showToast("Profile updated ✓") }
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="relative rounded-[32px] overflow-hidden glass p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#6A418E]/30 via-[#A154D6]/20 to-[#C35445]/20"/>
        <div className="relative flex flex-col md:flex-row gap-6">
          <div className="relative shrink-0">
            <img src={user.avatar} alt="" className="w-28 h-28 rounded-[24px] object-cover border-4 border-white/10 shadow-xl"/>
            <button onClick={startEdit} className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white text-black grid place-items-center shadow-lg border"><PlusIcon/></button>
          </div>
          <div className="flex-1 min-w-0">
            {!isEditing ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h1 className="text-2xl font-bold font-display">{user.name}</h1><p className="text-sm text-white/60">{user.email} • <span className="text-[#D5AA55] font-semibold">{user.plan} Plan</span></p><p className="text-sm text-white/70 mt-2 leading-relaxed max-w-xl">{user.bio}</p></div>
                  <button onClick={startEdit} className="px-5 py-2 rounded-full bg-white text-black text-sm font-bold">Edit Profile</button>
                </div>
                <div className="flex gap-6 mt-5">
                  <div><div className="text-xl font-bold">{user.followers}</div><div className="text-xs text-white/50">Followers</div></div>
                  <div><div className="text-xl font-bold">{user.following}</div><div className="text-xs text-white/50">Following</div></div>
                  <div><div className="text-xl font-bold">{playlists.length}</div><div className="text-xs text-white/50">Playlists</div></div>
                  <div><div className="text-xl font-bold">{downloaded.length}</div><div className="text-xs text-white/50">Offline</div></div>
                </div>
                {authUser ? (
                  <div className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 max-w-md">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-[#D5AA55] text-black grid place-items-center text-sm font-bold">☁</span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{authUser.email}</div><div className="text-xs text-white/50">Cloud sync ON — liked + playlists MongoDB me save ho rahe hain</div></div>
                    <button onClick={onSignOut} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10 hover:bg-white/15 shrink-0">Sign out</button>
                  </div>
                ) : (
                  <div className="mt-4 max-w-md"><button onClick={onSignIn} className="w-full py-2.5 rounded-full bg-[#D5AA55] text-black text-sm font-bold flex items-center justify-center gap-2">☁ Sign in / Create account — <span className="font-medium opacity-80">liked songs + playlists har device par</span></button></div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <h3 className="font-bold">Edit Profile</h3>
                <input value={editUser.name} onChange={e=> setEditUser({...editUser, name:e.target.value})} placeholder="Name" className="w-full h-10 rounded-full px-4 bg-white text-black outline-none"/>
                <input value={editUser.email} onChange={e=> setEditUser({...editUser, email:e.target.value})} placeholder="Email" className="w-full h-10 rounded-full px-4 bg-white text-black outline-none"/>
                <input value={editUser.avatar} onChange={e=> setEditUser({...editUser, avatar:e.target.value})} placeholder="Avatar URL (ya upload karo)" className="w-full h-10 rounded-full px-4 bg-white/10 border border-white/10 text-white outline-none"/>
                <div className="flex gap-2">
                  <label className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-center text-sm font-semibold cursor-pointer hover:bg-white/15"><input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=> setEditUser({...editUser, avatar: String(rd.result)}); rd.readAsDataURL(f) }}/>⬆ Upload photo</label>
                  <button type="button" onClick={()=> setEditUser({...editUser, avatar: '' })} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 text-sm font-semibold">✖ Remove</button>
                </div>
                <textarea value={editUser.bio} onChange={e=> setEditUser({...editUser, bio:e.target.value})} placeholder="Bio" rows={2} className="w-full rounded-2xl p-3 bg-white/10 border border-white/10 outline-none resize-none"/>
                <div className="flex gap-2"><button onClick={()=> setEditUser(null)} className="flex-1 py-2 rounded-full bg-white/10 border border-white/10 font-semibold">Cancel</button><button onClick={saveEdit} className="flex-1 py-2 rounded-full bg-white text-black font-bold">Save</button></div>
              </div>
            )}
          </div>
        </div>
        <div className="relative mt-6 flex gap-2 overflow-x-auto scrollbar-none">
          {["Overview","Playlists","Listening","Settings"].map(t=> (
            <button key={t} onClick={()=> setTab(t)} className={`px-4 py-1.5 rounded-full text-sm font-medium border shrink-0 ${tab===t? 'bg-white text-black border-white':'bg-white/10 border-white/10 text-white/70'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab==="Overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass rounded-[24px] p-5">
            <h3 className="font-bold mb-3">Listening Stats</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-white/60">Minutes streamed</span><span className="font-bold">12,430</span></div>
              <div className="flex justify-between"><span className="text-white/60">Top genre</span><span className="font-bold">Bollywood • Arijit</span></div>
              <div className="flex justify-between"><span className="text-white/60">Liked songs</span><span className="font-bold">{liked.size}</span></div>
              <div className="flex justify-between"><span className="text-white/60">Offline songs</span><span className="font-bold">{downloaded.length}</span></div>
              <div className="flex justify-between"><span className="text-white/60">Local files</span><span className="font-bold">{localSongs.length}</span></div>
            </div>
            <div className="mt-4 p-3 rounded-2xl bg-white text-black text-sm"><span className="font-bold">Backend Live:</span> localStorage + IndexedDB + iTunes/Saavn APIs</div>
          </div>
          <div className="glass rounded-[24px] p-5">
            <h3 className="font-bold mb-3">Recent Playlists</h3>
            <div className="space-y-2">
              {playlists.slice(0,3).map(pl=> (
                <div key={pl.id} className="flex gap-3 items-center p-2 rounded-xl hover:bg-white/5"><img src={pl.cover} alt="" className="w-12 h-12 rounded-lg object-cover"/><div><div className="text-sm font-semibold">{pl.title}</div><div className="text-xs text-white/50">{pl.count}</div></div></div>
              ))}
              {playlists.length===0 && <div className="text-sm text-white/50">No playlists yet</div>}
            </div>
            <button onClick={()=> showToast("Share profile • Coming soon")} className="mt-4 w-full py-2 rounded-full bg-white text-black text-sm font-bold">Share Profile</button>
          </div>
        </div>
      )}
      {tab==="Settings" && (
        <div className="glass rounded-[24px] p-5 space-y-3">
          <h3 className="font-bold">Settings</h3>
          {[
            { k:"Online music", v:"JioSaavn + YouTube — full length" },
            { k:"Offline Mode", v: downloaded.length>0? `${downloaded.length} songs saved offline`:"Abhi 0 downloads" },
            { k:"Cloud sync", v: authUser? `ON — ${authUser.email}`:"Off — sign in karo" },
          ].map(s=> (
            <div key={s.k} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"><div><div className="text-sm font-medium">{s.k}</div><div className="text-xs text-white/50">{s.v}</div></div>{s.k==="Cloud sync" ? (authUser? <button onClick={onSignOut} className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/10">Sign out</button> : <button onClick={onSignIn} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#D5AA55] text-black">Sign in</button>) : <span className="text-xs text-emerald-400">●</span>}</div>
          ))}
          {authUser && <button onClick={onDeleteAccount} className="w-full mt-1 py-3 rounded-full bg-[#C35445]/15 text-[#C35445] border border-[#C35445]/30 text-sm font-bold">Delete cloud account (likes + playlists from server)</button>}
          <button onClick={()=>{ localStorage.clear(); indexedDB.deleteDatabase('sur_sangam_db'); showToast("Data cleared — refresh"); setTimeout(()=> location.reload(),800)}} className="w-full mt-2 py-3 rounded-full bg-[#C35445] text-white text-sm font-bold">Clear All Data (Reset Backend)</button>
        </div>
      )}
      {tab!=="Overview" && tab!=="Settings" && <div className="glass rounded-[24px] p-10 text-center text-white/50">More stats coming soon — backend ready!</div>}
    </div>
  )
}

/* Icons */
function HomeIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={active?"currentColor":"none"} stroke="currentColor" strokeWidth={active?0:1.8}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function SearchIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.8}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> }
function LibraryIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2.2:1.8}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> }
function ProfileIcon({ active, size=18 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active?2:1.7}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function PlayIcon({ dark, large }){ const s=large?28:20; return <svg width={s} height={s} viewBox="0 0 24 24" fill={dark?"black":"white"}><path d="M8 5.14v14l11-7z"/></svg> }
function PauseIcon({ dark, large }){ const s=large?28:20; return <svg width={s} height={s} viewBox="0 0 24 24" fill={dark?"black":"white"}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> }
function PlayMini({ dark, size=16 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={dark?"white":"black"}><path d="M8 5.14v14l11-7z"/></svg> }
function PauseMini({ dark, size=16 }){ return <svg width={size} height={size} viewBox="0 0 24 24" fill={dark?"black":"white"}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> }
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
