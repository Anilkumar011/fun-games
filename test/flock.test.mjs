import test from 'node:test';
import assert from 'node:assert/strict';
import { Flock, seededRandom, CRUISE_SPEED, CATCHUP_SPEED, KITE_RADIUS, MARGIN } from '../flock.mjs';

function place(bird, x, y, angle, speed = CRUISE_SPEED) {
  Object.assign(bird, { x, y, angle, speed, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
}

function assertSafe(flock) {
  assert.ok(flock.minimumDistance() > KITE_RADIUS * 2 + 1,
    `Kite enclosing discs overlapped or lost safety clearance: ${flock.minimumDistance()}`);
  for (const b of flock.birds) {
    assert.ok(Number.isFinite(b.x + b.y + b.angle + b.speed), 'All state remains finite');
    assert.ok(b.x >= MARGIN && b.x <= flock.width - MARGIN, 'Kite stays in horizontal bounds');
    assert.ok(b.y >= MARGIN && b.y <= flock.height - MARGIN, 'Kite stays in vertical bounds');
    assert.ok(b.speed >= CRUISE_SPEED && b.speed <= CATCHUP_SPEED, 'Speed stays in its range');
  }
}

test('a nearby pair aligns its headings and maintains a gap', () => {
  const f = new Flock(1600,1000,2,seededRandom(3));
  place(f.birds[0],700,450,0);
  place(f.birds[1],700,480,Math.PI / 3);
  for (let i = 0; i < 240; i++) { f.step(1/120); assertSafe(f); }
  const [a,b] = f.birds;
  assert.ok(Math.cos(a.angle-b.angle) > .98, 'Nearest-neighbor headings converge');
  assert.equal(a.speed, CRUISE_SPEED);
  assert.equal(b.speed, CRUISE_SPEED);
  assert.ok(f.minimumDistance() > 20 && f.minimumDistance() < 32, 'Pair settles near the intended clear gap');
});

test('a separated kite speeds up, rejoins a flock, and returns to cruise speed', () => {
  const f = new Flock(2000,1000,3,seededRandom(7));
  place(f.birds[0],850,500,0);
  place(f.birds[1],850,524,0);
  place(f.birds[2],600,510,0);
  for(let i=0;i<120;i++) f.step(1/120);
  assert.ok(f.birds[2].speed > CRUISE_SPEED + 20, 'Straggler accelerates');
  assert.equal(f.birds[0].speed, CRUISE_SPEED, 'Group keeps its cruising speed');
  for(let i=0;i<1200;i++) { f.step(1/120); assertSafe(f); }
  f.measure();
  assert.equal(f.groups.length,1, 'Straggler joins the group');
  assert.ok(f.birds[2].distance < 34, 'Straggler stays close after catching up');
  for (const b of f.birds) assert.equal(b.speed,CRUISE_SPEED);
});

test('head-on and high-speed catch-up encounters preserve separation', () => {
  for (const heading of [0, Math.PI]) {
    const f = new Flock(1200,700,2,seededRandom(17));
    place(f.birds[0],450,350,0,CATCHUP_SPEED);
    place(f.birds[1],485,350,heading,CRUISE_SPEED);
    for(let i=0;i<600;i++) { f.step(1/120); assertSafe(f); }
  }
});

test('multiple seeded flocks stay grouped, contained, and collision-free over time', () => {
  for (const count of [1,12,48,120]) for (const seed of [1,42,2026]) {
    const f = new Flock(1100,470,count,seededRandom(seed));
    assertSafe(f);
    for(let i=0;i<3600;i++) {
      f.step(1/120);
      if(i%12===0) assertSafe(f);
    }
    f.measure();
    if(count > 1) {
      const connected = f.birds.filter(b=>b.distance < 64).length / count;
      assert.ok(connected >= .95, `${count} kites, seed ${seed}: ${connected} fraction stays close`);
      const aligned = f.birds.reduce((sum,b)=>sum+Math.cos(b.angle-f.birds[b.nearest].angle),0)/count;
      assert.ok(aligned > .7, `${count} kites, seed ${seed}: nearest-heading agreement ${aligned}`);
    }
  }
});

test('600 kites preserve clearance and stay on the field in a dense run', () => {
  const f = new Flock(1100,470,600,seededRandom(123));
  assert.equal(f.birds.length,600);
  for(let i=0;i<1800;i++) {
    f.step(1/120);
    if(i%6===0) assertSafe(f);
  }
});

test('resizing and count limits preserve safe usable arrangements', () => {
  const f = new Flock(1100,600,600,seededRandom(22));
  assert.equal(f.birds.length,600);
  assert.equal(f.resize(320,390),true);
  assert.equal(f.birds.length,f.capacity);
  assert.ok(f.capacity < 600);
  assertSafe(f);
  for(let i=0;i<600;i++) { f.step(1/120); if(i%6===0) assertSafe(f); }
  f.reset(12);
  f.resize(230,350);
  assert.equal(f.birds.length,12);
  assertSafe(f);
  f.reset(0); assert.equal(f.birds.length,1);
  f.reset(10000); assert.equal(f.birds.length,f.capacity);
  assertSafe(f);
});
