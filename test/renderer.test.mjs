import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Flock,seededRandom} from '../flock.mjs';
import {renderScene,makeCamera,flightPose} from '../renderer.mjs';

// Keep the historical fixture as a sizing reference. Near-threat trajectories
// intentionally change now that the user has requested anticipatory avoidance.
test('population scaling retains the c49cd89 sizes at all reference viewports',async()=>{
  const reference=JSON.parse(await readFile(new URL('./fixtures/c49cd89-flight.json',import.meta.url),'utf8'));
  for(const scenario of reference.cases){
    const f=new Flock(scenario.width,scenario.height,scenario.count,seededRandom(scenario.seed));
    for(const sample of scenario.samples)assert.equal(f.scale,sample.scale);
  }
});

test('rendering either view leaves movement, bird order, and original size untouched',()=>{
  let drawingCalls=0;
  const ctx=new Proxy({}, {get(_target,key){
    if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
    return (...args)=>{drawingCalls++;for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg));};
  }});
  for(const count of [12,48,300]){
    const f=new Flock(1100,470,count,seededRandom(7));
    for(let i=0;i<120;i++)f.step(1/120);
    const before=JSON.stringify(f),birds=f.birds.slice(),camera=makeCamera(f);
    for(const perspective of [true,false,true])renderScene(ctx,f,perspective);
    assert.equal(JSON.stringify(f),before,'the renderer must not change physics or scale');
    f.birds.forEach((b,i)=>assert.equal(b,birds[i]));
    for(let i=0;i<120;i++)f.step(1/120);
    assert.deepEqual(makeCamera(f),camera,'the camera must not chase the flock');
    if(count<=48)assert.equal(f.scale,1,'use the original full-size birds');
  }
  assert.ok(drawingCalls>0);
});

test('3D bank follows turning direction and increases with speed, without steering birds',()=>{
  const f=new Flock(1100,470,1,seededRandom(3)),bird=f.birds[0];
  const straight=flightPose({...bird,turn:0},1);
  const left=flightPose({...bird,turn:-.5,speed:42},1);
  const right=flightPose({...bird,turn:.5,speed:42},1);
  const faster=flightPose({...bird,turn:.5,speed:84},1);
  assert.equal(Math.abs(straight.bank),0);
  assert.ok(left.bank>0&&right.bank<0);
  assert.ok(Math.abs(faster.bank)>Math.abs(right.bank));
  assert.ok(Math.abs(faster.bank)<=.65);
});


test('GPU geometry and articulated transforms retain scale and never steer the flock',async()=>{
  const {createBirdGeometry,birdMatrices,articulatedPose}=await import('../bird-model.mjs');
  const f=new Flock(1100,470,48,seededRandom(5));
  const before=JSON.stringify(f),parts=createBirdGeometry();
  assert.equal(Object.keys(parts).length,8,'body, tail and three joints per wing');
  for(const g of Object.values(parts)){
    assert.ok(g.getAttribute('position').count>50);
    for(const x of g.getAttribute('normal').array)assert.ok(Number.isFinite(x));
  }
  const b=f.birds[0],first=birdMatrices(b,0,1,550,235);
  const half=birdMatrices(b,0,.5,550,235);
  assert.equal(first.body.elements[12],b.x-550);
  assert.equal(first.body.elements[13],235-b.y);
  for(const name of Object.keys(parts)){
    assert.ok(first[name].elements.every(Number.isFinite));
    assert.ok(Math.abs(half[name].determinant()/first[name].determinant()-.125)<1e-8);
  }
  const p=articulatedPose({...b,wingPhase:1.2,catchingUp:true},0);
  assert.notEqual(p.shoulder,p.elbow);assert.notEqual(p.elbow,p.wrist);
  assert.equal(JSON.stringify(f),before);
  for(const g of Object.values(parts))g.dispose();
});
