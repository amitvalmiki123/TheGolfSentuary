#!/usr/bin/env python3
"""itrace-27: stable release signing for MaxMusic.

Reads env: APP_VERSION_CODE, APP_VERSION_NAME.
Expects android/app/maxmusic.p12 (PKCS12 keystore, restored by CI from secrets).
Patches android/app/build.gradle: versionCode/versionName + release signingConfig.
Fails LOUDLY if the keystore is missing (better than shipping mismatched signatures).
Idempotent.
"""
import os, sys

def log(m): print('[patch_signing]', m)

KS = os.path.join('android', 'app', 'maxmusic.p12')
if not os.path.exists(KS) or os.path.getsize(KS) == 0:
    print('::error::maxmusic.p12 missing — repo Settings → Secrets → Actions me 4 signing secrets add karo (SET_SECRETS_FIRST.md), phir Re-run.')
    sys.exit(2)

p = os.path.join('android', 'app', 'build.gradle')
s = open(p).read()
vc = os.environ.get('APP_VERSION_CODE', '1')
vn = os.environ.get('APP_VERSION_NAME', '1.0')

def rep(old, new, tag):
    global s
    assert s.count(old) == 1, f'{tag}: anchor not unique/found'
    s = s.replace(old, new, 1)

rep('        versionCode 1', f'        versionCode {vc}', 'versionCode')
rep('        versionName "1.0"', f'        versionName "{vn}"', 'versionName')
if 'signingConfigs' not in s:
    rep('    buildTypes {',
        '    signingConfigs {\n'
        '        release {\n'
        '            storeFile file("maxmusic.p12")\n'
        '            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")\n'
        '            keyAlias System.getenv("ANDROID_KEY_ALIAS")\n'
        '            keyPassword System.getenv("ANDROID_KEY_PASSWORD")\n'
        '            storeType "pkcs12"\n'
        '        }\n'
        '    }\n'
        '    buildTypes {', 'signingConfigs')
    rep('        release {\n            minifyEnabled false',
        '        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false', 'release-signing')
open(p, 'w').write(s)
log(f'OK versionCode={vc} versionName={vn} store=maxmusic.p12')
