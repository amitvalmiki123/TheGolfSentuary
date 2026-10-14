import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'

const release=parse(readFileSync('.github/workflows/android.yml','utf8'))
const substitute=script=>script.replace(/\$\{\{.*?\}\}/g,'fixture')

test('both workflow YAML files parse and every run block passes bash -n',()=>{
  for(const file of ['.github/workflows/android.yml','.github/workflows/native-check.yml']){
    const workflow=parse(readFileSync(file,'utf8'))
    for(const job of Object.values(workflow.jobs)) for(const step of job.steps){
      if(step.run) execFileSync('bash',['-n'],{ input:substitute(step.run) })
    }
  }
})

test('R2 mirror silently skips with absent or partial secrets',()=>{
  const step=release.jobs.build.steps.find(s=>s.id==='mirror')
  for(const account of ['', 'partial-account']){
    const result=execFileSync('bash',['-e'],{ input:substitute(step.run), env:{ ...process.env,
      R2_ACCOUNT_ID:account, AWS_ACCESS_KEY_ID:'', AWS_SECRET_ACCESS_KEY:'', R2_BUCKET:'', R2_PUBLIC_BASE:'' } })
    assert.equal(result.toString(),'')
  }
})

test('real workflow feed writer passes through optional mirror only when present',()=>{
  const script=release.jobs.build.steps.find(s=>s.name?.startsWith('Bump docs/version.json')).run
  const python=substitute(script.split("<<'PYEOF'\n")[1].split('\nPYEOF')[0])
  const tmp=mkdtempSync(path.join(os.tmpdir(),'apk-feed-'))
  try {
    mkdirSync(path.join(tmp,'docs'))
    for(const mirror of ['', 'https://mirror.example/updates/MaxMusic.apk']){
      execFileSync('python3',['-','1.0.0','129','["raw commit"]','["Curated feature"]',mirror],{ input:python, cwd:tmp })
      const feed=JSON.parse(readFileSync(path.join(tmp,'docs/version.json'),'utf8'))
      assert.equal(feed.build,129)
      assert.equal(feed.apk_mirror,mirror || undefined)
      assert.deepEqual(feed.notes,['Curated feature'])
      assert.match(feed.apk,/v1\.0\.0-b129\/MaxMusic\.apk$/)
    }
  } finally { rmSync(tmp,{ recursive:true, force:true }) }
})
