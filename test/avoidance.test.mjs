import test from 'node:test';
import assert from 'node:assert/strict';
import {Flock,seededRandom,CRUISE_SPEED,MARGIN} from '../flock.mjs';
const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function place(b,x,y,angle,speed){Object.assign(b,{x,y,angle,speed,turn:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed});}
function observe(f,seconds){
  let slowed=false,turned=false,firstYield=Infinity,minSpeed=Infinity,minGap=Infinity;
  for(let i=0;i<seconds*120;i++){
    const before=f.birds.map(b=>({...b}));f.step(1/120);
    for(let j=0;j<f.birds.length;j++){
      const b=f.birds[j],old=before[j],displacement=Math.hypot(b.x-old.x,b.y-old.y);
      assert.ok(Math.hypot(b.x-old.x-b.vx/120,b.y-old.y-b.vy/120)<1e-7,'approach must not need position projection or a wall clamp');
      assert.ok(Math.abs(difference(b.angle,old.angle))<=2.1*Math.sqrt(f.cruiseSpeed/42)/120+1e-8,'no heading snap');
      assert.ok(Math.abs(b.turn-old.turn)<=9/120+1e-8,'turn acceleration is bounded');
      assert.ok(b.speed>=old.speed-85/120-1e-8&&b.speed<=old.speed+65/120+1e-8,'no speed snap');
      assert.ok(displacement>0,'bird keeps moving');
      minSpeed=Math.min(minSpeed,b.speed);slowed ||= b.speed<old.speed-.001;turned ||= Math.abs(b.turn)>.2;
      if(b.safetyRisk>.01)firstYield=Math.min(firstYield,f.time);
    }
    minGap=Math.min(minGap,f.minimumDistance());
  }
  return {slowed,turned,firstYield,minSpeed,minGap};
}

test('predicted head-on, crossing, and fast catch-up paths steer clear before contact',()=>{
  for(const speed of [42,105])for(const kind of ['head-on','crossing','catchup']){
    const f=new Flock(2000,1200,2,seededRandom(17));f.setSpeed(speed/42);f.cruiseSpeed=speed;
    const gap=speed*1.6+30;
    place(f.birds[0],900,600,0,kind==='catchup'?speed*1.7:speed);
    place(f.birds[1],900+gap,kind==='crossing'?600-gap:600,kind==='head-on'?Math.PI:kind==='crossing'?Math.PI/2:0,speed);
    const result=observe(f,8);
    assert.ok(result.slowed&&result.turned,`${kind} at ${speed}: slow and turn smoothly`);
    assert.ok(result.minGap>f.minDistance,`${kind}: full clearance without contact solver`);
    assert.ok(result.firstYield<1,`${kind}: anticipate the encounter`);
  }
});

test('all four walls and corner approaches slow and turn without stopping',()=>{
  for(const speed of [16.8,42,105])for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,-Math.PI/2]){
    const f=new Flock(800,600,1,seededRandom(3));f.setSpeed(speed/42);f.cruiseSpeed=speed;
    // Begin inside the reaction zone, with room for a banked turn.
    const b=f.birds[0],dx=Math.cos(angle),dy=Math.sin(angle),distance=45+speed*.65;
    place(b,dx>.1?800-MARGIN-distance:dx<-.1?MARGIN+distance:400,
      dy>.1?600-MARGIN-distance:dy<-.1?MARGIN+distance:300,angle,speed);
    const result=observe(f,6);
    assert.ok(result.turned);
    if(speed>=42)assert.ok(result.slowed,'approaching bird should ease its speed');
    assert.ok(result.minSpeed>speed*.4,'no stopping');
    assert.ok(b.x>MARGIN&&b.x<800-MARGIN&&b.y>MARGIN&&b.y<600-MARGIN);
  }
});

test('parallel neighbors with clear paths keep their cruise speed',()=>{
  const f=new Flock(2400,1600,2,seededRandom(1));
  place(f.birds[0],1000,700,0,CRUISE_SPEED);place(f.birds[1],1000,738,0,CRUISE_SPEED);
  observe(f,4);
  for(const b of f.birds){assert.equal(b.speed,CRUISE_SPEED);assert.equal(b.safetyRisk,0);}
});

test('a flock approaching the edges does not let neighbor avoidance trap birds at a wall',()=>{
  const f=new Flock(1100,470,48,seededRandom(42));
  const stalled=new Map();
  for(let frame=0;frame<60*120;frame++){
    const previous=f.birds.map(b=>[b.x,b.y]);f.step(1/120);
    f.birds.forEach((b,i)=>{
      const nearWall=Math.min(b.x-MARGIN,f.width-MARGIN-b.x,b.y-MARGIN,f.height-MARGIN-b.y)<2;
      const moving=Math.hypot(b.x-previous[i][0],b.y-previous[i][1])>b.speed/120*.15;
      const duration=nearWall&&!moving?(stalled.get(b.id)||0)+1:0;
      stalled.set(b.id,duration);
      assert.ok(duration<30,'nearby birds must not pin a bird against the boundary');
    });
  }
  f.measure();assert.equal(f.groups.length,1,'the flock still gathers after avoiding edges');
});
