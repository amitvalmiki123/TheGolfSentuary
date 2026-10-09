#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: MainActivity (crash-guarded) + manifest
permissions/service. Idempotent."""
import os, sys

def log(msg): print('[patch_android]', msg)

BASE = os.path.join('android', 'app', 'src', 'main')
PKG  = os.path.join(BASE, 'java', 'com', 'sursangam', 'app')

MAIN = """package com.sursangam.app;

import android.Manifest;
import android.app.Application;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Systemic protection: ForegroundService-related exceptions are posted to the main
    // thread by the system and bypass ordinary try/catch — they were killing the whole app.
    // Swallow ONLY those (stop the helper service, in-app playback keeps working) and
    // forward every other crash normally.
    private static void installFgsGuard(final Application app) {
        final Thread.UncaughtExceptionHandler orig = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                Throwable c = e;
                while (c != null) {
                    String n = String.valueOf(c.getClass().getName()) + " " + String.valueOf(c.getMessage());
                    if (n.contains("ForegroundService") || n.contains("startForeground")
                        || n.contains("ServiceStartNotAllowed")) {
                        try { app.stopService(new Intent(app, NowPlayingService.class)); } catch (Throwable ignored) {}
                        return; // app survives
                    }
                    c = c.getCause();
                }
                if (orig != null) orig.uncaughtException(t, e);
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try { installFgsGuard(getApplication()); } catch (Throwable ignored) {}
        registerPlugin(NowPlayingPlugin.class); // builder-based; safe before super (verified in Capacitor src)
        super.onCreate(savedInstanceState);
        try {
            if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                       != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 101);
            }
        } catch (Exception ignored) {}
        // NOTE: deliberately NO foreground-service autostart here. Starting an FGS while the
        // runtime-permission dialog has the app paused throws
        // ForegroundServiceStartNotAllowedException (posted to main thread, uncatchable) and
        // crashed the app. The plugin starts the service from PLAY actions instead, when the
        // activity is resumed — and falls back to a plain startService otherwise.
    }
}
"""

mfa = os.path.join(PKG, 'MainActivity.java')
if os.path.exists(mfa):
    open(mfa, 'w').write(MAIN)
    log('MainActivity written (FGS crash-guard + plugin registration + notif permission)')
else:
    log('WARN: MainActivity.java missing'); sys.exit(1)

# Manifest — permissions + service declaration
mf = os.path.join(BASE, 'AndroidManifest.xml')
if os.path.exists(mf):
    s = open(mf).read()
    if 'FOREGROUND_SERVICE_MEDIA_PLAYBACK' not in s:
        perms = ('<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n'
                 '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />\n'
                 '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
                 '    <uses-permission android:name="android.permission.WAKE_LOCK" />')
        anchor = '<uses-permission android:name="android.permission.INTERNET" />'
        if anchor in s:
            s = s.replace(anchor, anchor + '\n    ' + perms, 1)
        else:
            s = s.replace('<application', perms + '\n\n    <application', 1)
    if 'NowPlayingService' not in s:
        s = s.replace('</application>',
            '<service\n        android:name=".NowPlayingService"\n'
            '        android:foregroundServiceType="mediaPlayback"\n'
            '        android:exported="false"\n'
            '        android:stopWithTask="false" />\n    </application>', 1)
    open(mf, 'w').write(s)
    log('Manifest patched')

log('OK')
