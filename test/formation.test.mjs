import test from 'node:test';
import assert from 'node:assert/strict';
import {Flock,seededRandom} from '../flock.mjs';
import {validateWord,layoutWord} from '../formation.mjs';

const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function advance(f,seconds){for(let i=0;i<seconds*120;i++)f.step(1/120);}

test('arbitrary one-to-six-letter words validate and fit phone and desktop limits',()=>{
  assert.equal(validateWord(' Test ').word,'TEST');
  for(const value of ['', ' ', 'abcdefg', 'Hi!', '1', 'two words', 'é'])assert.equal(validateWord(value).valid,false);
  for(const [w,h] of [[350,440],[1100,470]])for(const word of ['A','TEST','ABCDEF','GHIJKL','MNOPQR','STUVWX','YZYZYZ']){
    const plan=layoutWord(word,w,h);
    assert.ok(plan.points.length<=300);
    for(const p of plan.points){assert.ok(Math.abs(p.x)+plan.ampX<w/2-24);assert.ok(Math.abs(p.y)+plan.ampY<h/2-24);}
  }
  const f=new Flock(1100,470,12,seededRandom(1)),before=[...f.birds];
  assert.equal(f.formWord('!').valid,false);assert.deepEqual(f.birds,before);assert.equal(f.formation,null);
});

test('birds arrive continuously, hold a readable word for five seconds, and fade back to the selected count',()=>{
  const f=new Flock(1100,470,12,seededRandom(3)),original=f.birds.map(b=>({b,x:b.x,y:b.y}));
  f.formWord('TEST');assert.equal(f.selectedCount,12);assert.ok(f.birds.length>12);
  for(const {b,x,y} of original){assert.equal(b.x,x);assert.equal(b.y,y);}
  assert.ok(f.birds.slice(12).every(b=>b.opacity===0));
  let heldAt,releaseAt,fadeSeen=false,readableHold=0;
  for(let step=0;step<45*120&&f.formation;step++){
    const old=f.birds.map(b=>({angle:b.angle,turn:b.turn,speed:b.speed}));
    const prior=f.formation.holdElapsed;f.step(1/120);
    for(let i=0;i<f.birds.length;i++){
      const b=f.birds[i],p=old[i];
      assert.ok(Math.abs(angleDifference(b.angle,p.angle))<=2.1/120+1e-8,'bounded heading changes');
      assert.ok(Math.abs(b.turn-p.turn)<=9/120+1e-8,'bounded banking acceleration');
      assert.ok(b.speed>0&&b.speed>=p.speed-85/120-1e-8&&b.speed<=p.speed+65/120+1e-8,'no stop or speed snap');
    }
    if(step%60===0)assert.ok(f.minimumDistance()>=f.radius*2,'wings stay clear');
    const s=f.formation;if(!s)break;
    if(s.phase==='assembling')assert.equal(s.holdElapsed,0,'travel is not counted as display time');
    if(s.phase==='holding'){
      heldAt??=f.time;
      if(s.holdElapsed>prior){assert.ok(s.progress>=.96&&s.obscuring===0);readableHold+=s.holdElapsed-prior;}
    }
    if(s.phase==='releasing'){
      releaseAt??=f.time;
      fadeSeen ||= f.birds.slice(12).some(b=>b.opacity>0&&b.opacity<1);
      assert.ok(s.holdElapsed>=5);
    }
  }
  assert.equal(f.formation,null,'formation completes without intervention');
  assert.ok(heldAt>2&&releaseAt-heldAt>=5-1/120);
  assert.ok(readableHold>=4.98&&fadeSeen);
  assert.ok(f.lastFormation.heldFor>=5);assert.equal(f.birds.length,12);
  original.forEach(({b},i)=>assert.equal(f.birds[i],b,'existing birds survive the temporary population'));
});

test('maximum populations leave lettering clear, then retain the selected population',()=>{
  for(const [word,w,h,count] of [['ABCDEF',350,440,300],['WWWWWW',1100,470,1200]]){
    const f=new Flock(w,h,count,seededRandom(3));f.formWord(word);
    let holding=false;
    for(let step=0;step<45*120&&f.formation;step++){
      f.step(1/120);assert.equal(f.birds.length,count);
      const s=f.formation;
      if(s?.phase==='holding'&&!holding){holding=true;assert.equal(s.obscuring,0);assert.ok(s.progress>=.97);}
    }
    assert.ok(holding,`${count} birds reach a readable formation`);assert.equal(f.formation,null);
    assert.equal(f.birds.length,count);assert.equal(f.selectedCount,count);
  }
});

test('pause, speed, repeated words, count edits, reset and resizing preserve predictable state',()=>{
  const f=new Flock(1100,470,12,seededRandom(42));f.formWord('FLIGHT');advance(f,3);
  const t=f.time,phase=f.formation.phase,positions=f.birds.map(b=>[b.x,b.y]);
  f.step(0);assert.equal(f.time,t);assert.equal(f.formation.phase,phase);assert.deepEqual(f.birds.map(b=>[b.x,b.y]),positions);
  f.setSpeed(2.5);advance(f,2);assert.equal(f.cruiseSpeed,105);
  const before=f.birds.map(b=>({b,x:b.x,y:b.y}));f.formWord('A');
  before.forEach(({b,x,y})=>{assert.equal(b.x,x);assert.equal(b.y,y);});
  assert.equal(f.formation.word,'A');assert.equal(f.formation.holdElapsed,0);
  f.setCount(20);assert.equal(f.selectedCount,20);assert.equal(f.formation.phase,'releasing');
  advance(f,3.2);assert.equal(f.birds.length,20);assert.equal(f.formation,null);
  f.formWord('TEST');f.setCount(150);assert.equal(f.birds.length,150);advance(f,3.2);assert.equal(f.birds.length,150);
  f.setCount(1200);f.formWord('MOBILE');f.resize(350,440,300);
  assert.equal(f.selectedCount,300);assert.equal(f.birds.length,300);assert.equal(f.formation.word,'MOBILE');
  assert.equal(f.formation.phase,'assembling');assert.equal(f.formation.holdElapsed,0);
  f.reset();assert.equal(f.formation,null);assert.equal(f.birds.length,300);assert.equal(f.speedMultiplier,2.5);
});
