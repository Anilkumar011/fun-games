// Physics uses CSS pixels and seconds. Rendering uses the same adaptive scale.
export const CRUISE_SPEED = 42;
export const CATCHUP_RATIO = 1.7;
export const BIRD_RADIUS = 10.5;
export const MIN_DISTANCE = 23;
export const TARGET_DISTANCE = 38;
export const MAX_COUNT = 1200;
export const MOBILE_MAX_COUNT = 300;
export const MARGIN = 24;
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const capacityForViewport = (width, height) => width < 768 || (width < 1000 && height < 500) ? MOBILE_MAX_COUNT : MAX_COUNT;
export function parseCount(value, maximum) {
  if (String(value).trim() === '') return null;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= maximum ? count : null;
}
export function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Numeric linked-cell grids avoid string keys and all-pairs searches every frame.
class Grid {
  build(birds, width, height, cell) {
    this.cell = cell;
    this.columns = Math.ceil(width / cell) + 2;
    this.rows = Math.ceil(height / cell) + 2;
    const size = this.columns * this.rows;
    if (!this.head || this.head.length < size) this.head = new Int32Array(size);
    if (!this.next || this.next.length < birds.length) this.next = new Int32Array(birds.length);
    this.head.fill(-1, 0, size);
    for (let i = 0; i < birds.length; i++) {
      const key = Math.floor(birds[i].x / cell) + Math.floor(birds[i].y / cell) * this.columns;
      this.next[i] = this.head[key]; this.head[key] = i;
    }
  }
}

export class Flock {
  constructor(width, height, count = 12, random = Math.random, capacity = capacityForViewport(width, height)) {
    this.width = Math.max(120, width); this.height = Math.max(120, height);
    this.capacity = capacity; this.random = random;
    this.birds = []; this.groups = []; this.time = 0; this.nextId = 0;
    this.speedMultiplier = 1; this.cruiseSpeed = CRUISE_SPEED;
    this.grid = new Grid(); this.contactGrid = new Grid();
    this.scale = 1; this.targetScale = 1;
    this.reset(count);
  }
  get minDistance() { return MIN_DISTANCE * this.scale; }
  get targetDistance() { return TARGET_DISTANCE * this.scale; }
  get radius() { return BIRD_RADIUS * this.scale; }
  get linkDistance() { return 96 * this.scale; }
  get catchupSpeed() { return this.cruiseSpeed + Math.max(24, this.cruiseSpeed * (CATCHUP_RATIO - 1)); }

