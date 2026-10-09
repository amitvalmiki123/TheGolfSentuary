import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { isNativeApp } from './lib/nowplaying.js'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA service worker: browsers only — Capacitor WebView serves assets itself and SW
// registration there fails ('Failed to register a ServiceWorker' error).
if(typeof navigator!=='undefined' && 'serviceWorker' in navigator && !isNativeApp()){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{}) })
}
