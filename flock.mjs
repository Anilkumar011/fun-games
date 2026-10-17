import {startFormation,releaseFormation,updateFormation,formationGuidance} from './formation.mjs';
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
const boundaryRisk=(distance,outward,buffer)=>Math.max(
  outward>1?clamp(1-(distance-buffer)/outward/1.6,0,1):0,
  clamp(1-distance/buffer,0,1)
);
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
    this.grid = new Grid(); this.contactGrid = new Grid(); this.safetyGrid = new Grid();
    this.scale = 1; this.targetScale = 1;this.mergeTracks=new Map();
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
  reset(count = this.selectedCount??this.birds.length) {
    this.formation=null;this.selectedCount=count;this.birds = []; this.time = 0;this.nextAnticipation=0;
    this.scale = this.desiredScale(clamp(Math.round(count) || 1, 1, this.capacity));
    this.setCount(count);
  }
  formWord(text){return startFormation(this,text);}
  releaseWord(){releaseFormation(this);}
  setCount(value){
    const count=clamp(Math.round(Number(value))||1,1,this.capacity);
    this.selectedCount=count;
    if(this.formation){
      releaseFormation(this);
      if(count>this.birds.length)this.setPopulation(count);
      return count;
    }
    return this.setPopulation(count);
  }
  setPopulation(value) {
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
    this.selectedCount=Math.min(this.selectedCount,capacity);
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
    this.measure();
    if(this.formation){if(this.formation.phase!=='releasing')this.formWord(this.formation.word);}
    return reduced;
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
      b.alignX=0;b.alignY=0;b.neighbors=0;b.separateX=0;b.separateY=0;b.neighborTurn=0;b.neighborWeight=0;
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
          const influence=1/(1+d2/(this.targetDistance**2*4));
          if(!this.formation || (a.letter===b.letter&&(a.letter||a.reserveSide===b.reserveSide))){
          a.neighborTurn+=b.turn*influence;a.neighborWeight+=influence;
          b.neighborTurn+=a.turn*influence;b.neighborWeight+=influence;
          a.centerX+=b.x;a.centerY+=b.y;a.alignX+=b.headingX;a.alignY+=b.headingY;a.neighbors++;
          b.centerX+=a.x;b.centerY+=a.y;b.alignX+=a.headingX;b.alignY+=a.headingY;b.neighbors++;
          }
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
    // Turning momentum travels through a local neighborhood; it is not a
    // shared route or a global heading oscillator (Attanasi et al., nphys3035).
    for(const b of birds){
      b.followX=b.headingX;b.followY=b.headingY;b.turnSignal=b.turn;
      if(b.neighbors){
        b.followX=b.alignX/b.neighbors;b.followY=b.alignY/b.neighbors;
        b.turnSignal=b.neighborTurn/b.neighborWeight;
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
    for(const group of this.groups){
      const x=group.reduce((sum,i)=>sum+birds[i].x,0)/group.length,y=group.reduce((sum,i)=>sum+birds[i].y,0)/group.length;
      for(const i of group){birds[i].flockCenterX=x;birds[i].flockCenterY=y;}
    }
    if(this.groups.length>1 && !this.formation) {
      const summaries=this.groups.map(members=>({members,
        key:Math.min(...members.map(i=>birds[i].id)),
        x:members.reduce((sum,i)=>sum+birds[i].x,0)/members.length,
        y:members.reduce((sum,i)=>sum+birds[i].y,0)/members.length,
        vx:members.reduce((sum,i)=>sum+birds[i].vx,0)/members.length,
        vy:members.reduce((sum,i)=>sum+birds[i].vy,0)/members.length}));
      const main=summaries.reduce((a,b)=>a.members.length>=b.members.length?a:b);
      const active=new Set();
      for(const group of summaries) {
        if(group===main)continue;
        active.add(group.key);
        const distance=Math.hypot(main.x-group.x,main.y-group.y);
        let track=this.mergeTracks.get(group.key);
        if(!track){track={distance,at:this.time,stalled:0,side:group.y<main.y?-1:1};this.mergeTracks.set(group.key,track);}
        if(this.time-track.at>=.75){
          const elapsed=this.time-track.at,progress=(track.distance-distance)/elapsed;
          track.stalled=progress<this.cruiseSpeed*.08?track.stalled+elapsed:Math.max(0,track.stalled-elapsed*2);
          track.distance=distance;track.at=this.time;
        }
        // A stale pursuit is replaced by a wider intercept, not another tug
        // toward the same nearest bird. The pair shares this approach decision.
        const wider=clamp((track.stalled-2)/3,0,1);
        // Do not project past the pursuing group: that creates a moving
        // carrot and can keep an already-ahead pair running away forever.
        const lead=Math.min(clamp(distance/this.catchupSpeed,.4,1.6),distance*.35/(Math.hypot(main.vx,main.vy)||1));
        const dx=main.x-group.x,dy=main.y-group.y,d=distance||1;
        const offset=Math.min(90,this.targetDistance*2.5)*wider*track.side;
        const targetX=clamp(main.x+main.vx*lead-dy/d*offset,MARGIN+45,this.width-MARGIN-45);
        const targetY=clamp(main.y+main.vy*lead+dx/d*offset,MARGIN+45,this.height-MARGIN-45);
        for(const i of group.members) {
          const b=birds[i];b.merging=true;b.mergeStalled=track.stalled;
          b.mergeX=targetX;b.mergeY=targetY;
        }
      }
      for(const key of this.mergeTracks.keys())if(!active.has(key))this.mergeTracks.delete(key);
    } else this.mergeTracks.clear();
  }

  anticipate() {
    // Look ahead in time, independently of the original flocking neighborhood.
    // Small birds at high population still need time to react at the same pace.
    // Closest-approach prediction: https://www.red3d.com/cwr/steer/Unaligned.html
    const birds=this.birds,horizon=1.2,comfort=this.minDistance*1.15;
    const range=Math.max(60,120*this.scale,this.cruiseSpeed*1.4+this.minDistance),range2=range*range;
    this.safetyGrid.build(birds,this.width,this.height,range);
    const {head,next,columns,rows}=this.safetyGrid;
    for(const b of birds){
      b.threatTime=Infinity;b.threatRisk=0;
      b.future ||= new Float64Array(12);
      // A turning neighbor will not continue along its current tangent.
      for(let k=0;k<6;k++){
        const t=(k+1)*.2,w=b.turn;
        b.future[k*2]=Math.abs(w)<.01?b.vx*t:b.speed*(Math.sin(b.angle+w*t)-Math.sin(b.angle))/w;
        b.future[k*2+1]=Math.abs(w)<.01?b.vy*t:b.speed*(Math.cos(b.angle)-Math.cos(b.angle+w*t))/w;
      }
    }
    const warn=(a,b,dx,dy,px,py,time,risk)=>{
      if(dx*a.headingX+dy*a.headingY < -this.minDistance*.5 || time>=a.threatTime)return;
      a.threatTime=time;a.threatRisk=risk;
      if(a.avoidBird!==b.id){
        const side=a.headingX*py-a.headingY*px;
        a.avoidSide=Math.abs(side)>.1 ? -Math.sign(side) : 1;
        a.avoidBird=b.id;
      }
      a.threatAngle=a.angle+a.avoidSide*Math.atan2(comfort,Math.max(comfort,Math.hypot(dx,dy)*.6));
    };
    for(let i=0;i<birds.length;i++){
      const a=birds[i],cx=Math.floor(a.x/range),cy=Math.floor(a.y/range);
      for(let gy=Math.max(0,cy-1);gy<=Math.min(rows-1,cy+1);gy++)for(let gx=Math.max(0,cx-1);gx<=Math.min(columns-1,cx+1);gx++){
        for(let j=head[gx+gy*columns];j!==-1;j=next[j]){
          if(j<=i)continue;
          const b=birds[j],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
          if(d2>range2)continue;
          const vx=b.vx-a.vx,vy=b.vy-a.vy,v2=vx*vx+vy*vy,closing=dx*vx+dy*vy;
          if(closing>=0||v2<4)continue;
          let entry=Infinity,px=0,py=0;
          const time=-closing/v2;
          if(time>0&&time<=horizon){
            const lx=dx+vx*time,ly=dy+vy*time,miss2=lx*lx+ly*ly;
            if(miss2<comfort*comfort){entry=Math.max(0,time-Math.sqrt((comfort*comfort-miss2)/v2));px=lx;py=ly;}
          }
          let lastX=dx,lastY=dy;
          for(let k=0;k<6&&k*.2<entry;k++){
            const x=dx+b.future[k*2]-a.future[k*2],y=dy+b.future[k*2+1]-a.future[k*2+1];
            const sx=x-lastX,sy=y-lastY,segment2=sx*sx+sy*sy;
            const fraction=clamp(-(lastX*sx+lastY*sy)/(segment2||1),0,1);
            const qx=lastX+sx*fraction,qy=lastY+sy*fraction;
            if(qx*qx+qy*qy<comfort*comfort){entry=(k+fraction)*.2;px=qx;py=qy;}
            lastX=x;lastY=y;
          }
          if(!Number.isFinite(entry))continue;
          const risk=clamp(1-entry/horizon,0,1);
          warn(a,b,dx,dy,px,py,entry,risk);
          warn(b,a,-dx,-dy,-px,-py,entry,risk);
        }
      }
    }
  }

  avoid(b,heading,dt) {
    let risk=b.threatRisk||0,angle=b.threatAngle;
    // Predict arrival at each wall. Only an approaching bird needs to yield;
    // flying parallel to a boundary must not put the whole flock on an orbit.
    const buffer=this.radius+12;
    // Keep a small clearance band active until the bird has actually left it.
    // Becoming momentarily parallel must not release the turn back into a wall.
    const left=boundaryRisk(b.x-MARGIN,-b.vx,buffer);
    const right=boundaryRisk(this.width-MARGIN-b.x,b.vx,buffer);
    const top=boundaryRisk(b.y-MARGIN,-b.vy,buffer);
    const bottom=boundaryRisk(this.height-MARGIN-b.y,b.vy,buffer);
    let nx=left-right,ny=top-bottom;
    const wallRisk=Math.max(left,right,top,bottom);
    if(wallRisk>0 && (wallRisk>=risk || wallRisk>.2)){
      const length=Math.hypot(nx,ny)||1;nx/=length;ny/=length;
      const tx=-ny,ty=nx;
      let side=b.wallSide ?? Math.sign(tx*b.headingX+ty*b.headingY);
      if(b.wallSide===undefined && Math.abs(tx*b.headingX+ty*b.headingY)<.2){
        const preferred=difference(heading,b.angle);
        side=Math.sign(preferred*(b.headingX*ty-b.headingY*tx))||1;
      }
      b.wallSide=side||1;
      angle=Math.atan2(ny*.7+ty*b.wallSide,nx*.7+tx*b.wallSide);risk=wallRisk;
    }
    if(wallRisk===0)b.wallSide=undefined;
    if(risk>0)b.safetyAngle=angle;
    else b.avoidBird=undefined;
    b.safetyRisk=(b.safetyRisk||0)+clamp(risk-(b.safetyRisk||0),-dt*2.5,dt*5);
    const blend=clamp(b.safetyRisk*1.4,0,1);
    return {
      heading:blend?heading+difference(b.safetyAngle,heading)*blend:heading,
      pace:1-b.safetyRisk*.55
    };
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
    updateFormation(this,dt);
    this.scale+=clamp(this.targetScale-this.scale,-dt*.4,dt*.15);
    this.measure();
    if(this.time >= (this.nextAnticipation || 0)){
      this.anticipate();this.nextAnticipation=this.time+1/20;
    }
    const turnLimit=2.1*Math.sqrt(this.cruiseSpeed/CRUISE_SPEED);
    for(const b of this.birds) {
      const nearest=this.birds[b.nearest];
      // Retain the bird's momentum while gently matching nearby headings.
      let sx=b.headingX*1.7+b.followX*4,sy=b.headingY*1.7+b.followY*4;
      if(b.neighbors){
        sx+=(b.centerX/b.neighbors-b.x)*.012/this.scale;
        sy+=(b.centerY/b.neighbors-b.y)*.012/this.scale;
      }
      if(nearest){
        const pull=clamp((b.distance-this.targetDistance)*.035/this.scale,0,3);
        const dx=nearest.x-b.x,dy=nearest.y-b.y,d=Math.hypot(dx,dy)||1;
        sx+=dx/d*pull;sy+=dy/d*pull;
        if(b.distance>this.linkDistance*.72)b.catchingUp=true;
        if(b.distance<52*this.scale)b.catchingUp=false;
      } else b.catchingUp=false;
      if(b.merging){
        const dx=b.mergeX-b.x,dy=b.mergeY-b.y,d=Math.hypot(dx,dy)||1;
        sx=sx*.16+dx/d*7;sy=sy*.16+dy/d*7;
      } else {
        const dx=b.flockCenterX-b.x,dy=b.flockCenterY-b.y,d=Math.hypot(dx,dy)||1;
        const radius=Math.max(this.targetDistance*2,this.targetDistance*Math.sqrt(this.birds.length)*.7);
        const ex=Math.min(radius,(this.width-2*MARGIN)*.42),ey=Math.min(radius,(this.height-2*MARGIN)*.38);
        const tether=Math.max(0,Math.hypot(dx/ex,dy/ey)-1);
        sx+=dx/d*tether*3;sy+=dy/d*tether*3;
      }
      sx+=b.separateX*2.6;sy+=b.separateY*2.6;
      const variation=Math.sin(this.time*.22+b.phase)*.035;
      sx-=b.headingY*variation;sy+=b.headingX*variation;
      const wallRange=Math.min(115,Math.min(this.width,this.height)*.26);
      const wall=d=>Math.max(0,1-d/wallRange)**2*11;
      sx+=wall(b.x-MARGIN)-wall(this.width-MARGIN-b.x);
      sy+=wall(b.y-MARGIN)-wall(this.height-MARGIN-b.y);
      const freeSpeed=(b.catchingUp||b.merging)?this.catchupSpeed:this.cruiseSpeed;
      const guide=formationGuidance(this,b,Math.atan2(sy,sx),freeSpeed);
      const avoidance=this.avoid(b,guide.heading,dt);
      const urgent=(b.safetyRisk||0)>.25;
      const carried=b.merging||urgent||guide.blend>.1?0:clamp(b.turnSignal,-1.2,1.2)*.55;
      const arriving=guide.blend>.1;
      const wanted=clamp(difference(avoidance.heading,b.angle)*(urgent||arriving?3:2)+carried,-turnLimit,turnLimit);
      const response=urgent?7:arriving?6:3.5,acceleration=urgent?9:arriving?6:3.2;
      b.turn+=clamp((wanted-b.turn)*Math.min(1,dt*response),-acceleration*dt,acceleration*dt);
      b.nextAngle=b.angle+b.turn*dt;
      // Yielding cancels catch-up thrust before the gap becomes crowded.
      const target=(b.safetyRisk>.001?Math.min(guide.speed,this.cruiseSpeed):guide.speed)*avoidance.pace;
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
      // The safety clamp never reverses a heading; anticipation turns the bird.
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
