#!/usr/bin/env python3
"""Patches the CI-generated android/ project (fresh from `cap add android`) to wire
the NowPlaying foreground-service plugin: MainActivity registration, manifest
permissions + service, androidx.media dependency. Idempotent."""
import re, sys, os

BASE = os.path.join('android', 'app', 'src', 'main')
PKG  = os.path.join(BASE, 'java', 'com', 'sursangam', 'app')

def log(msg): print('[patch_android]', msg)

# 1. MainActivity — register plugin
mfa = os.path.join(PKG, 'MainActivity.java')
if os.path.exists(mfa):
    s = open(mfa).read()
    if 'registerPlugin' not in s:
        if 'super.onCreate(savedInstanceState)' in s:
            s = s.replace('super.onCreate(savedInstanceState);',
                'super.onCreate(savedInstanceState);\n        this.bridge.registerPlugin(NowPlayingPlugin.class);', 1)
        else:
            # empty class body template: public class MainActivity extends BridgeActivity {}
            s2 = re.sub(r'public class MainActivity extends BridgeActivity\s*\{\s*\}',
                'public class MainActivity extends BridgeActivity {\n'
                '    @Override\n'
                '    public void onCreate(android.os.Bundle savedInstanceState) {\n'
                '        super.onCreate(savedInstanceState);\n'
                '        this.bridge.registerPlugin(NowPlayingPlugin.class);\n'
                '    }\n'
                '}', s)
            if s2 == s:
                log('WARN: MainActivity pattern not matched'); sys.exit(1)
            s = s2
        if 'import com.getcapacitor.BridgeActivity;' in s and 'import android.os.Bundle;' not in s and 'android.os.Bundle' not in s.split('import com.getcapacitor')[0]:
            s = s.replace('import com.getcapacitor.BridgeActivity;',
                          'import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;', 1)
        open(mfa, 'w').write(s)
        log('MainActivity patched')
else:
    log('WARN: MainActivity.java missing'); sys.exit(1)

# 2. Manifest — permissions + service declaration
mf = os.path.join(BASE, 'AndroidManifest.xml')
if os.path.exists(mf):
    s = open(mf).read()
    if 'FOREGROUND_SERVICE_MEDIA_PLAYBACK' not in s:
        perms = ('<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n'
                 '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />\n'
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

# 3. app/build.gradle — androidx.media (MediaStyle notification support)
gb = os.path.join('android', 'app', 'build.gradle')
if os.path.exists(gb):
    s = open(gb).read()
    if 'androidx.media:media' not in s:
        if 'dependencies {' in s:
            s = s.replace('dependencies {', "dependencies {\n    implementation 'androidx.media:media:1.6.0'", 1)
            open(gb, 'w').write(s)
            log('build.gradle patched')
        else:
            log('WARN: dependencies block missing'); sys.exit(1)
log('OK')
