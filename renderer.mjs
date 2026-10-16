// Lightweight 3D geometry projected onto Canvas: no remote assets or GPU library.
// Physics remains in a horizontal flight plane; articulated wings and banking
// have real height, foreshortening, depth order, and directional face lighting.
import { clamp, CRUISE_SPEED } from './flock.mjs';
const TAU=Math.PI*2;
const plumage=[[113,88,64],[125,115,99],[151,119,79],[94,80,67],[143,130,109]];

export function makeCamera(flock,perspective=true){
  const tilt=perspective?.46:0;
  return {cx:flock.width/2,cy:flock.height/2,focal:Math.max(flock.width,flock.height)*4,
    cos:Math.cos(tilt),sin:Math.sin(tilt),zoom:1,width:flock.width,height:flock.height};
}
export function project(camera,x,y,z=0) {
  const dx=x-camera.cx,dy=y-camera.cy;
  const depth=-dy*camera.sin-z*camera.cos;
  const perspective=camera.focal/(camera.focal+depth);
  return {x:camera.width/2+dx*perspective*camera.zoom,
    y:camera.height/2+(dy*camera.cos-z*camera.sin)*perspective*camera.zoom,
    scale:perspective*camera.zoom,depth};
}

function drawClouds(ctx,camera) {
  const w=camera.width,h=camera.height;
  for(let layer=0;layer<2;layer++){
    const motion={x:0,y:0};
    const tileW=Math.max(440,w*.9),tileH=Math.max(290,h*.8);
    const ox=((motion.x%tileW)+tileW)%tileW,oy=((motion.y%tileH)+tileH)%tileH;
    for(let row=-1;row<=Math.ceil(h/tileH);row++)for(let col=-1;col<=Math.ceil(w/tileW);col++){
      const x=col*tileW+ox+tileW*(layer?.4:.1),y=row*tileH+oy+tileH*(layer?.2:.55);
      const radius=layer?Math.min(w*.15,115):Math.min(w*.24,180);
      const puffs=[[-.7,.12,.65],[-.25,-.12,.9],[.25,0,.8],[.7,.14,.52]];
      for(const [px,py,size] of puffs){
        ctx.save();ctx.translate(x+px*radius,y+py*radius);ctx.scale(radius*size,radius*size*.44);
        const cloud=ctx.createRadialGradient(0,-.15,.1,0,0,1);
        cloud.addColorStop(0,layer?'#fffffff0':'#ffffffa0');
        cloud.addColorStop(.55,layer?'#ffffffb0':'#ffffff50');
        cloud.addColorStop(1,'#ffffff00');ctx.fillStyle=cloud;ctx.fillRect(-1,-1,2,2);ctx.restore();
      }
    }
  }
}
function color(rgb,light) {
  return `rgb(${Math.round(rgb[0]*light)},${Math.round(rgb[1]*light)},${Math.round(rgb[2]*light)})`;
}
// Presentation units preserve the original leisurely scene speed. This is a
// coordinated-turn pose (tan(bank) = speed * turnRate / gravity), not a new
// flight controller or a claim that the original pixel simulation uses SI units.
// Lift components: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/banking-turns/
const DISPLAY_GRAVITY = CRUISE_SPEED * 4;
export function flightPose(b,time) {
  const bank=clamp(-Math.atan2(b.speed*b.turn,DISPLAY_GRAVITY),-.65,.65);
  const load=1/Math.cos(bank);
  let power=clamp((Math.sin(time*.65+b.phase)+.2)*1.4,0,1);
  power=power*power*(3-2*power);
  // Catch-up and banked turns ask for more wing effort; cruising can glide.
  power=Math.max(power,clamp((load-1)*2+(b.catchingUp || b.merging ? .65 : 0),0,1));
  const stroke=.10+(Math.sin(b.wingPhase+b.phase)*.62-.10)*power;
  return {bank,stroke};
}

