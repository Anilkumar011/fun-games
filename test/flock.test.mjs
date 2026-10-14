import test from 'node:test';
import assert from 'node:assert/strict';
import { Flock, seededRandom, CRUISE_SPEED, CATCHUP_RATIO, MARGIN, capacityForViewport, parseCount } from '../flock.mjs';

function place(b,x,y,angle,speed=CRUISE_SPEED) {
  Object.assign(b,{x,y,angle,speed,turn:0,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed});
}
function assertSafe(flock) {
  const distance=flock.minimumDistance();
  assert.ok(distance>=flock.radius*2+.05*flock.scale,`Visible bird clearance lost: ${distance}, enclosing diameter ${flock.radius*2}`);
  for(const b of flock.birds) {
    assert.ok(Number.isFinite(b.x+b.y+b.angle+b.speed));
    assert.ok(b.x>=MARGIN&&b.x<=flock.width-MARGIN);
    assert.ok(b.y>=MARGIN&&b.y<=flock.height-MARGIN);
    assert.ok(b.speed>0&&b.speed<=CRUISE_SPEED*2.5*CATCHUP_RATIO+.01);
  }
}
function advance(f,seconds,checkEvery=30) {
  for(let i=0;i<seconds*120;i++){f.step(1/120);if(i%checkEvery===0)assertSafe(f);}
  f.measure();
}

test('viewport limits are 1200 desktop and 300 phone, including landscape',()=>{
  assert.equal(capacityForViewport(1440,900),1200);
  assert.equal(capacityForViewport(768,700),1200);
  assert.equal(capacityForViewport(390,844),300);
  assert.equal(capacityForViewport(844,390),300);
  assert.equal(new Flock(900,400,1200,seededRandom(1),1200).birds.length,1200);
  assert.equal(new Flock(350,410,300,seededRandom(1)).birds.length,300);
});

test('valid counts apply without resetting existing birds and editing states stay distinct',()=>{
  for(const value of ['', ' ', '0', '-1','1.5','1201','abc'])assert.equal(parseCount(value,1200),null);
  assert.equal(parseCount('100',1200),100);assert.equal(parseCount('101',1200),101);
  assert.equal(parseCount('301',300),null);
  const f=new Flock(1100,500,100,seededRandom(3));
  advance(f,1);
  const original=f.birds.map(b=>({ref:b,x:b.x,y:b.y}));
  f.setCount(101);
  original.forEach((b,i)=>{assert.equal(f.birds[i],b.ref);assert.equal(f.birds[i].x,b.x);assert.equal(f.birds[i].y,b.y);});
  assert.equal(f.birds.length,101);assertSafe(f);
  f.setCount(99);assert.equal(f.birds.length,99);assert.equal(f.birds[98],original[98].ref);
  f.setCount(1200);assert.equal(f.birds.length,1200);assert.ok(f.scale<.5);assertSafe(f);
});

test('nearest headings converge with bounded turning and speed transitions',()=>{
  const f=new Flock(2000,1200,2,seededRandom(3));
  place(f.birds[0],800,500,0);place(f.birds[1],800,538,Math.PI/3);
  for(let i=0;i<480;i++) {
    const angles=f.birds.map(b=>b.angle),turns=f.birds.map(b=>b.turn);
    f.step(1/120);assertSafe(f);
    f.birds.forEach((b,j)=>{
      assert.ok(Math.abs(Math.atan2(Math.sin(b.angle-angles[j]),Math.cos(b.angle-angles[j])))<=2.1/120+.001);
      assert.ok(Math.abs(b.turn-turns[j])<=9/120+.001);
    });
  }
  assert.ok(Math.cos(f.birds[0].angle-f.birds[1].angle)>.97);
  assert.ok(f.minimumDistance()>30&&f.minimumDistance()<55);
  f.setSpeed(2.5);assert.equal(f.cruiseSpeed,42);
  f.step(1/120);assert.ok(f.cruiseSpeed<43);
  advance(f,3);
  assert.equal(f.cruiseSpeed,105);
  for(const b of f.birds)assert.equal(b.speed,105);
  f.setSpeed(.4);f.step(1/120);assert.ok(f.cruiseSpeed>104);
  advance(f,3);assert.equal(f.cruiseSpeed,16.8);
  for(const b of f.birds)assert.equal(b.speed,16.8);
});

test('stragglers accelerate above the chosen pace and settle back after rejoining',()=>{
  for(const multiplier of [.4,2.5]) {
    const f=new Flock(2600,1400,3,seededRandom(7));
    f.setSpeed(multiplier);f.cruiseSpeed=CRUISE_SPEED*multiplier;
    place(f.birds[0],1000,600,0,f.cruiseSpeed);
    place(f.birds[1],1000,638,0,f.cruiseSpeed);
    place(f.birds[2],780,620,0,f.cruiseSpeed);
    advance(f,1);
    assert.ok(f.birds[2].speed>f.cruiseSpeed*1.3);
    advance(f,30);
    assert.equal(f.groups.length,1);
    assert.ok(f.birds[2].distance<f.linkDistance);
    for(const b of f.birds)assert.ok(Math.abs(b.speed-f.cruiseSpeed)<.01);
  }
});

test('two coherent groups actively merge and remain one flock',()=>{
  for(const seed of [3,42,2026]) {
    const f=new Flock(1600,700,12,seededRandom(seed));
    f.birds.forEach((b,i)=>place(b,(i<6?300:1150)+(i%3)*40,300+(Math.floor(i/3)%2)*40,i<6?Math.PI:0));
    f.measure();assert.equal(f.groups.length,2);
    advance(f,25);
    assert.equal(f.groups.length,1,`seed ${seed}: separated groups should have merged`);
    advance(f,5);assert.equal(f.groups.length,1);
  }
});

test('head-on and fast catch-up encounters preserve full-wing clearance',()=>{
  for(const angle of [0,Math.PI]) {
    const f=new Flock(1200,700,2,seededRandom(17));f.setSpeed(2.5);f.cruiseSpeed=105;
    place(f.birds[0],450,350,0,178.5);place(f.birds[1],485,350,angle,105);
    advance(f,5,1);
  }
});

test('maximum desktop and mobile flocks remain safe through speed changes',t=>{
  for(const [count,width,height] of [[1200,1100,470],[300,350,440]]) {
    const f=new Flock(width,height,count,seededRandom(123));assert.equal(f.birds.length,count);assertSafe(f);
    const start=performance.now();
    for(const multiplier of [1,2.5,.4]){f.setSpeed(multiplier);advance(f,5,60);}
    t.diagnostic(`${count} birds: ${(performance.now()-start).toFixed(0)} ms for 15 simulated seconds including independent clearance checks; scale ${f.scale.toFixed(3)}`);
    assert.equal(f.birds.length,count);assert.equal(f.groups.length,1);
  }
});

test('resizing retains birds, applies the mobile limit, and keeps geometry safe',()=>{
  const f=new Flock(1300,600,1200,seededRandom(22));
  const first=f.birds[0];
  assert.equal(f.resize(350,410,300),true);assert.equal(f.birds.length,300);assert.equal(f.birds[0],first);assertSafe(f);
  advance(f,4);
  f.resize(1000,450,1200);assert.equal(f.birds.length,300);f.setCount(1200);assertSafe(f);
  f.setCount(12);advance(f,3);assertSafe(f);
});
