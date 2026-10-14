// Distances are CSS pixels; time is seconds. Keep the physics independent of rendering.
export const CRUISE_SPEED = 42;
export const CATCHUP_SPEED = 76;
export const KITE_RADIUS = 7;
export const MIN_DISTANCE = 16;
export const TARGET_DISTANCE = 24;
export const MAX_COUNT = 600;
export const MARGIN = 30;
const LINK_DISTANCE = 64;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class Flock {
  constructor(width, height, count = 12, random = Math.random) {
    this.width = Math.max(120, width);
    this.height = Math.max(120, height);
    this.random = random;
    this.time = 0;
    this.birds = [];
    this.groups = [];
    this.reset(count);
  }

  get capacity() {
    return Math.min(MAX_COUNT,
      Math.floor((this.width - MARGIN * 2) / TARGET_DISTANCE) *
      Math.floor((this.height - MARGIN * 2) / TARGET_DISTANCE));
  }

  reset(count = this.birds.length) {
    count = clamp(Math.round(Number(count) || 1), 1, this.capacity);
    this.time = 0;
    this.birds = [];
    // Start on a shuffled, lightly jittered lattice: random, but never overlapping.
    const columns = Math.floor((this.width - MARGIN * 2) / TARGET_DISTANCE);
    const rows = Math.floor((this.height - MARGIN * 2) / TARGET_DISTANCE);
    const cells = [];
    const offsetX = (this.width - (columns - 1) * TARGET_DISTANCE) / 2;
    const offsetY = (this.height - (rows - 1) * TARGET_DISTANCE) / 2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      cells.push({ x: offsetX + x * TARGET_DISTANCE, y: offsetY + y * TARGET_DISTANCE });
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    // A small flock begins in a loose patch; larger flocks fill the available field.
    if (count <= 48) cells.sort((a, b) =>
      Math.hypot(a.x - this.width * .5, a.y - this.height * .5) -
      Math.hypot(b.x - this.width * .5, b.y - this.height * .5));
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2;
      this.birds.push({ x: cells[i].x + (this.random() - .5) * 4,
        y: cells[i].y + (this.random() - .5) * 4, angle, speed: CRUISE_SPEED,
        vx: Math.cos(angle) * CRUISE_SPEED, vy: Math.sin(angle) * CRUISE_SPEED,
        phase: this.random() * Math.PI * 2, nearest: -1, distance: Infinity,
        catchingUp: false, group: 0 });
    }
    this.measure();
  }

  resize(width, height) {
    const oldWidth = this.width, oldHeight = this.height;
    this.width = Math.max(120, width); this.height = Math.max(120, height);
    if (this.birds.length > this.capacity) { this.reset(this.capacity); return true; }
    for (const b of this.birds) {
      b.x = MARGIN + (b.x - MARGIN) / (oldWidth - MARGIN * 2) * (this.width - MARGIN * 2);
      b.y = MARGIN + (b.y - MARGIN) / (oldHeight - MARGIN * 2) * (this.height - MARGIN * 2);
    }
    this.resolveContacts(80);
    // If an extreme shrink concentrates a flock, give it a fresh safe arrangement.
    if (this.minimumDistance() < MIN_DISTANCE - .1) this.reset(this.birds.length);
    this.measure();
    return false;
  }

  measure() {
    const birds = this.birds, n = birds.length;
    const parents = Array.from({ length: n }, (_, i) => i);
    const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    for (const b of birds) {
      b.nearest = -1; b.distance = Infinity;
      b.headingX = Math.cos(b.angle); b.headingY = Math.sin(b.angle);
      b.centerX = 0; b.centerY = 0; b.alignX = 0; b.alignY = 0;
      b.separateX = 0; b.separateY = 0; b.neighbors = 0;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = birds[i], b = birds[j], dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < a.distance) { a.distance = d2; a.nearest = j; }
      if (d2 < b.distance) { b.distance = d2; b.nearest = i; }
      if (d2 < LINK_DISTANCE * LINK_DISTANCE) parents[root(j)] = root(i);
      if (d2 < 80 * 80) {
        a.centerX += b.x; a.centerY += b.y; a.alignX += b.headingX; a.alignY += b.headingY; a.neighbors++;
        b.centerX += a.x; b.centerY += a.y; b.alignX += a.headingX; b.alignY += a.headingY; b.neighbors++;
      }
      if (d2 < 33 * 33) {
        const d = Math.sqrt(d2) || .001;
        const strength = Math.pow(Math.max(0, (30 - d) / 14), 2);
        const sx = dx / d * strength, sy = dy / d * strength;
        a.separateX -= sx; a.separateY -= sy; b.separateX += sx; b.separateY += sy;
        // Anticipate approaching neighbors, including faster returning kites.
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const t = clamp(-(dx * rvx + dy * rvy) / (rvx * rvx + rvy * rvy || 1), 0, .4);
        const future = Math.hypot(dx + rvx * t, dy + rvy * t);
        if (t > 0 && future < MIN_DISTANCE + 2) {
          const dodge = (MIN_DISTANCE + 2 - future) / (MIN_DISTANCE + 2);
          a.separateX -= dy / d * dodge; a.separateY += dx / d * dodge;
          b.separateX += dy / d * dodge; b.separateY -= dx / d * dodge;
        }
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const b = birds[i];
      b.distance = Math.sqrt(b.distance);
      b.group = root(i);
      if (!groups.has(b.group)) groups.set(b.group, []);
      groups.get(b.group).push(i);
    }
    this.groups = [...groups.values()];
  }

  step(dt) {
    // Subdivision also protects callers other than the browser animation loop.
    if (dt > 1 / 120 + 1e-9) {
      const steps = Math.ceil(dt * 120);
      for (let i = 0; i < steps; i++) this.step(dt / steps);
      return;
    }
    this.time += dt;
    this.measure();
    // Compute from the same snapshot, then integrate every kite together.
    const next = this.birds.map(b => {
      let sx = Math.cos(b.angle) * 2.4, sy = Math.sin(b.angle) * 2.4;
      const nearest = this.birds[b.nearest];
      if (nearest) {
        sx = Math.cos(nearest.angle) * 2.4; sy = Math.sin(nearest.angle) * 2.4;
        if (b.neighbors) {
          sx += b.alignX / b.neighbors * .65 + (b.centerX / b.neighbors - b.x) * .007;
          sy += b.alignY / b.neighbors * .65 + (b.centerY / b.neighbors - b.y) * .007;
        }
        const pull = clamp((b.distance - TARGET_DISTANCE) * .065, 0, 4.8);
        const dx = nearest.x + nearest.vx * .25 - b.x, dy = nearest.y + nearest.vy * .25 - b.y;
        const d = Math.hypot(dx, dy) || 1;
        sx += dx / d * pull; sy += dy / d * pull;
        // Hysteresis prevents rapid speed toggles near the edge of a flock.
        if (b.distance > 64) b.catchingUp = true;
        if (b.distance < 34) b.catchingUp = false;
      } else b.catchingUp = false;
      sx += b.separateX * 3.1; sy += b.separateY * 3.1;
      // Shared gentle changes in heading keep coherent flocks lively.
      const wander = Math.sin(this.time * .38 + b.phase) * .12 + Math.sin(this.time * .21) * .18;
      sx -= Math.sin(b.angle) * wander; sy += Math.cos(b.angle) * wander;
      const wallRange = 72;
      const wall = distance => Math.pow(Math.max(0, 1 - distance / wallRange), 2) * 8;
      sx += wall(b.x - MARGIN) - wall(this.width - MARGIN - b.x);
      sy += wall(b.y - MARGIN) - wall(this.height - MARGIN - b.y);
      const angle = b.angle + clamp(angleDifference(Math.atan2(sy, sx), b.angle) * 4.2, -4.0, 4.0) * dt;
      const targetSpeed = b.catchingUp ? CATCHUP_SPEED : CRUISE_SPEED;
      let speed = b.speed + clamp(targetSpeed - b.speed, -70 * dt, 45 * dt);
      if (Math.abs(speed - targetSpeed) < .001) speed = targetSpeed;
      return { angle, speed };
    });
    this.birds.forEach((b, i) => {
      b.angle = next[i].angle; b.speed = next[i].speed;
      b.vx = Math.cos(b.angle) * b.speed; b.vy = Math.sin(b.angle) * b.speed;
      b.x += b.vx * dt; b.y += b.vy * dt;
    });
    // Conservative enclosing discs are wider than the rendered wings. Resolving
    // contacts after movement prevents catch-up motion from passing through kites.
    this.resolveContacts(10);
  }

  resolveContacts(iterations) {
    const birds = this.birds, cell = MIN_DISTANCE;
    for (let iteration = 0; iteration < iterations; iteration++) {
      const grid = new Map();
      let deepest = 0;
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        b.x = clamp(b.x, MARGIN, this.width - MARGIN);
        b.y = clamp(b.y, MARGIN, this.height - MARGIN);
        const key = `${Math.floor(b.x / cell)},${Math.floor(b.y / cell)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
      for (let i = 0; i < birds.length; i++) {
        const a = birds[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const others = grid.get(`${cx + ox},${cy + oy}`);
          if (!others) continue;
          for (const j of others) {
            if (j <= i) continue;
            const b = birds[j]; let dx = b.x - a.x, dy = b.y - a.y;
            let distance = Math.hypot(dx, dy);
            if (distance >= MIN_DISTANCE) continue;
            if (distance < .00001) { dx = Math.cos(i * 2.4); dy = Math.sin(i * 2.4); distance = 1; }
            const depth = MIN_DISTANCE - distance;
            deepest = Math.max(deepest, depth);
            const push = (depth + .001) * .5;
            a.x -= dx / distance * push; a.y -= dy / distance * push;
            b.x += dx / distance * push; b.y += dy / distance * push;
          }
        }
      }
      if (deepest < .005) break;
    }
    for (const b of birds) {
      b.x = clamp(b.x, MARGIN, this.width - MARGIN);
      b.y = clamp(b.y, MARGIN, this.height - MARGIN);
      // A hard edge is a last resort behind the broad, smooth wall steering.
      if ((b.x <= MARGIN && b.vx < 0) || (b.x >= this.width - MARGIN && b.vx > 0)) b.vx *= -1;
      if ((b.y <= MARGIN && b.vy < 0) || (b.y >= this.height - MARGIN && b.vy > 0)) b.vy *= -1;
      b.angle = Math.atan2(b.vy, b.vx);
    }
  }

  minimumDistance() {
    let result = Infinity;
    for (let i = 0; i < this.birds.length; i++) for (let j = i + 1; j < this.birds.length; j++) {
      result = Math.min(result, Math.hypot(this.birds[i].x - this.birds[j].x, this.birds[i].y - this.birds[j].y));
    }
    return result;
  }
}
