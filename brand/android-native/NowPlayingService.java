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
      });
      audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    } catch (Exception e) {
      // NEVER take the whole app down from a service
      try { stopSelf(); } catch (Exception ignored) {}
    }
  }

  private void send(String a) {
    ActionListener l = listener;
    if (l != null) { try { l.onAction(a); } catch (Exception ignored) {} }
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
    mediaSession.setMetadata(mb.build());
    mediaSession.setPlaybackState(new PlaybackState.Builder()
      .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
        | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
      .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
      .build());
    } catch (Exception ignored) {}
  }

  private static int piFlags() {
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) flags |= 0x40000000; // FLAG_IMMUTABLE
    return flags;
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
    setWake(false);
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
