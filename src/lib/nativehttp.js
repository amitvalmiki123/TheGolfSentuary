// Native HTTP via CapacitorHttp — bypasses WebView CORS entirely (native sockets have
// no origin checks) while keeping the phone's trusted mobile/India IP. In a plain
// browser (no native bridge) CapacitorHttp falls back to fetch — same as before.
import { CapacitorHttp } from '@capacitor/core'

export function canNativeHttp(){
  try{
    const c = window.Capacitor
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
  }catch(e){ return false }
}

// GET/POST JSON, native when possible. Throws on non-2xx / non-JSON / timeout.
export async function nativeJson({ url, method='GET', headers={}, body=null, timeout=15000 }){
  const res = await CapacitorHttp.request({
    url, method,
    headers: { 'Accept':'application/json', ...headers },
    data: (body == null) ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    connectTimeout: Math.min(timeout, 10000),
    readTimeout: timeout,
  })
  const st = (res && res.status) || 0
  let data = res ? res.data : null
  if(typeof data === 'string'){
    const t = data.trim()
    try{ data = JSON.parse(t.startsWith('{') || t.startsWith('[') ? t : t.slice(t.indexOf('{') >= 0 ? t.indexOf('{') : 0)) }
    catch(e){ throw new Error('non-json ' + st) }
  }
  if(st < 200 || st >= 300) throw new Error('http ' + st)
  if(data == null) throw new Error('empty-body')
  return data
}
