package com.sursangam.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

  private void startService(String action) {
    Intent i = new Intent(getContext(), NowPlayingService.class);
    if (action != null) i.setAction(action);
    try {
      if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
      else getContext().startService(i);
    } catch (Exception ignored) {}
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
    try {
      if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
      else getContext().startService(i);
    } catch (Exception ignored) {}
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
