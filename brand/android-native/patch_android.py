#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: MainActivity registration, manifest
permissions + service, androidx.media dependency. Idempotent."""
import re, sys, os

BASE = os.path.join('android', 'app', 'src', 'main')
PKG  = os.path.join(BASE, 'java', 'com', 'sursangam', 'app')

def log(msg): print('[patch_android]', msg)

# 1. MainActivity — deterministic full rewrite: register plugin + ask POST_NOTIFICATIONS (Android 13+)
mfa = os.path.join(PKG, 'MainActivity.java')
MAIN = """package com.sursangam.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Official Capacitor pattern: register BEFORE super.onCreate so the WebView bridge
        // advertises the plugin in its header list at page load (late registration = JS calls vanish).
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                   != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 101);
        }
        // Start the NowPlaying foreground service with the app itself — background playback
        // no longer depends on any JS call arriving in time.
        try {
            Intent i = new Intent(this, NowPlayingService.class);
            i.setAction(NowPlayingService.ACTION_UPDATE);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
            else startService(i);
        } catch (Exception ignored) {}
    }
}
"""
if os.path.exists(mfa):
    open(mfa, 'w').write(MAIN)
    log('MainActivity written (plugin + notif permission)')
else:
    log('WARN: MainActivity.java missing'); sys.exit(1)

# 2. Manifest — permissions + service declaration
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

# 3. (no androidx deps needed — NowPlayingService uses framework APIs only)
log('OK')
