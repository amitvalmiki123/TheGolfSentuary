#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: crash-reporting MainActivity, manifest
permissions + service. Idempotent."""
import os, sys, shutil
import xml.etree.ElementTree as ET

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

    // Exposed for NowPlayingService's zero-bridge eval channel (read app state / heartbeat).
    public static volatile android.webkit.WebView npWebView;

    private void bindNpWebView() {
        try { android.webkit.WebView w = getBridge().getWebView(); if (w != null) { npWebView = w; return; } } catch (Throwable ignored) {}
        // Fallback: the bridge may fail to expose its view — the ACTUAL on-screen WebView is
        // authoritative for the zero-bridge eval channel, so find it in the view tree.
        try { npWebView = findWV(findViewById(android.R.id.content)); } catch (Throwable ignored) {}
    }

    private static android.webkit.WebView findWV(android.view.View v) {
        if (v == null) return null;
        if (v instanceof android.webkit.WebView) return (android.webkit.WebView) v;
        if (v instanceof android.view.ViewGroup) {
            android.view.ViewGroup g = (android.view.ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                android.webkit.WebView w = findWV(g.getChildAt(i));
                if (w != null) return w;
            }
        }
        return null;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try { installCrashReporter(getApplication()); } catch (Throwable ignored) {}
        registerPlugin(NowPlayingPlugin.class);
        registerPlugin(ApkDownloaderPlugin.class);
        super.onCreate(savedInstanceState);
        bindNpWebView();
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() { bindNpWebView(); }
        }, 1600);
        // Plain startService ONLY (no FGS obligation → cannot crash the process). The service
        // itself calls startForeground inside try/catch — while the app is foreground this is
        // always permitted, so the media notification + bg protection exist from app launch.
        try {
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override public void run() {
                    try {
                        Intent i = new Intent(MainActivity.this, NowPlayingService.class);
                        i.setAction(NowPlayingService.ACTION_UPDATE);
                        startService(i);
                    } catch (Throwable ignored) {}
                }
            }, 700);
        } catch (Throwable ignored) {}
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
                 '    <uses-permission android:name="android.permission.WAKE_LOCK" />\n'
                '    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />')
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
            '        android:stopWithTask="true" />\n    </application>', 1)
    open(mf, 'w').write(s)
    log('Manifest patched')

# Capacitor already supplies a FileProvider in fresh projects. Reuse it rather
# than declaring another provider with the same authority.
shutil.copyfile(os.path.join(os.path.dirname(__file__), 'ApkDownloaderPlugin.java'),
                os.path.join(PKG, 'ApkDownloaderPlugin.java'))
NS = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', NS)
def attr(name): return '{' + NS + '}' + name
tree = ET.parse(mf)
root = tree.getroot()
if not any(p.get(attr('name')) == 'android.permission.REQUEST_INSTALL_PACKAGES'
           for p in root.findall('uses-permission')):
    ET.SubElement(root, 'uses-permission', {attr('name'): 'android.permission.REQUEST_INSTALL_PACKAGES'})
app = root.find('application')
providers = [p for p in app.findall('provider')
             if p.get(attr('authorities')) == '${applicationId}.fileprovider']
provider = providers[0] if providers else ET.SubElement(app, 'provider')
for duplicate in providers[1:]: app.remove(duplicate)
provider.set(attr('name'), 'androidx.core.content.FileProvider')
provider.set(attr('authorities'), '${applicationId}.fileprovider')
provider.set(attr('exported'), 'false')
provider.set(attr('grantUriPermissions'), 'true')
metadata = next((m for m in provider.findall('meta-data')
                 if m.get(attr('name')) == 'android.support.FILE_PROVIDER_PATHS'), None)
if metadata is None: metadata = ET.SubElement(provider, 'meta-data')
metadata.set(attr('name'), 'android.support.FILE_PROVIDER_PATHS')
metadata.set(attr('resource'), '@xml/file_paths')
ET.indent(tree, space='    ')
tree.write(mf, encoding='utf-8', xml_declaration=True)
paths_file = os.path.join(BASE, 'res', 'xml', 'file_paths.xml')
os.makedirs(os.path.dirname(paths_file), exist_ok=True)
paths = ET.parse(paths_file) if os.path.exists(paths_file) else ET.ElementTree(ET.Element('paths'))
if not any(p.tag == 'cache-path' and p.get('name') == 'updates' for p in paths.getroot()):
    ET.SubElement(paths.getroot(), 'cache-path', {'name': 'updates', 'path': 'updates/'})
ET.indent(paths, space='    ')
paths.write(paths_file, encoding='utf-8', xml_declaration=True)
log('OK (APK plugin + install permission + FileProvider)')
