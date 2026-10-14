package com.sursangam.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "ApkDownloader")
public class ApkDownloaderPlugin extends Plugin {
  private static final class Transfer {
    final AtomicBoolean cancelled = new AtomicBoolean(false);
    final File part;
    volatile HttpURLConnection connection;
    Transfer(File part) { this.part = part; }
  }
  private Transfer active;

  private File updates() { return new File(getContext().getCacheDir(), "updates"); }

  @PluginMethod
  public void ready(PluginCall call) {
    JSObject result = new JSObject();
    result.put("available", true);
    result.put("cacheDir", updates().getAbsolutePath());
    call.resolve(result);
  }

  @PluginMethod
  public void download(final PluginCall call) {
    final String address = call.getString("url", "");
    final String name = call.getString("fileName", "MaxMusic.apk");
    if (!name.matches("[A-Za-z0-9._-]+\\.apk") || name.contains("..")) {
      call.reject("Invalid APK file name"); return;
    }
    final File dir = updates();
    if (!dir.isDirectory() && !dir.mkdirs()) { call.reject("Cannot create update cache"); return; }
    final File target = new File(dir, name);
    final Transfer transfer = new Transfer(new File(dir, name + ".part"));
    synchronized (this) {
      if (active != null) { call.reject("A download is already running"); return; }
      active = transfer;
    }
    new Thread(() -> {
      JSObject result = null;
      Exception failure = null;
      try {
        URL url = new URL(address);
        // Explicit redirects: GitHub release assets redirect to a different host.
        for (int redirects = 0; ; redirects++) {
          if (transfer.cancelled.get()) throw new Exception("Download cancelled");
          if (!"https".equalsIgnoreCase(url.getProtocol())) throw new Exception("Only HTTPS APK URLs are allowed");
          final HttpURLConnection conn = (HttpURLConnection) url.openConnection();
          transfer.connection = conn;
          conn.setInstanceFollowRedirects(false);
          conn.setConnectTimeout(20000);
          conn.setReadTimeout(20000);
          conn.setRequestProperty("Accept-Encoding", "identity");
          final int status = conn.getResponseCode();
          if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
            final String location = conn.getHeaderField("Location");
            conn.disconnect();
            if (location == null || redirects >= 10) throw new Exception("Invalid or excessive redirects");
            url = new URL(url, location);
            continue;
          }
          if (status != 200) throw new Exception("Download failed: HTTP " + status);
          final long total = conn.getContentLengthLong();
          long received = 0;
          try (InputStream input = conn.getInputStream(); FileOutputStream output = new FileOutputStream(transfer.part)) {
            final byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) {
              if (transfer.cancelled.get()) throw new Exception("Download cancelled");
              output.write(buffer, 0, count);
              received += count;
              JSObject progress = new JSObject();
              progress.put("percent", total > 0 ? Math.min(99, (int) (received * 100 / total)) : -1);
              progress.put("received", received);
              progress.put("total", total);
              notifyListeners("progress", progress);
            }
            output.getFD().sync();
          }
          if (received == 0 || (total > 0 && received != total)) throw new Exception("Incomplete APK download");
          synchronized (this) {
            if (transfer.cancelled.get()) throw new Exception("Download cancelled");
            if (target.exists() && !target.delete()) throw new Exception("Cannot replace cached APK");
            if (!transfer.part.renameTo(target)) throw new Exception("Cannot finish APK download");
          }
          JSObject progress = new JSObject();
          progress.put("percent", 100); progress.put("received", received); progress.put("total", total);
          notifyListeners("progress", progress);
          result = new JSObject(); result.put("path", target.getAbsolutePath());
          break;
        }
      } catch (Exception e) { failure = e; }
      finally {
        if (transfer.connection != null) transfer.connection.disconnect();
        transfer.part.delete();
        synchronized (this) { if (active == transfer) active = null; }
      }
      if (failure != null) call.reject(transfer.cancelled.get() ? "Download cancelled" : failure.getMessage());
      else call.resolve(result);
    }, "apk-download").start();
  }

  @PluginMethod
  public synchronized void cancel(PluginCall call) {
    if (active != null) {
      active.cancelled.set(true);
      if (active.connection != null) active.connection.disconnect();
      active.part.delete();
    }
    call.resolve();
  }

  @PluginMethod
  public void install(PluginCall call) {
    try {
      final File file = new File(call.getString("path", "")).getCanonicalFile();
      if (!file.getParentFile().equals(updates().getCanonicalFile()) || !file.isFile() || !file.getName().endsWith(".apk")) {
        call.reject("Cached APK not found"); return;
      }
      final JSObject result = new JSObject();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
        final Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // A device without this settings activity still resolves, never crashes.
        try { getContext().startActivity(settings); } catch (Exception ignored) {}
        result.put("needsPermission", true);
        call.resolve(result); return;
      }
      final Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
      final Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      result.put("needsPermission", false);
      call.resolve(result);
    } catch (Exception e) { call.reject("Unable to open installer: " + e.getMessage()); }
  }

  @Override
  protected void handleOnDestroy() {
    synchronized (this) {
      if (active != null) {
        active.cancelled.set(true);
        if (active.connection != null) active.connection.disconnect();
        active.part.delete();
      }
    }
    super.handleOnDestroy();
  }
}
