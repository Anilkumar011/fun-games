// Shared, articulated sparrow geometry. All dimensions use the original bird's
// scene units: ~20 px wingspan at 100% size. No changes to flock positions/scale.
import * as THREE from './vendor/three.module.min.js';
import {flightPose} from './renderer.mjs';
import {clamp} from './flock.mjs';

const brown=new THREE.Color('#806449'),buff=new THREE.Color('#c7b99d'),dark=new THREE.Color('#443b32');
function combine(parts){
  const arrays={position:[],normal:[],uv:[],color:[]};
  for(const geometry of parts){
    const g=geometry.index?geometry.toNonIndexed():geometry;
    for(const name of Object.keys(arrays))arrays[name].push(...g.getAttribute(name).array);
    if(g!==geometry)g.dispose();geometry.dispose();
  }
  const result=new THREE.BufferGeometry();
  for(const [name,array] of Object.entries(arrays))result.setAttribute(name,new THREE.Float32BufferAttribute(array,name==='uv'?2:3));
  result.computeBoundingSphere();return result;
}
function painted(geometry,paint){
  const positions=geometry.getAttribute('position'),colors=[];
  for(let i=0;i<positions.count;i++){
    const c=typeof paint==='function'?paint(positions.getX(i),positions.getY(i),positions.getZ(i)):new THREE.Color(paint);
    colors.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
}
function ellipsoid(center,radii,paint){
  const g=new THREE.SphereGeometry(1,16,10);g.scale(...radii);g.translate(...center);return painted(g,paint);
}
// A cambered feather with a rounded tip, raised shaft and fine UV barbs.
function feather(base,tip,width,color){
  const dx=tip[0]-base[0],dy=tip[1]-base[1],length=Math.hypot(dx,dy),px=-dy/length,py=dx/length;
  const positions=[],uv=[],indices=[];
  for(let row=0;row<=6;row++){
    const t=row/6,profile=Math.sin(Math.PI*(.03+t*.94))**.5;
    for(let col=0;col<3;col++){
      const lateral=(col-1)*width*profile;
      positions.push(base[0]+dx*t+px*lateral,base[1]+dy*t+py*lateral,
        base[2]+(tip[2]-base[2])*t+Math.sin(Math.PI*t)*.12+(col===1?.055:0));
      uv.push(col/2,t);
    }
  }
  for(let row=0;row<6;row++)for(let col=0;col<2;col++){
    const a=row*3+col;indices.push(a,a+1,a+3,a+1,a+4,a+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return painted(g,color);
}
export function createBirdGeometry(){
  const body=[];
  body.push(ellipsoid([-.9,0,.9],[4.5,2.25,2.15],(x,y,z)=>{
    const belly=clamp((1.1-z)*.65,0,1),c=brown.clone().lerp(buff,belly);
    // Small overlapping covert markings across the back, not smooth plastic.
    const fleck=Math.sin(x*5+Math.sin(y*8))*Math.cos(y*9+z*3);
    return c.multiplyScalar(z>1.5?.88+fleck*.1:1);
  }));
  body.push(ellipsoid([2.8,0,1.9],[2.5,1.65,1.85],(x,y,z)=>z>2.75?dark.clone():buff.clone().lerp(brown,clamp((z-1.8)*.5,0,.7))));
  body.push(ellipsoid([4.15,0,2.15],[1.55,1.5,1.5],(x,y,z)=>z>2.8?brown.clone().multiplyScalar(.7):buff.clone()));
  for(const side of [-1,1]){
    body.push(ellipsoid([3.7,side*1.39,1.95],[1.15,.16,.68],'#d6c9ad'));
    body.push(ellipsoid([4.65,side*1.22,2.7],[.32,.2,.32],'#171716'));
    body.push(ellipsoid([4.73,side*1.37,2.81],[.075,.035,.075],'#f7ede0'));
  }
  const beak=new THREE.ConeGeometry(.65,2.1,8);beak.rotateZ(-Math.PI/2);beak.scale(1,1,.7);beak.translate(6.1,0,1.95);body.push(painted(beak,'#7e6b45'));
  const tail=[];
  for(let i=0;i<7;i++){const s=(i-3)/3;tail.push(feather([-3.6,s*.4,.65],[-9.2+Math.abs(s)*.4,s*2.5,.25],.55,i%2?'#5b4a37':'#786149'));}
  const parts={body:combine(body),tail:combine(tail)};
  for(const side of [-1,1]){
    const inner=[],outer=[],tip=[];
    // Shoulder-to-elbow coverts and overlapping secondary feathers.
    inner.push(ellipsoid([-.2,side*1.35,0],[1.7,2,.42],'#8f7555'));
    for(let i=0;i<7;i++)inner.push(feather([.55-i*.13,side*(.3+i*.42),.12],[-3.8-i*.08,side*(.55+i*.44),-.06],.6,i%2?'#725c44':'#927a5a'));
    // Forearm coverts overlap the independent wrist section throughout a flap.
    outer.push(ellipsoid([-.35,side*.9,0],[1.3,1.6,.3],'#8c7250'));
    for(let i=0;i<5;i++)outer.push(feather([.1-i*.15,side*(i*.4),.1],[-3.25-i*.1,side*(.45+i*.5),-.1],.47,i%2?'#9f8965':'#705940'));
    for(let i=0;i<7;i++){
      const t=i/6;tip.push(feather([-.15-t*1.2,side*t*.65,.02],[-1.1-t*3.4,side*(3.6-t*1.8),-.18-t*.12],.42,i%2?'#6b5742':'#8c7454'));
    }
    const label=side===1?'left':'right';
    parts[label+'Inner']=combine(inner);parts[label+'Outer']=combine(outer);parts[label+'Tip']=combine(tip);
  }
  return parts;
}

export function articulatedPose(b,time){
  const {bank,stroke}=flightPose(b,time),phase=b.wingPhase+b.phase;
  const recovery=clamp((Math.cos(phase)+.15)*.8,0,1);
  const effort=clamp(Math.abs(stroke)*1.5,0,1);
  const braking=b.safetyRisk||0;
  return {bank,shoulder:stroke,elbow:-stroke*.32+recovery*effort*.24,
    wrist:Math.sin(phase-.45)*effort*.22,fold:recovery*effort*.25,
    tail:clamp(b.turn*.08,-.18,.18),pitch:braking*.13,fan:1+braking*.25};
}
const localMatrix=new THREE.Matrix4();
const position=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),euler=new THREE.Euler();
function transform(x,y,z,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx){
  position.set(x,y,z);scale.set(sx,sy,sz);quaternion.setFromEuler(euler.set(rx,ry,rz,'ZYX'));
  return localMatrix.compose(position,quaternion,scale);
}
export function birdMatrices(b,time,size,cx,cy,matrices={}){
  const p=articulatedPose(b,time);
  const root=(matrices.body ||= new THREE.Matrix4()).copy(transform(b.x-cx,cy-b.y,0,-p.bank,-p.pitch,-b.angle,size));
  (matrices.tail ||= new THREE.Matrix4()).copy(root).multiply(transform(-3.6,0,.65,0,p.pitch*.6,p.tail,1,p.fan,1)).multiply(transform(3.6,0,-.65));
  for(const side of [-1,1]){
    const label=side===1?'left':'right';
    const inner=(matrices[label+'Inner'] ||= new THREE.Matrix4()).copy(root).multiply(transform(.4,side*1.4,1.6,side*p.shoulder));
    const outer=(matrices[label+'Outer'] ||= new THREE.Matrix4()).copy(inner).multiply(transform(-.45,side*2.7,0,side*p.elbow,0,side*p.fold));
    const tip=(matrices[label+'Tip'] ||= new THREE.Matrix4()).copy(outer).multiply(transform(-.4,side*2,0,side*p.wrist,0,side*p.fold*.35));
    matrices[label+'Inner']=inner;matrices[label+'Outer']=outer;matrices[label+'Tip']=tip;
  }
  return matrices;
}