  setSpeed(multiplier) {
    if (Number.isFinite(multiplier)) this.speedMultiplier = clamp(multiplier, .4, 2.5);
  }
  desiredScale(count = this.birds.length) {
    const area = (this.width - MARGIN * 2) * (this.height - MARGIN * 2);
    return Math.min(1, Math.sqrt(area * .52 / (Math.max(1, count) * TARGET_DISTANCE ** 2)));
  }
  makeBird(x, y, angle) {
    return { id: this.nextId++, x, y, angle, turn: 0, speed: this.cruiseSpeed,
      vx: Math.cos(angle) * this.cruiseSpeed, vy: Math.sin(angle) * this.cruiseSpeed,
      phase: this.random() * Math.PI * 2, wingPhase: 0, nearest: -1, distance: Infinity,
      catchingUp: false, group: 0, mergeX: 0, mergeY: 0, merging: false };
  }
  reset(count = this.birds.length) {
    this.birds = []; this.time = 0;
    this.scale = this.desiredScale(clamp(Math.round(count) || 1, 1, this.capacity));
    this.setCount(count);
  }
  setCount(value) {
    const count = clamp(Math.round(Number(value)) || 1, 1, this.capacity);
    this.targetScale = this.desiredScale(count);
    // Shrinking wings is immediately safe; growth is eased and contact-resolved.
    this.scale = Math.min(this.scale, this.targetScale);
    this.birds.length = Math.min(count, this.birds.length);
    const centerX = this.birds.length ? this.birds.reduce((s,b) => s+b.x,0)/this.birds.length : this.width / 2;
    const centerY = this.birds.length ? this.birds.reduce((s,b) => s+b.y,0)/this.birds.length : this.height / 2;
    const heading = this.birds[0]?.angle ?? this.random() * Math.PI * 2;
    const safe = (x,y) => this.birds.every(b => (b.x-x)**2 + (b.y-y)**2 >= (this.minDistance * 1.03)**2);
    const cells = [];
    const spacing = this.targetDistance;
    const columns = Math.floor((this.width - 2*MARGIN) / spacing);
    const rows = Math.floor((this.height - 2*MARGIN) / spacing);
    const ox = (this.width - (columns-1)*spacing)/2, oy = (this.height - (rows-1)*spacing)/2;
    for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) {
      const px=clamp(ox+x*spacing+(this.random()-.5)*spacing*.25,MARGIN,this.width-MARGIN);
      const py=clamp(oy+y*spacing+(this.random()-.5)*spacing*.25,MARGIN,this.height-MARGIN);
      cells.push({x:px,y:py,rank:(px-centerX)**2+(py-centerY)**2+this.random()*spacing**2});
    }
    cells.sort((a,b)=>a.rank-b.rank);
    let cursor = 0;
    while(this.birds.length < count) {
      let position;
      while(cursor < cells.length) {
        const p = cells[cursor++];
        if(safe(p.x,p.y)) { position=p; break; }
      }
      // Existing flying birds may occupy lattice candidates; find free air without
      // resetting their positions. Density scaling reserves ample free canvas.
      for(let attempt=0;!position && attempt<3000;attempt++) {
        const x=MARGIN+this.random()*(this.width-2*MARGIN);
        const y=MARGIN+this.random()*(this.height-2*MARGIN);
        if(safe(x,y)) position={x,y};
      }
      if(!position) { this.scale *= .95; continue; }
      this.birds.push(this.makeBird(position.x,position.y,heading+(this.random()-.5)*1.2));
    }
    this.measure();
    return count;
  }
  resize(width, height, capacity = capacityForViewport(width, height)) {
    const oldWidth=this.width, oldHeight=this.height;
    this.width=Math.max(120,width); this.height=Math.max(120,height); this.capacity=capacity;
    const reduced=this.birds.length>capacity;
    if(reduced) this.birds.length=capacity;
    for(const b of this.birds) {
      b.x=MARGIN+(b.x-MARGIN)/(oldWidth-2*MARGIN)*(this.width-2*MARGIN);
      b.y=MARGIN+(b.y-MARGIN)/(oldHeight-2*MARGIN)*(this.height-2*MARGIN);
    }
    this.targetScale=this.desiredScale(); this.scale=Math.min(this.scale,this.targetScale);
    this.resolveContacts(60);
    // Rare extreme aspect-ratio changes can require temporarily smaller wings.
    while(this.minimumDistance() < this.radius*2+.2*this.scale) {
      this.scale *= .94;
      this.resolveContacts(20);
    }
    this.measure(); return reduced;
  }

  measure() {
    const birds=this.birds,n=birds.length, radius=120*this.scale, r2=radius*radius;
    const link2=this.linkDistance**2, separation=46*this.scale, sep2=separation**2;
    this.grid.build(birds,this.width,this.height,radius);
    const {head,next,columns,rows}=this.grid;
    const parents = new Int32Array(n);
    const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    let totalX=0,totalY=0;
    for(let i=0;i<n;i++) {
      const b=birds[i]; parents[i]=i;
      b.headingX=Math.cos(b.angle); b.headingY=Math.sin(b.angle);
      b.nearest=-1; b.distance=Infinity; b.centerX=0;b.centerY=0;
      b.alignX=0;b.alignY=0;b.neighbors=0;b.separateX=0;b.separateY=0;
      b.merging=false;totalX+=b.x;totalY+=b.y;
    }
    this.centerX=totalX/n;this.centerY=totalY/n;
    for(let i=0;i<n;i++) {
      const a=birds[i],cx=Math.floor(a.x/radius),cy=Math.floor(a.y/radius);
      for(let gy=Math.max(0,cy-1);gy<=Math.min(rows-1,cy+1);gy++) for(let gx=Math.max(0,cx-1);gx<=Math.min(columns-1,cx+1);gx++) {
        for(let j=head[gx+gy*columns];j!==-1;j=next[j]) {
          if(j<=i)continue;
          const b=birds[j],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
          if(d2>r2)continue;
          if(d2<a.distance){a.distance=d2;a.nearest=j;}
          if(d2<b.distance){b.distance=d2;b.nearest=i;}
          if(d2<link2)parents[root(j)]=root(i);
          a.centerX+=b.x;a.centerY+=b.y;a.alignX+=b.headingX;a.alignY+=b.headingY;a.neighbors++;
          b.centerX+=a.x;b.centerY+=a.y;b.alignX+=a.headingX;b.alignY+=a.headingY;b.neighbors++;
          if(d2<sep2) {
            const d=Math.sqrt(d2)||.001;
            const strength=Math.max(0,(46*this.scale-d)/(23*this.scale))**2;
            const sx=dx/d*strength,sy=dy/d*strength;
            a.separateX-=sx;a.separateY-=sy;b.separateX+=sx;b.separateY+=sy;
            const rvx=b.vx-a.vx,rvy=b.vy-a.vy;
            const t=clamp(-(dx*rvx+dy*rvy)/(rvx*rvx+rvy*rvy||1),0,.25);
            const future=Math.hypot(dx+rvx*t,dy+rvy*t);
            if(t>0 && future<this.minDistance*1.2) {
              const dodge=(this.minDistance*1.2-future)/(this.minDistance*1.2);
              a.separateX-=dy/d*dodge;a.separateY+=dx/d*dodge;
              b.separateX+=dy/d*dodge;b.separateY-=dx/d*dodge;
            }
          }
        }
      }
    }
    const groups=new Map();
    for(let i=0;i<n;i++) {
      const b=birds[i];
      if(b.nearest===-1 && n>1) for(let j=0;j<n;j++) {
        if(i===j)continue;
        const d2=(birds[j].x-b.x)**2+(birds[j].y-b.y)**2;
        if(d2<b.distance){b.distance=d2;b.nearest=j;}
      }
      b.distance=Math.sqrt(b.distance);b.group=root(i);
      if(!groups.has(b.group))groups.set(b.group,[]);
      groups.get(b.group).push(i);
    }
    this.groups=[...groups.values()];
    if(this.groups.length>1) {
      const summaries=this.groups.map(members=>({members,
        x:members.reduce((s,i)=>s+birds[i].x,0)/members.length,
        y:members.reduce((s,i)=>s+birds[i].y,0)/members.length}));
      const main=summaries.reduce((a,b)=>a.members.length>=b.members.length?a:b);
      for(const group of summaries) {
        if(group===main)continue;
        // Anchor smaller groups to the main flock: coherent detached groups no
        // longer fly forever on their own, even when every bird has a neighbor.
        let target=birds[main.members[0]],distance=Infinity;
        for(const i of main.members) {
          const d=(birds[i].x-group.x)**2+(birds[i].y-group.y)**2;
          if(d<distance){target=birds[i];distance=d;}
        }
        for(const i of group.members) {
          birds[i].merging=true;
          birds[i].mergeX=target.x+target.vx*.4;
          birds[i].mergeY=target.y+target.vy*.4;
        }
      }
    }
  }

  step(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    if(dt>1/120+1e-9) {
      const steps=Math.ceil(dt*120);
      for(let i=0;i<steps;i++)this.step(dt/steps);
      return;
    }
    this.time+=dt;
    this.cruiseSpeed+=clamp(this.speedMultiplier*CRUISE_SPEED-this.cruiseSpeed,-50*dt,50*dt);
    this.scale+=Math.min(this.targetScale-this.scale,dt*.15);
    this.measure();
    const turnLimit=2.1*Math.sqrt(this.cruiseSpeed/CRUISE_SPEED);
    for(const b of this.birds) {
      const nearest=this.birds[b.nearest];
      let sx=b.headingX*3,sy=b.headingY*3;
      if(nearest) {
        sx=nearest.headingX*3;sy=nearest.headingY*3;
        if(b.neighbors) {
          sx+=b.alignX/b.neighbors*.7+(b.centerX/b.neighbors-b.x)*.01/this.scale;
          sy+=b.alignY/b.neighbors*.7+(b.centerY/b.neighbors-b.y)*.01/this.scale;
        }
        const pull=clamp((b.distance-this.targetDistance)*.055/this.scale,0,5);
        const dx=nearest.x+nearest.vx*.2-b.x,dy=nearest.y+nearest.vy*.2-b.y;
        const distance=Math.hypot(dx,dy)||1;
        sx+=dx/distance*pull;sy+=dy/distance*pull;
        if(b.distance>this.linkDistance*.72)b.catchingUp=true;
        if(b.distance<52*this.scale)b.catchingUp=false;
      } else b.catchingUp=false;
      if(b.merging) {
        const dx=b.mergeX-b.x,dy=b.mergeY-b.y,d=Math.hypot(dx,dy)||1;
        sx=sx*.45+dx/d*5.5;sy=sy*.45+dy/d*5.5;
      }
      // A loose global tether prevents the single flock from stretching apart.
      const dx=this.centerX-b.x,dy=this.centerY-b.y;
      const radius=Math.max(this.targetDistance*2,this.targetDistance*Math.sqrt(this.birds.length)*.62);
      const extentX=Math.min(radius,(this.width-2*MARGIN)*.4);
      const extentY=Math.min(radius,(this.height-2*MARGIN)*.36);
      const tether=Math.max(0,Math.hypot(dx/extentX,dy/extentY)-1);
      sx+=dx/(Math.hypot(dx,dy)||1)*tether*4.5;
      sy+=dy/(Math.hypot(dx,dy)||1)*tether*4.5;
      sx+=b.separateX*3.2;sy+=b.separateY*3.2;
      const wander=Math.sin(this.time*.18)*.2+Math.sin(this.time*.42+b.phase)*.035;
      sx-=b.headingY*wander;sy+=b.headingX*wander;
      const wallRange=Math.min(115,Math.min(this.width,this.height)*.26);
      const wall=d=>Math.max(0,1-d/wallRange)**2*11;
      sx+=wall(b.x-MARGIN)-wall(this.width-MARGIN-b.x);
      sy+=wall(b.y-MARGIN)-wall(this.height-MARGIN-b.y);
      const wanted=clamp(difference(Math.atan2(sy,sx),b.angle)*3,-turnLimit,turnLimit);
      b.turn+=clamp(wanted-b.turn,-9*dt,9*dt);
      b.nextAngle=b.angle+b.turn*dt;
      const target=(b.catchingUp||b.merging)?this.catchupSpeed:this.cruiseSpeed;
      b.nextSpeed=b.speed+clamp(target-b.speed,-85*dt,65*dt);
    }
    for(const b of this.birds) {
      b.angle=b.nextAngle;b.speed=b.nextSpeed;
      b.wingPhase=(b.wingPhase+dt*(9+3*b.speed/CRUISE_SPEED))%(Math.PI*2);
      b.vx=Math.cos(b.angle)*b.speed;b.vy=Math.sin(b.angle)*b.speed;
      b.x+=b.vx*dt;b.y+=b.vy*dt;
    }
    this.resolveContacts(10);
  }

  resolveContacts(iterations) {
    const birds=this.birds,min=this.minDistance,min2=min*min;
    for(let iteration=0;iteration<iterations;iteration++) {
      for(const b of birds){b.x=clamp(b.x,MARGIN,this.width-MARGIN);b.y=clamp(b.y,MARGIN,this.height-MARGIN);}
      this.contactGrid.build(birds,this.width,this.height,min);
      const {head,next,columns,rows}=this.contactGrid;
      let deepest=0;
      for(let i=0;i<birds.length;i++) {
        const a=birds[i],cx=Math.floor(a.x/min),cy=Math.floor(a.y/min);
        for(let gy=Math.max(0,cy-1);gy<=Math.min(rows-1,cy+1);gy++) for(let gx=Math.max(0,cx-1);gx<=Math.min(columns-1,cx+1);gx++) {
          for(let j=head[gx+gy*columns];j!==-1;j=next[j]) {
            if(j<=i)continue;
            const b=birds[j];let dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
            if(d2>=min2)continue;
            let distance=Math.sqrt(d2);
            if(distance<.00001){dx=Math.cos(i*2.4);dy=Math.sin(i*2.4);distance=1;}
            const depth=min-distance;deepest=Math.max(deepest,depth);
            const push=(depth+.001)*.5;
            a.x-=dx/distance*push;a.y-=dy/distance*push;
            b.x+=dx/distance*push;b.y+=dy/distance*push;
          }
        }
      }
      if(deepest<.005)break;
    }
    for(const b of birds) {
      b.x=clamp(b.x,MARGIN,this.width-MARGIN);b.y=clamp(b.y,MARGIN,this.height-MARGIN);
      if((b.x<=MARGIN&&b.vx<0)||(b.x>=this.width-MARGIN&&b.vx>0))b.vx*=-1;
      if((b.y<=MARGIN&&b.vy<0)||(b.y>=this.height-MARGIN&&b.vy>0))b.vy*=-1;
      b.angle=Math.atan2(b.vy,b.vx);
    }
  }
  minimumDistance() {
    let result=Infinity;
    for(let i=0;i<this.birds.length;i++)for(let j=i+1;j<this.birds.length;j++)
      result=Math.min(result,Math.hypot(this.birds[i].x-this.birds[j].x,this.birds[i].y-this.birds[j].y));
    return result;
  }
}
