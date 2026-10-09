package com.sursangam.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

  private Intent pending = null;

  private boolean resumed() {
    try {
      Activity a = getActivity();
      return a != null && a.isResumed();
    } catch (Exception e) { return false; }
  }

  // Resumed → start as FOREGROUND service (background protection).
  // Not resumed (e.g. permission dialog showing) → plain startService — legal from
  // background, and a plain start never owes the system a startForeground() call, so
  // nothing can be posted back to crash us. The real FGS start replays on next resume.
  private void dispatch(Intent i) {
    if (resumed()) {
      try {
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
        else getContext().startService(i);
        pending = null;
        return;
      } catch (Throwable ignored) {}
    }
    pending = i;
    try { getContext().startService(i); } catch (Throwable ignored) {}
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    Intent i = pending;
    if (i != null && resumed()) {
      pending = null;
      try {
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
        else getContext().startService(i);
      } catch (Throwable ignored) {}
    }
  }

  private void startService(String action) {
    Intent i = new Intent(getContext(), NowPlayingService.class);
    if (action != null) i.setAction(action);
    dispatch(i);
  }

  @PluginMethod
  public void start(PluginCall call) {
    NowPlayingService.listener = action -> {
      JSObject ret = new JSObject();
      try { ret.put("action", action); } catch (Exception ignored) {}
      notifyListeners("mediaAction", ret);
    };
    startService(NowPlayingService.ACTION_UPDATE);
    call.resolve();
  }

  @PluginMethod
  public void update(PluginCall call) {
    Intent i = new Intent(getContext(), NowPlayingService.class);
    i.setAction(NowPlayingService.ACTION_UPDATE);
    i.putExtra("title", call.getString("title", "Sur Sangam"));
    i.putExtra("artist", call.getString("artist", ""));
    i.putExtra("album", call.getString("album", ""));
    i.putExtra("playing", "playing".equals(call.getString("state", "paused")));
    i.putExtra("artUrl", call.getString("artUrl", ""));
    dispatch(i);
    call.resolve();
  }

  @PluginMethod
  public void ping(PluginCall call) {
    JSObject r = new JSObject();
    try {
      r.put("ok", true);
      r.put("service", NowPlayingService.instance != null);
      boolean g = true;
      if (Build.VERSION.SDK_INT >= 33)
        g = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
      r.put("notif", g);
    } catch (Exception ignored) {}
    call.resolve(r);
  }

  @PluginMethod
  public void hasNotifPerm(PluginCall call) {
    JSObject r = new JSObject();
    boolean g = true;
    try {
      if (Build.VERSION.SDK_INT >= 33)
        g = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    } catch (Exception ignored) {}
    try { r.put("granted", g); } catch (Exception ignored) {}
    call.resolve(r);
  }

  @PluginMethod
  public void askNotifPerm(PluginCall call) {
    try {
      if (Build.VERSION.SDK_INT >= 33 && getActivity() != null)
        ActivityCompat.requestPermissions(getActivity(),
            new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 102);
    } catch (Exception ignored) {}
    hasNotifPerm(call);
  }

  @PluginMethod
  public void openNotifSettings(PluginCall call) {
    try {
      Intent i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
      i.putExtra("android.provider.extra.APP_PACKAGE", getContext().getPackageName());
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
    } catch (Exception e) {
      try {
        Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        i.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
      } catch (Exception ignored) {}
    }
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    try { getContext().stopService(new Intent(getContext(), NowPlayingService.class)); } catch (Exception ignored) {}
    call.resolve();
  }

  @Override
  protected void handleOnDestroy() {
    super.handleOnDestroy();
    if (NowPlayingService.listener != null) NowPlayingService.listener = null;
  }
}
