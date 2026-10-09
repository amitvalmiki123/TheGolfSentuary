#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: crash-reporting MainActivity, manifest
permissions + service. Idempotent."""
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
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Crash telemetry + selective survival:
    // 1) ANY uncaught exception is written to filesDir/crash.txt (shown in-app on next launch).
    // 2) ForegroundService-class system exceptions are swallowed AFTER recording (ordinary
    //    try/catch cannot see them — the main thread re-posts them) — app survives.
    // 3) Everything else is recorded, then reported normally.
    private static void installCrashReporter(final Application app) {
        final Thread.UncaughtExceptionHandler orig = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                String trace = Log.getStackTraceString(e);
                try {
                    java.io.File dir = (app == null) ? null : app.getFilesDir();
                    if (dir != null) {
                        java.io.FileWriter w = new java.io.FileWriter(new java.io.File(dir, "crash.txt"));
                        w.write("API=" + Build.VERSION.SDK_INT + " MODEL=" + Build.MANUFACTURER + "/" + Build.MODEL + "\\n" + trace);
                        w.close();
                    }
                } catch (Throwable ignored) {}
                Throwable c = e; boolean fgs = false;
                while (c != null) {
                    String n = String.valueOf(c.getClass().getName()) + " " + String.valueOf(c.getMessage());
                    if (n.contains("ForegroundService") || n.contains("startForeground")
                        || n.contains("ServiceStartNotAllowed")) { fgs = true; break; }
                    c = c.getCause();
                }
                if (fgs) {
                    try { if (app != null) app.stopService(new Intent(app, NowPlayingService.class)); } catch (Throwable ignored) {}
                    return; // keep the app alive
                }
                if (orig != null) orig.uncaughtException(t, e);
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try { installCrashReporter(getApplication()); } catch (Throwable ignored) {}
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                       != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 101);
            }
        } catch (Exception ignored) {}
    }
}
"""

mfa = os.path.join(PKG, 'MainActivity.java')
if os.path.exists(mfa):
    open(mfa, 'w').write(MAIN)
    log('MainActivity written (crash reporter + plugin + notif permission)')
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
