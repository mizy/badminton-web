/** Exercise the exported clips through real training input and match playback. */
import assert from 'node:assert/strict'
import {mkdir, writeFile} from 'node:fs/promises'
import puppeteer from 'puppeteer-core'

const output = '.workbuddy/video-game'
await mkdir(output, {recursive:true})
const browser = await puppeteer.connect({browserURL:process.env.CDP_URL ?? 'http://127.0.0.1:9222'})
const context = await browser.createBrowserContext()
try {
  const results=[]
  for (const mobile of [false,true]) {
    const page=await context.newPage(), errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',message=>{if(message.type()==='error') errors.push(message.text())})
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`)})
    await page.setViewport(mobile?{width:393,height:852,isMobile:true,hasTouch:true}:{width:1440,height:900})
    await page.bringToFront()
    await page.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:3000',{waitUntil:'networkidle0'})
    await page.evaluate(async()=>{
      const path=performance.getEntriesByType('resource').find(entry=>/\/three\.js(?:\?|$)/.test(entry.name)).name
      const THREE=await import(path)
      const update=THREE.Scene.prototype.updateMatrixWorld
      THREE.Scene.prototype.updateMatrixWorld=function(...args){window.__gameScene=this;return update.apply(this,args)}
      window.__videoActions=[];window.__videoSamples=[]
      const play=THREE.AnimationAction.prototype.play
      THREE.AnimationAction.prototype.play=function(...args){window.__videoActions.push(this.getClip().name);return play.apply(this,args)}
      function sample(){
        const player=window.__gameScene?.children.filter(node=>node.name==='player')[0]
        if(player?.getObjectByName('RightFoot')){
          const position=name=>player.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray()
          const state=window.__badminton__.getState()
          window.__videoSamples.push({time:performance.now(),elapsed:state.elapsed,footwork:state.players[0].movement.footwork,action:window.__videoActions.at(-1),root:player.position.toArray(),game:state.players[0].pos,
            feet:[position('RightFoot'),position('LeftFoot')], knees:[position('RightLeg'),position('LeftLeg')], hips:[position('RightUpLeg'),position('LeftUpLeg')]})
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    for(const point of ['front-left','front-right','mid-left','mid-right','back-left','back-right']){
      await page.click('[data-ui="start-training"]')
      await page.waitForFunction(()=>window.__gameScene?.children.filter(node=>node.name==='player').every(node=>node.getObjectByName('player-model')))
      await page.evaluate(()=>{window.__videoSamples=[]})
      const x=point.startsWith('front')?1:point.startsWith('back')?-1:0,z=point.endsWith('left')?-1:1
      const keys=[x>0?'w':x<0?'s':'',z>0?'d':'a'].filter(Boolean)
      let touch
      if(mobile){
        const center=await page.$eval('[data-touch="stick"]',node=>{const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})
        touch=await page.touchscreen.touchStart(center.x,center.y);await touch.move(center.x+z*65,center.y-x*65)
      }else for(const key of keys)await page.keyboard.down(key)
      await page.waitForFunction(expected=>window.__badminton__.getState().players[0].movement.footworkPoint===expected,{timeout:5000},point)
      await new Promise(resolve=>setTimeout(resolve,800))
      await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-${point}.png`})
      if(mobile)await touch.end();else for(const key of keys)await page.keyboard.up(key)
      await new Promise(resolve=>setTimeout(resolve,700))
      const samples=await page.evaluate(()=>window.__videoSamples)
      await writeFile(`${output}/${mobile?'mobile':'desktop'}-${point}.json`,JSON.stringify(samples))
      assert.ok(samples.length>15)
      const heights=samples.flatMap(sample=>sample.feet.map(foot=>foot[1]))
      const lengths=[0,1].flatMap(i=>[
        samples.map(sample=>Math.hypot(...sample.knees[i].map((v,j)=>v-sample.feet[i][j]))),
        samples.map(sample=>Math.hypot(...sample.hips[i].map((v,j)=>v-sample.knees[i][j]))),
      ])
      assert.ok(heights.every(Number.isFinite))
      assert.ok(Math.min(...heights)>-0.005,`${point}: feet below floor`)
      assert.ok(Math.max(...heights)>0.12,`${point}: feet never lift`)
      for(const values of lengths)assert.ok(Math.max(...values)-Math.min(...values)<0.00001,`${point}: bone length changed`)
      assert.ok(samples.every(sample=>sample.root.every((v,i)=>Math.abs(v-sample.game[i])<0.00001)),`${point}: animation moved gameplay root`)
      let slip=0, jump=0, footSpeed=0
      for(let frame=1;frame<samples.length;frame++){
        if(samples[frame].time-samples[frame-1].time>80)continue
        for(let i=0;i<2;i++){
          const a=samples[frame-1].feet[i],b=samples[frame].feet[i]
          const distance=Math.hypot(...b.map((v,j)=>v-a[j]));jump=Math.max(jump,distance)
          const elapsed=samples[frame].elapsed-samples[frame-1].elapsed
          if(elapsed>0)footSpeed=Math.max(footSpeed,distance/elapsed)
          if(a[1]<0.091&&b[1]<0.091)slip=Math.max(slip,Math.hypot(b[0]-a[0],b[2]-a[2]))
        }
      }
      assert.ok(footSpeed<10.1,`${point}: foot teleported at ${footSpeed} m/s`)
      results.push({mobile,point,frames:samples.length,min:Math.min(...heights),lift:Math.max(...heights)-0.09,slip,jump,footSpeed})
      if(mobile)await page.click('[data-touch="action"]');else await page.keyboard.press('Escape')
      await page.click('[data-ui="return-menu"]')
    }
    const actions=await page.evaluate(()=>[...new Set(window.__videoActions)])
    for(const id of ['ready-start','cross-approach','front-forehand','front-backhand','rear-forehand','rear-backhand','forehand-recover','backhand-recover'])assert.ok(actions.includes(id),`${mobile?'mobile':'desktop'}: clip ${id} never played`)
    await page.click('[data-ui="start-match"]')
    if(mobile)await page.click('[data-touch="shot"][data-direction="up"]');else await page.keyboard.press('j')
    await page.waitForFunction(()=>window.__badminton__.getState().shuttle!==null,{timeout:5000})
    await new Promise(resolve=>setTimeout(resolve,2500))
    assert.ok(await page.evaluate(()=>window.__badminton__.getState().players.every(player=>player.pos.every(Number.isFinite))))
    await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-match.png`})
    assert.deepEqual(errors,[])
    await page.close()
  }
  // A failed optional clip request must not prevent the avatar or game loading.
  const fallback=await context.newPage(), fallbackErrors=[], warnings=[]
  fallback.on('pageerror',error=>fallbackErrors.push(error.message))
  fallback.on('console',message=>{if(message.type()==='warn')warnings.push(message.text())})
  await fallback.setRequestInterception(true)
  fallback.on('request',request=>request.url().endsWith('/mocap/video-poses/clips.json')
    ? request.respond({status:404,body:'Missing motion library'}) : request.continue())
  await fallback.setViewport({width:1200,height:760})
  await fallback.bringToFront()
  await fallback.goto(process.env.PLAY_URL ?? 'http://127.0.0.1:3000',{waitUntil:'networkidle0'})
  await fallback.click('[data-ui="start-match"]')
  await fallback.keyboard.press('j')
  await fallback.waitForFunction(()=>window.__badminton__.getState().shuttle!==null)
  assert.ok(warnings.some(message=>message.includes('视频动作加载失败')))
  assert.deepEqual(fallbackErrors,[])
  await fallback.close()
  await writeFile(`${output}/acceptance.json`,JSON.stringify(results,null,2))
  console.log(results)
}finally{await context.close();await browser.disconnect()}
