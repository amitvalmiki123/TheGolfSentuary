package com.sursangam.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

// (framework-only: no androidx.media / NotificationCompat needed)

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Foreground service: keeps Sur Sangam audio alive when the app is backgrounded/locked
 * and publishes MediaStyle notification + lock-screen controls (prev / play-pause / next).
 */
public class NowPlayingService extends Service {
  public static final String CHANNEL = "sur_now_playing";
  public static final int NOTIF_ID = 4201;
  public static final String ACTION_UPDATE = "sur.np.UPDATE";
  public static final String ACTION_PLAY   = "sur.np.PLAY";
  public static final String ACTION_PAUSE  = "sur.np.PAUSE";
  public static final String ACTION_PREV   = "sur.np.PREV";
  public static final String ACTION_NEXT   = "sur.np.NEXT";
  public static final String ACTION_STOP   = "sur.np.STOP";

  private final android.os.Handler mTick = new android.os.Handler(android.os.Looper.getMainLooper());
  private final Runnable mTickRun = new Runnable() {
    @Override public void run() { tick(); mTick.postDelayed(this, 1200); }
  };

  // Zero-bridge metadata channel: read the app's playback state straight out of the WebView.
  private void tick() {
    try {
      final android.webkit.WebView w = MainActivity.npWebView;
      if (w == null) return;
      // ---- PRIMARY zero-bridge channel: app writes document.title = "NP|<playing>|<title>|<artist>"
      try {
        String tt = w.getTitle();
        if (tt != null && tt.startsWith("NP|")) {
          String[] p = tt.split("\\|", 4);
          if (p.length >= 4) {
            boolean pl = "1".equals(p[1]);
            String t = p[2].trim(); String a = p[3].trim();
            boolean changed = !t.equals(title) || !a.equals(artist) || pl != playing;
            if (!t.isEmpty()) title = t;
            if (!a.isEmpty()) artist = a;
            playing = pl;
            if (changed) { posSec = 0; durSec = 0; updateSession(); startForegroundNow(); }
            setWake(playing);
          }
        }
      } catch (Exception ignored) {}
      // ---- SECONDARY: richer fields (album/cover) via eval; keep-alive nudge; heartbeat
      w.evaluateJavascript(
        "(function(){try{var n=window.__np||{};return JSON.stringify({t:n.title||'',a:n.artist||'',al:n.album||'',p:!!n.playing,art:n.artUrl||'',e:n.engine||''})}catch(e){return '{}'}})()",
        new android.webkit.ValueCallback<String>() {
          @Override public void onReceiveValue(String raw) {
            try {
              String j = raw == null ? "{}" : raw;
              if (j.length() > 1 && j.charAt(0) == '"') j = j.substring(1, j.length() - 1);
              j = j.replace("\\\"", "\"").replace("\\/", "/");
              org.json.JSONObject o = new org.json.JSONObject(j);
              String al = o.optString("al");
              String art = o.optString("art");
              String t = o.optString("t");
              if (!t.isEmpty()) { String a = o.optString("a"); boolean pl = o.optBoolean("p");
                boolean changed = !t.equals(title) || pl != playing;
                title = t; if (!a.isEmpty()) artist = a; album = al; playing = pl;
                if (changed) { posSec = 0; durSec = 0; updateSession(); startForegroundNow(); }
                setWake(playing);
              }
              if (!art.isEmpty() && !art.equals(artUrlLoaded)) loadArt(art);
            } catch (Exception ignored) {}
          }
        });
      if (playing) {
        // THE background-audio trick (classic Cordova/WebView music-app fix): Android/Chromium
        // suspends the media pipeline + throttles timers when the Activity goes hidden — the
        // WebView itself never learns that unless asked. Calling onResume()/resumeTimers()
        // from the service every tick keeps the renderer treating playback as foreground:
        // audio keeps decoding (frames are simply dropped, there is no surface). Then the JS
        // keep-alive re-asserts the YouTube player if its iframe visibility policy paused it.
        try { w.resumeTimers(); } catch (Throwable ignored) {}
        try { w.onResume(); } catch (Throwable ignored) {}
        try { w.evaluateJavascript("try{window.__npKeepAlive&&window.__npKeepAlive()}catch(e){}", null); } catch (Throwable ignored) {}
      }
      // ---- position/duration for the notification seekbar (audio-engine tracks carry
      // currentTime on the single <audio> element; YT-iframe tracks report 0|0 = no bar)
      try {
        w.evaluateJavascript("(function(){try{var a=document.querySelector('audio');if(!a)return'';var d=a.duration;return (a.currentTime||0)+'|'+(isFinite(d)?d:0)}catch(e){return''}})()",
          new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String raw) {
              try {
                String s = raw == null ? "" : raw.trim();
                if (s.length() > 1 && s.charAt(0) == '"') s = s.substring(1, s.length() - 1);
                String[] pp = s.split("\\|");
                if (pp.length < 2) return;
                double np = Double.parseDouble(pp[0]); double nd = Double.parseDouble(pp[1]);
                boolean pc = Math.abs(np - posSec) > 2.0;
                boolean dc = Math.abs(nd - durSec) > 1.0;
                posSec = np; durSec = nd;
                if ((pc || dc) && durSec > 0) updateSession();
              } catch (Exception ignored) {}
            }
          });
      } catch (Throwable ignored) {}
      // ---- heartbeat for the in-app card (hidden #__svc div; title stays owned by the app)
      String info = "tick " + (playing ? "PLAYING" : "paused") + " | " + js(title) + " | " + js(artist)
        + (lastBuildErr.length() > 0 ? " | E:" + js(crop(lastBuildErr, 24)) : "");
      try {
        w.evaluateJavascript("try{var d=document.getElementById('__svc');if(!d){d=document.createElement('div');d.id='__svc';d.style.display='none';document.body.appendChild(d)}d.textContent='" + info + "'}catch(e){}", null);
      } catch (Throwable ignored) {}
    } catch (Throwable ignored) {}
  }

  private static String js(String x) {
    if (x == null) return "";
    return x.replace("\\", " ").replace("'", " ").replace("\"", " ").replace("\n", " ").replace("\r", " ").replace("<", "(").replace(">", ")");
  }
  private static String crop(String x, int n) { return x == null ? "" : (x.length() <= n ? x : x.substring(0, n)); }


  public interface ActionListener { void onAction(String action); }
  public static volatile ActionListener listener;
  public static volatile NowPlayingService instance;

  private MediaSession mediaSession;
  private AudioManager audioManager;
  private AudioFocusRequest focusRequest;

  private android.os.PowerManager.WakeLock wakeLock;
  private volatile Bitmap art;
  private volatile String artUrlLoaded = "";
  private volatile String title = "Sur Sangam";
  private volatile String artist = "Music";
  private volatile String album = "";
  private volatile boolean playing = false;
  private volatile double posSec = 0;
  private volatile double durSec = 0;
  public static volatile String lastBuildErr = "";

  // One-line self-report surfaced all the way to the in-app status card (no adb needed).
  public static String diag() {
    NowPlayingService sv = instance;
    if (sv == null) return "service OFF" + (lastBuildErr.isEmpty()?"":(" | " + lastBuildErr));
    return "on | title=" + (sv.title.length() > 26 ? sv.title.substring(0,26) : sv.title)
      + " | playing=" + sv.playing + " | session=" + (sv.mediaSession != null)
      + (lastBuildErr.isEmpty() ? "" : " | " + lastBuildErr);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      instance = this;
      createChannel();
      mediaSession = new MediaSession(this, "sur-sangam");
      mediaSession.setActive(true);
      mediaSession.setCallback(new MediaSession.Callback() {
        @Override public void onPlay()              { send("play"); }
        @Override public void onPause()             { send("pause"); }
        @Override public void onSkipToNext()        { send("next"); }
        @Override public void onSkipToPrevious()    { send("prev"); }
        @Override public void onSeekTo(long pos) { seekTo(pos); }
      });
      audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
      mTick.postDelayed(mTickRun, 1500);
    } catch (Exception e) {
      // NEVER take the whole app down from a service
      try { stopSelf(); } catch (Exception ignored) {}
    }
  }

  private void send(String a) {
    ActionListener l = listener;
    if (l != null) { try { l.onAction(a); } catch (Exception ignored) {} }
    // Zero-bridge path: talk straight to the page. Notification buttons keep working even
    // if the Capacitor plugin/bridge never initialized.
    try {
      android.webkit.WebView w = MainActivity.npWebView;
      if (w != null && ("play".equals(a) || "pause".equals(a) || "next".equals(a) || "prev".equals(a) || "stop".equals(a)))
        w.evaluateJavascript("try{window.__npAct&&window.__npAct('" + a + "')}catch(e){}", null);
    } catch (Throwable ignored) {}
  }

  // Notification/lockscreen seekbar drag → seek the WebView player (audio or YT iframe).
  private void seekTo(long posMs) {
    try {
      android.webkit.WebView w = MainActivity.npWebView;
      if (w != null) w.evaluateJavascript("try{window.__npSeek&&window.__npSeek(" + (posMs/1000.0) + ")}catch(e){}", null);
      posSec = posMs/1000.0;
      updateSession();
    } catch (Throwable ignored) {}
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    try { return handleStart(intent); }
    catch (Exception e) {
      try { stopSelf(); } catch (Exception ignored) {}
      return START_NOT_STICKY;
    }
  }

  private int handleStart(Intent intent) {
    String a = (intent == null) ? null : intent.getAction();
    if (ACTION_STOP.equals(a)) {
      send("stop");
      setWake(false);
      stopSelf();
      return START_NOT_STICKY;
    }
    // Notification buttons land here as plain startService intents — without these,
    // prev/play/next taps fell through to the generic update path and did NOTHING.
    if (ACTION_PLAY.equals(a))  { playing = true;  send("play");  updateSession(); startForegroundNow(); return START_NOT_STICKY; }
    if (ACTION_PAUSE.equals(a)) { playing = false; send("pause"); updateSession(); startForegroundNow(); return START_NOT_STICKY; }
    if (ACTION_PREV.equals(a))  { send("prev"); return START_NOT_STICKY; }
    if (ACTION_NEXT.equals(a))  { send("next"); return START_NOT_STICKY; }
    if (intent != null) {
      String t = intent.getStringExtra("title");   if (t != null) title = t;
      String s = intent.getStringExtra("artist");   if (s != null) artist = s;
      String m = intent.getStringExtra("album");    if (m != null) album = m;
      playing = intent.getBooleanExtra("playing", playing);
      String url = intent.getStringExtra("artUrl");
      if (url != null && !url.isEmpty() && !url.equals(artUrlLoaded)) loadArt(url);
    }
    updateSession();
    startForegroundNow();
    handleFocus();
    setWake(playing);
    // NOT_STICKY: when the user swipes the app away from recents the notification
    // must die with it (explicit requirement) — no zombie placeholder allowed.
    return START_NOT_STICKY;
  }

  private void setWake(boolean on) {
    try {
      android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
      if (pm == null) return;
      if (on) {
        if (wakeLock == null) wakeLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "sur:play");
        if (!wakeLock.isHeld()) wakeLock.acquire(10 * 60 * 60 * 1000L);
      } else if (wakeLock != null && wakeLock.isHeld()) {
        wakeLock.release();
      }
    } catch (Exception ignored) {}
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CHANNEL, "Now playing", NotificationManager_LOW());
      ch.setShowBadge(false);
      ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      getSystemService(android.app.NotificationManager.class).createNotificationChannel(ch);
    }
  }
  private int NotificationManager_LOW() { return android.app.NotificationManager.IMPORTANCE_LOW; }

  private void handleFocus() {
    // CRITICAL: the service NEVER requests audio focus. The real players (<audio> / YouTube
    // iframe in Chromium) own system focus; when the service also grabbed it, the WebView's
    // request caused us AUDIOFOCUS_LOSS -> send("pause") -> JS paused the song seconds after
    // every play. Notification/session only — focus stays entirely with the WebView.
    if (audioManager == null) return;
    if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
      try { audioManager.abandonAudioFocusRequest(focusRequest); } catch (Exception ignored) {}
      focusRequest = null;
    }
  }

  private void updateSession() {
    if (mediaSession == null) return;
    try {
    MediaMetadata.Builder mb = new MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, title)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
      .putString(MediaMetadata.METADATA_KEY_ALBUM, album.isEmpty() ? artist : album);
    if (art != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
    if (durSec > 0) mb.putLong(MediaMetadata.METADATA_KEY_DURATION, (long)(durSec * 1000));
    mediaSession.setMetadata(mb.build());
    long posMs = durSec > 0 ? (long)(posSec * 1000) : PlaybackState.PLAYBACK_POSITION_UNKNOWN;
    mediaSession.setPlaybackState(new PlaybackState.Builder()
      .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO)
      .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
        posMs, 1f, SystemClock.elapsedRealtime())
      .build());
    } catch (Exception ignored) {}
  }

  private static int piFlags() {
    // 0x04000000 == FLAG_IMMUTABLE (1<<26). The previous 0x40000000 was FLAG_ONE_SHOT —
    // wrong bit: immutability was never declared, so Android 12+ threw IllegalArgumentException
    // inside every buildNotification → silent fallback to the minimal placeholder notification.
    return PendingIntent.FLAG_UPDATE_CURRENT | 0x04000000;
  }

  private PendingIntent bcast(String action) {
    Intent i = new Intent(this, NowPlayingService.class);
    i.setAction(action);
    return PendingIntent.getService(this, action.hashCode(), i, piFlags());
  }

  private PendingIntent openApp() {
    Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (i == null) i = new Intent(this, MainActivity.class);
    i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return PendingIntent.getActivity(this, 0, i, piFlags());
  }

  private Notification buildNotification() {
    int playIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
    String sub = artist + (album.isEmpty() || album.equals(artist) ? "" : " \u2022 " + album);
    Notification.Builder b = (Build.VERSION.SDK_INT >= 26)
      ? new Notification.Builder(this, CHANNEL)
      : new Notification.Builder(this);
    b.setSmallIcon(getDrawableId())
      .setContentTitle(title)
      .setContentText(sub)
      .setContentIntent(openApp())
      .setDeleteIntent(bcast(ACTION_STOP))
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(playing)
      .setPriority(Notification.PRIORITY_LOW)
      .addAction(android.R.drawable.ic_media_previous, "Previous", bcast(ACTION_PREV))
      .addAction(playIcon, playing ? "Pause" : "Play", bcast(playing ? ACTION_PAUSE : ACTION_PLAY))
      .addAction(android.R.drawable.ic_media_next, "Next", bcast(ACTION_NEXT));
    if (art != null) b.setLargeIcon(art);
    if (mediaSession != null) {
      Notification.MediaStyle style = new Notification.MediaStyle()
        .setMediaSession(mediaSession.getSessionToken())
        .setShowActionsInCompactView(0, 1, 2);
      b.setStyle(style);
    }
    if (Build.VERSION.SDK_INT >= 26) {
      b.setColor(0xFFD5AA55);
    }
    return (Build.VERSION.SDK_INT >= 26) ? b.build() : b.getNotification();
  }

  private int getDrawableId() {
    int id = getResources().getIdentifier("ic_stat_music", "drawable", getPackageName());
    return id != 0 ? id : android.R.drawable.ic_media_play;
  }

  private void startForegroundNow() {
    // IMPORTANT: service is started via plain startService() (no FGS obligation anywhere),
    // so every failure path here is 100% non-fatal: worst case we stopSelf() and the app
    // keeps working exactly as before — no system-posted async crash is possible.
    // Always foreground while the app runs (ongoing flag only while playing). This keeps the
    // process non-cached → WebView timers keep ticking → playback/watchdog survive minimize/lock.
    Notification n;
    try { n = buildNotification(); }
    catch (Exception e) {
      lastBuildErr = "notif: " + e;
      n = buildMinimal();
    }
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
      } else {
        startForeground(NOTIF_ID, n);
      }
    } catch (Exception e1) {
      lastBuildErr = "fgs: " + e1;
      try { startForeground(NOTIF_ID, buildMinimal()); }
      catch (Exception e2) { lastBuildErr = "fgs2: " + e2; try { stopSelf(); } catch (Exception ignored) {} }
    }
  }

  private Notification buildMinimal() {
    Notification.Builder b = (Build.VERSION.SDK_INT >= 26)
      ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    b.setSmallIcon(getDrawableId()).setContentTitle("Sur Sangam").setContentText("Music")
     .setOngoing(false).setVisibility(Notification.VISIBILITY_PUBLIC);
    return (Build.VERSION.SDK_INT >= 26) ? b.build() : b.getNotification();
  }

  private void loadArt(final String url) {
    artUrlLoaded = url;
    new Thread(() -> {
      HttpURLConnection c = null;
      try {
        c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(4000);
        c.setReadTimeout(4000);
        c.setInstanceFollowRedirects(true);
        c.connect();
        InputStream in = c.getInputStream();
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeStream(in, null, opts);
        in.close();
        int sample = 1;
        while (opts.outWidth / sample > 512) sample *= 2;
        c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(4000);
        c.setReadTimeout(4000);
        c.connect();
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeStream(c.getInputStream(), null, o2);
        if (bmp != null) {
          art = bmp;
          new Handler(Looper.getMainLooper()).post(() -> { updateSession(); startForegroundNow(); });
        }
      } catch (Exception ignored) {
      } finally {
        if (c != null) { try { c.disconnect(); } catch (Exception ignored) {} }
      }
    }).start();
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    // App swiped away from recents → full stop: cancel media notification, let JS know.
    try { send("stop"); } catch (Exception ignored) {}
    try { stopSelf(); } catch (Exception ignored) {}
    super.onTaskRemoved(rootIntent);
  }

  // Notification action button taps land here
  @Override
  public void onDestroy() {
    try { mTick.removeCallbacks(mTickRun); } catch (Exception ignored) {}
    setWake(false);
    try { MainActivity.npWebView.evaluateJavascript("try{document.title=document.title.replace(/^SVC\\|[^]*$/,'')}catch(e){}", null); } catch (Throwable ignored) {}
    try {
      android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
      if (nm != null) nm.cancel(NOTIF_ID);
    } catch (Exception ignored) {}
    try { if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE); else stopForeground(true); } catch (Exception ignored) {}
    if (mediaSession != null) { mediaSession.setActive(false); mediaSession.release(); }
    instance = null;
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}
