import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

for(const existingProvider of [false, true]) test(`native patch is idempotent (existing FileProvider: ${existingProvider})`,()=>{
  const tmp=mkdtempSync(path.join(os.tmpdir(),'apk-native-patch-'))
  const base=path.join(tmp,'android/app/src/main')
  try {
    mkdirSync(path.join(base,'java/com/sursangam/app'),{ recursive:true })
    writeFileSync(path.join(base,'java/com/sursangam/app/MainActivity.java'),'placeholder')
    writeFileSync(path.join(base,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>${existingProvider ? '<provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths"/></provider>' : ''}</application><uses-permission android:name="android.permission.INTERNET" /></manifest>`)
    const patch=()=>execFileSync('python3',[path.resolve('brand/android-native/patch_android.py')],{ cwd:tmp })
    patch()
    const files=['AndroidManifest.xml','res/xml/file_paths.xml','java/com/sursangam/app/MainActivity.java','java/com/sursangam/app/ApkDownloaderPlugin.java']
    const first=files.map(f=>readFileSync(path.join(base,f),'utf8'))
    patch()
    assert.deepEqual(files.map(f=>readFileSync(path.join(base,f),'utf8')),first)
    assert.equal((first[0].match(/<provider /g)||[]).length,1)
    assert.equal((first[0].match(/REQUEST_INSTALL_PACKAGES/g)||[]).length,1)
    assert.equal((first[2].match(/registerPlugin\(ApkDownloaderPlugin.class\)/g)||[]).length,1)
    assert.match(first[0],/\$\{applicationId\}\.fileprovider/)
    assert.match(first[1],/<cache-path name="updates" path="updates\/"/)
  } finally { rmSync(tmp,{ recursive:true, force:true }) }
})