function drawBird(ctx,b,scale,camera,detail,time) {
  const {bank,stroke}=flightPose(b,time);
  const ca=Math.cos(b.angle),sa=Math.sin(b.angle),cb=Math.cos(bank),sb=Math.sin(bank);
  const altitude=Math.sin(b.phase)*1.4*scale;
  const transform=([x,y,z])=>{
    const by=y*cb-z*sb,bz=y*sb+z*cb;
    return [b.x+(x*ca-by*sa)*scale,b.y+(x*sa+by*ca)*scale,altitude+bz*scale];
  };
  const faces=[];
  const add=(points,rgb,shade=1,rounded=false)=>{
    const world=points.map(transform),points2=world.map(p=>project(camera,...p));
    const a=world[0],u=world[1].map((v,i)=>v-a[i]),v=world[2].map((v,i)=>v-a[i]);
    const nx=u[1]*v[2]-u[2]*v[1],ny=u[2]*v[0]-u[0]*v[2],nz=u[0]*v[1]-u[1]*v[0];
    const length=Math.hypot(nx,ny,nz)||1;
    const light=.78+Math.abs((nx*-.35+ny*-.4+nz*.85)/length)*.34;
    faces.push({points:points2,depth:points2.reduce((s,p)=>s+p.depth,0)/points2.length,fill:color(rgb,light*shade),rounded});
  };
  const base=plumage[b.id%plumage.length],dark=base.map(n=>n*.64),pale=base.map(n=>Math.min(230,n*1.32));
  for(const side of [-1,1]) {
    const wing=(x,y,z=0)=>[x,side*y*Math.cos(stroke),z+y*Math.sin(stroke)];
    const root=[2,side*1.5,.8],elbow=wing(1.2,5,.65),tip=wing(-3.7,10.1,.1),trailing=wing(-6.1,5,-.3);
    add([root,elbow,tip,trailing,[-3,side*1,.1]],base,1,true);
    add([root,elbow,trailing],pale,.88);
    if(detail)for(let feather=0;feather<4;feather++) {
      const y=5.1+feather*1.1;
      add([wing(.2-feather*.9,y,.4),wing(-4.6-feather*.15,y+1.2,-.05),wing(-5.6-feather*.05,y+.45,-.1)],dark,1.1);
    }
  }
  add([[-3,0,.2],[-9.4,-2.8,-.5],[-8.6,0,-.25]],dark);
  add([[-3,0,.2],[-8.6,0,-.25],[-9.4,2.8,-.5]],base);
  // Closed ellipsoids provide a full chest and rounded head, with light
  // changing across the actual surface rather than a flat body silhouette.
  const ellipsoid=(cx,cy,cz,rx,ry,rz,rgb)=>{
    if(!detail){
      add([[cx+rx,cy,cz],[cx,cy-ry,cz],[cx-rx,cy,cz],[cx,cy,cz+rz]],rgb);
      add([[cx+rx,cy,cz],[cx,cy,cz+rz],[cx-rx,cy,cz],[cx,cy+ry,cz]],rgb,.78);
      return;
    }
    const rings=5,sides=8;
    const point=(ring,side)=>{
      const theta=Math.PI*ring/rings,phi=TAU*side/sides;
      return [cx+rx*Math.cos(theta),cy+ry*Math.sin(theta)*Math.cos(phi),cz+rz*Math.sin(theta)*Math.sin(phi)];
    };
    for(let r=0;r<rings;r++)for(let side=0;side<sides;side++)
      add([point(r,side),point(r+1,side),point(r+1,side+1),point(r,side+1)],rgb);
  };
  ellipsoid(-.8,0,.9,5.1,2.4,2.05,base);
  ellipsoid(3.6,0,1.75,2.2,1.8,1.7,dark.map(n=>n*1.18));
  add([[5,-.8,1.8],[7,0,.9],[5.5,.7,1.3]],[181,147,91]);
  faces.sort((a,b)=>b.depth-a.depth);
  for(const face of faces){
    ctx.beginPath();
    if(face.rounded){
      const p=face.points,last=p[p.length-1];ctx.moveTo((last.x+p[0].x)/2,(last.y+p[0].y)/2);
      p.forEach((v,i)=>{const next=p[(i+1)%p.length];ctx.quadraticCurveTo(v.x,v.y,(v.x+next.x)/2,(v.y+next.y)/2);});
    }else face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();
  }
  if(detail){const eye=project(camera,...transform([4.5,-1.45,2.3]));ctx.fillStyle='#292824';ctx.beginPath();ctx.arc(eye.x,eye.y,Math.max(.45,.28*scale*eye.scale),0,TAU);ctx.fill();}
}

const palette=[['#79614e','#51483f','#b39d7d'],['#827a70','#514c47','#bab2a1'],['#9c8161','#62503d','#cfb99b'],['#66594d','#3e3933','#a8957e'],['#9b9183','#62594d','#c7b9a3']];
function drawOriginalBirds(ctx,flock) {
  for(const b of flock.birds) {
    const colors=palette[b.id%palette.length];
    const flap=.6+.4*Math.sin(b.wingPhase+b.phase);
    const wing=4.1+flap*4.7;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
    ctx.scale(flock.scale,flock.scale*(1-Math.min(.13,Math.abs(b.turn)*.045)));
    // Rounded swept wings, tapered tail, body, head, and a warm feather highlight.
    ctx.fillStyle=colors[0];ctx.beginPath();
    ctx.moveTo(2,0);
    ctx.quadraticCurveTo(1,-wing*.8,-4,-wing);
    ctx.quadraticCurveTo(-4.9,-wing*.45,-3,0);
    ctx.quadraticCurveTo(-4.9,wing*.45,-4,wing);
    ctx.quadraticCurveTo(1,wing*.8,2,0);ctx.fill();
    ctx.fillStyle=colors[1];ctx.beginPath();
    ctx.moveTo(-3,0);ctx.lineTo(-8,-2.1);ctx.lineTo(-7.2,0);ctx.lineTo(-8,2.1);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.ellipse(-.3,0,4.8,1.8,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(3.7,0,2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=colors[2];ctx.beginPath();
    ctx.ellipse(-.7,-.5,3.1,.65,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#bc9b6c';ctx.beginPath();ctx.moveTo(5,-.65);ctx.lineTo(7,0);ctx.lineTo(5,.65);ctx.fill();
    ctx.restore();
  }
}

export function renderScene(ctx,flock,perspective=true,backgroundOnly=false) {
  const {width:w,height:h}=flock,camera=makeCamera(flock,perspective);
  ctx.clearRect(0,0,w,h);
  const sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#a4cce4');sky.addColorStop(.6,'#d3e6ee');sky.addColorStop(1,'#eef1eb');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const sun=ctx.createRadialGradient(w*.81,h*.17,0,w*.81,h*.17,w*.36);
  sun.addColorStop(0,'#fff8dd8c');sun.addColorStop(1,'#fff8dd00');ctx.fillStyle=sun;ctx.fillRect(0,0,w,h);
  drawClouds(ctx,camera);
  if(backgroundOnly)return camera;
  if(!perspective){drawOriginalBirds(ctx,flock);return camera;}
  const ordered=flock.birds.map(b=>({b,p:project(camera,b.x,b.y)})).sort((a,b)=>b.p.depth-a.p.depth);
  for(const {b,p} of ordered)drawBird(ctx,b,flock.scale,camera,flock.scale*p.scale>.65,flock.time);
  return camera;
}
