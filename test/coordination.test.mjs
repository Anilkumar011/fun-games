import test from 'node:test';
import assert from 'node:assert/strict';
import {Flock,seededRandom} from '../flock.mjs';
const place=(b,x,y,angle)=>Object.assign(b,{x,y,angle,speed:42,turn:0,vx:Math.cos(angle)*42,vy:Math.sin(angle)*42});

test('a corner pair leaves together while the main flock flies away, then rejoins without a rescue bird',()=>{
  for(const mirrored of [false,true]){
    const f=new Flock(3000,1800,14,seededRandom(4));
    f.birds.forEach((b,i)=>{
      let x=i<12?2000+i%4*38:50+(i-12)*27,y=i<12?850+Math.floor(i/4)*38:50,angle=i<12?0:(4+i)*2.399;
      if(mirrored){x=3000-x;y=1800-y;angle+=Math.PI;}place(b,x,y,angle);
    });
    const original=f.birds.slice(12).map(b=>[b.x,b.y]);
    for(let step=0;step<20*120;step++){
      f.step(1/120);
      // The main group stays far away: neither a visitor nor a forced reset
      // can be the cause of the pair's departure from the corner.
      for(const a of f.birds.slice(0,12))for(const b of f.birds.slice(12))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>500);
    }
    f.birds.slice(12).forEach((b,i)=>assert.ok(Math.hypot(b.x-original[i][0],b.y-original[i][1])>800));
    for(let step=0;step<45*120&&f.groups.length>1;step++)f.step(1/120);
    assert.equal(f.groups.length,1,'the detached pair reaches the main flock');
    assert.ok(f.minimumDistance()>f.radius*2);
  }
});

test('turn information spreads locally while cruising birds keep bounded, varied motion',()=>{
  const f=new Flock(4000,2200,9,seededRandom(7));
  f.birds.forEach((b,i)=>place(b,1600+i*38,1000,0));
  f.birds[8].angle=.6;f.birds[8].turn=.5;
  let responding=new Set();
  for(let step=0;step<4*120;step++){
    const previous=f.birds.map(b=>b.turn);f.step(1/120);
    f.birds.forEach((b,i)=>{assert.ok(Math.abs(b.turn-previous[i])<=9/120+1e-8);if(i<8&&b.turn>.02)responding.add(i);});
  }
  assert.ok(responding.size>=6,'the turn reaches beyond the initiating bird’s immediate neighbor');
  const heading=f.birds.reduce((s,b)=>s+Math.cos(b.angle),0)/9;
  assert.ok(heading>.85);assert.ok(new Set(f.birds.map(b=>b.wingPhase+b.phase)).size===9,'wingbeats are not synchronized');
});
