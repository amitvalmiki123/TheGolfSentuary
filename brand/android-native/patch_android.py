#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: MainActivity registration (+guarded service
autostart), manifest permissions + service. Idempotent."""
import os, sys

def log(msg): print('[patch_android]', msg)

BASE = os.path.join('android', 'app', 'src', 'main')
PKG  = os.path.join(BASE, 'java', 'com', 'sursangam', 'app')

MAIN = """package com.sursangam.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NowPlayingPlugin.class); // official pattern: before super.onCreate
        super.onCreate(savedInstanceState);
        try {
            if (Build.VERSION.SDK_INT >= 33
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                       != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 101);
            }
        } catch (Exception ignored) {}
        // Start NowPlaying service only AFTER the window is drawn — starting an FGS in the
        // same moment the runtime-permission dialog dismisses can throw SecurityException on
        // Android 13/14 and crash the process. Fully guarded: the app must NEVER die for this.
        try {
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override public void run() {
                    try {
                        Intent i = new Intent(MainActivity.this, NowPlayingService.class);
                        i.setAction(NowPlayingService.ACTION_UPDATE);
                        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
                        else startService(i);
                    } catch (Exception ignored) {}
                }
            }, 1400);
        } catch (Exception ignored) {}
    }
}
"""

mfa = os.path.join(PKG, 'MainActivity.java')
if os.path.exists(mfa):
    open(mfa, 'w').write(MAIN)
    log('MainActivity written (plugin + notif permission + guarded FGS autostart)')
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
