// A small code-native 5×7 alphabet keeps lettering deterministic and offline.
// Each lit point is a destination for one bird; there is no painted text in the sky.
const alphabet={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],
 K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','11001','10101','10011','10011','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
 Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
 W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111']
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function validateWord(value){
 const text=String(value??'').trim();
 if(!text)return {valid:false,word:'',error:'Enter a word of 1–6 letters.'};
 if(!/^[a-zA-Z]+$/.test(text))return {valid:false,word:text,error:'Use letters A–Z only, with no spaces or numbers.'};
 if(text.length>6)return {valid:false,word:text,error:'Use up to six letters.'};
 return {valid:true,word:text.toUpperCase(),error:''};
}
export function layoutWord(word,width,height){
 const checked=validateWord(word);if(!checked.valid)throw new Error(checked.error);
 const columns=checked.word.length*6-1;
 const gap=Math.min(29,(width-48)*.8/Math.max(4,columns-1),(height-48)*.46/6);
 const span=(columns-1)*gap,high=6*gap,points=[];
 for(let c=0;c<checked.word.length;c++)alphabet[checked.word[c]].forEach((row,y)=>[...row].forEach((pixel,x)=>{
  if(pixel==='1')points.push({x:(c*6+x)*gap-span/2,y:(y-3)*gap,letter:c});
 }));
 return {word:checked.word,points,gap,width:span,height:high,
  maxScale:Math.min(1,gap/31),ampX:Math.max(2,Math.min(32,(width-48-span)/2-36)),ampY:Math.max(12,Math.min(40,(height-48-high)/2-36))};
}
function assignNearby(birds,points,cx,cy){
 const choices=[];
 birds.forEach((b,i)=>points.forEach((p,j)=>choices.push({i,j,d:(b.x-cx-p.x)**2+(b.y-cy-p.y)**2})));
 choices.sort((a,b)=>a.d-b.d||a.i-b.i||a.j-b.j);
 const usedBirds=new Set(),usedPoints=new Set(),pairs=[];
 for(const c of choices)if(!usedBirds.has(c.i)&&!usedPoints.has(c.j)){
  usedBirds.add(c.i);usedPoints.add(c.j);pairs.push({bird:birds[c.i],point:c.j});if(pairs.length===points.length)break;
 }
 // Remove avoidable crossings without changing assignments during flight.
 const cost=(b,p)=>Math.hypot(b.x-cx-p.x,b.y-cy-p.y);
 for(let pass=0;pass<3;pass++)for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
  const a=pairs[i],b=pairs[j],pa=points[a.point],pb=points[b.point];
  if(cost(a.bird,pb)+cost(b.bird,pa)+.1<cost(a.bird,pa)+cost(b.bird,pb))[a.point,b.point]=[b.point,a.point];
 }
 return new Map(pairs.map(p=>[p.bird.id,p.point]));
}
export function startFormation(flock,value){
 const checked=validateWord(value);if(!checked.valid)return checked;
 const plan=layoutWord(checked.word,flock.width,flock.height);
 const oldIds=new Set(flock.birds.map(b=>b.id));
 flock.setPopulation(Math.min(flock.capacity,Math.max(flock.selectedCount,flock.birds.length,plan.points.length)));
 const state={...plan,phase:'assembling',startedAt:flock.time,orbit:0,blend:0,holdElapsed:0,readyFor:0,
  cx:flock.width/2,cy:flock.height/2+plan.ampY,vx:plan.ampX*.18,vy:0,progress:0,elapsed:0,releaseElapsed:0};
 state.assignment=assignNearby(flock.birds,plan.points,state.cx,state.cy);
 for(const b of flock.birds){b.letter=state.assignment.has(b.id);b.reserveSide=b.y<state.cy?-1:1;b.departing=false;if(!oldIds.has(b.id))b.opacity=0;}
 flock.formation=state;flock.targetScale=Math.min(flock.desiredScale(),plan.maxScale);
 return {valid:true,word:checked.word,count:flock.birds.length};
}
export function releaseFormation(flock){
 if(!flock.formation)return;
 flock.formation.phase='releasing';flock.formation.releaseElapsed=0;
}
export function updateFormation(flock,dt){
 const state=flock.formation;
 if(!state)return;
 state.elapsed+=dt;
 state.orbit+=dt*.18*Math.sqrt(flock.cruiseSpeed/42);
 state.cx=flock.width/2+state.ampX*Math.sin(state.orbit);
 state.cy=flock.height/2+state.ampY*Math.cos(state.orbit);
 const omega=.18*Math.sqrt(flock.cruiseSpeed/42);
 state.vx=state.ampX*Math.cos(state.orbit)*omega;state.vy=-state.ampY*Math.sin(state.orbit)*omega;
 if(state.phase==='releasing'){
  state.releaseElapsed+=dt;state.blend=Math.max(0,state.blend-dt/2.8);
  for(let i=0;i<flock.birds.length;i++){
   const b=flock.birds[i];b.departing=i>=flock.selectedCount;
   b.opacity=clamp((b.opacity??1)+(b.departing&&state.releaseElapsed>1?-dt/2:dt),0,1);
  }
  if(state.releaseElapsed>=3.1){
   flock.lastFormation={word:state.word,heldFor:state.holdElapsed,formedAt:state.formedAt,endedAt:flock.time};
   flock.birds=flock.birds.slice(0,flock.selectedCount);
   for(const b of flock.birds){b.letter=false;b.departing=false;b.opacity=1;}
   flock.formation=null;flock.targetScale=flock.desiredScale();flock.measure();
  }
  return;
 }
 state.blend=Math.min(1,state.blend+dt/2);
 flock.targetScale=Math.min(flock.desiredScale(),state.maxScale);
 for(const b of flock.birds)b.opacity=Math.min(1,(b.opacity??1)+dt/.9);
 let close=0,sum=0,max=0,obscuring=0;
 for(const b of flock.birds){
  const index=state.assignment.get(b.id);
  if(index!==undefined){
   const p=state.points[index],d=Math.hypot(state.cx+p.x-b.x,state.cy+p.y-b.y);
   sum+=d*d;max=Math.max(max,d);if(d<state.gap*.38)close++;
  } else if(Math.abs(b.x-state.cx)<state.width/2+state.gap*.45&&Math.abs(b.y-state.cy)<state.height/2+state.gap*.45)obscuring++;
 }
 state.progress=close/state.points.length;state.rms=Math.sqrt(sum/state.points.length);state.maxError=max;state.obscuring=obscuring;
 // Once most slots are occupied, let a nearer bird take an unfilled slot if
 // the approach is stalled. Occupied, close slots keep their assignments.
 if(state.phase==='assembling'&&state.elapsed>8&&state.elapsed>=(state.nextAssignment??0)){
  state.nextAssignment=state.elapsed+4;
  if(state.progress<.98||max>state.gap){
   const occupied=new Map(),fixedBirds=new Set(),openPoints=[];
   for(const b of flock.birds){const i=state.assignment.get(b.id);if(i===undefined)continue;
    const p=state.points[i];if(Math.hypot(state.cx+p.x-b.x,state.cy+p.y-b.y)<state.gap*.45){occupied.set(b.id,i);fixedBirds.add(b.id);}
   }
   const fixedPoints=new Set(occupied.values());
   state.points.forEach((p,i)=>{if(!fixedPoints.has(i))openPoints.push({...p,index:i});});
   const remaining=flock.birds.filter(b=>!fixedBirds.has(b.id));
   for(const [id,i] of assignNearby(remaining,openPoints,state.cx,state.cy))occupied.set(id,openPoints[i].index);
   state.assignment=occupied;
   for(const b of flock.birds){const assigned=occupied.has(b.id);if(b.letter&&!assigned)b.reserveSide=b.y<state.cy?-1:1;b.letter=assigned;}
  }
 }
 const readable=state.progress>=.97&&state.rms<state.gap*.35&&max<state.gap*2&&obscuring===0&&state.blend===1;
 state.readyFor=readable?state.readyFor+dt:0;
 if(state.phase==='assembling'&&state.readyFor>=.45){state.phase='holding';state.formedAt=flock.time;state.holdElapsed=0;}
 else if(state.phase==='holding'){
  // The display time starts only after arrival and pauses if readability slips.
  if(state.progress>=.96&&state.rms<state.gap*.45&&obscuring===0)state.holdElapsed+=dt;
  if(state.holdElapsed>=5)releaseFormation(flock);
 }
}
export function formationGuidance(flock,b,normalHeading,normalSpeed){
 const state=flock.formation;if(!state)return {heading:normalHeading,speed:normalSpeed,blend:0};
 const index=state.assignment.get(b.id);
 let vx,vy;
 if(index!==undefined){
  const p=state.points[index],dx=state.cx+p.x-b.x,dy=state.cy+p.y-b.y;
  vx=state.vx+dx*.85;vy=state.vy+dy*.85;
 }else{
  // Spare birds keep flying in clear bands above and below the lettering.
  const side=b.reserveSide;
  const half=state.height/2+state.gap*1.1+flock.radius;
  const top=side<0?24:state.cy+half,bottom=side<0?state.cy-half:flock.height-24;
  const range=Math.max(20,Math.min(80,(bottom-top)*.48));
  const wall=d=>Math.max(0,1-d/range)**2*12;
  const sx=b.headingX*1.7+b.followX*4+b.separateX*3+wall(b.x-24)-wall(flock.width-24-b.x);
  const sy=b.headingY*1.7+b.followY*4+b.separateY*3+wall(b.y-top)-wall(bottom-b.y);
  const heading=Math.atan2(sy,sx),pace=Math.min(normalSpeed,flock.cruiseSpeed*.75);
  vx=Math.cos(heading)*pace;vy=Math.sin(heading)*pace;
 }
 if(b.departing){vx=Math.cos(normalHeading)*normalSpeed;vy=(b.id%2?-1:1)*normalSpeed*.35;}
 const heading=Math.atan2(vy,vx),error=Math.abs(difference(heading,b.angle));
 // Slow before the turn, so a missed slot produces a small, smooth approach
 // instead of a wide orbit around birds that have already arrived.
 const turning=.08+.92*Math.max(0,Math.cos(error))**2;
 const speed=clamp(Math.hypot(vx,vy)*turning,2,flock.catchupSpeed);
 return {heading:normalHeading+difference(heading,normalHeading)*state.blend,
  speed:normalSpeed+(speed-normalSpeed)*state.blend,blend:state.blend};
}
