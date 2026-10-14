import { Flock, capacityForViewport, parseCount, clamp } from './flock.mjs';

const canvas=document.querySelector('#field');
const wrap=document.querySelector('#canvas-wrap');
const context=canvas.getContext('2d');
const countInput=document.querySelector('#count');
const speedInput=document.querySelector('#flight-speed');
const message=document.querySelector('#message');
const pauseButton=document.querySelector('#pause');
const palette=[['#79614e','#51483f','#b39d7d'],['#827a70','#514c47','#bab2a1'],['#9c8161','#62503d','#cfb99b'],['#66594d','#3e3933','#a8957e'],['#9b9183','#62594d','#c7b9a3']];
let flock;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionFactor=paused?0:1;
let previousTime=0,accumulator=0,lastStats=0;
let frameSamples=[];

function updateStats() {
  document.querySelector('#live-count').textContent=flock.birds.length.toLocaleString();
  document.querySelector('#group-count').textContent=flock.groups.length;
  document.querySelector('#groups-label').textContent=flock.groups.length===1?'flock':'groups gathering';
  document.querySelector('#speed').textContent=Math.round(flock.cruiseSpeed);
  document.querySelector('#bird-scale').textContent=`${Math.round(flock.scale*100)}% size`;
}
function syncControls(writeCount=true) {
  countInput.max=flock.capacity;
  if(writeCount)countInput.value=flock.birds.length;
  document.querySelector('#count-help').textContent=`1–${flock.capacity.toLocaleString()} birds · size adapts to the flock`;
  for(const button of document.querySelectorAll('[data-count]'))button.setAttribute('aria-pressed',Number(button.dataset.count)===flock.birds.length);
  updateStats();
}
function resize() {
  const bounds=wrap.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(bounds.width*ratio);canvas.height=Math.round(bounds.height*ratio);
  context.setTransform(ratio,0,0,ratio,0,0);
  const capacity=capacityForViewport(innerWidth,innerHeight);
  if(!flock)flock=new Flock(bounds.width,bounds.height,12,Math.random,capacity);
  else if(flock.resize(bounds.width,bounds.height,capacity))message.textContent='Phone-sized views allow up to 300 birds. The first 300 keep flying.';
  syncControls(document.activeElement!==countInput);render();
}
function render() {
  context.clearRect(0,0,flock.width,flock.height);
  for(const b of flock.birds) {
    const colors=palette[b.id%palette.length];
    const flap=.6+.4*Math.sin(b.wingPhase+b.phase);
    const wing=4.1+flap*4.7;
    context.save();context.translate(b.x,b.y);context.rotate(b.angle);
    context.scale(flock.scale,flock.scale*(1-Math.min(.13,Math.abs(b.turn)*.045)));
    // Rounded swept wings, tapered tail, body, head, and a warm feather highlight.
    context.fillStyle=colors[0];context.beginPath();
    context.moveTo(2,0);
    context.quadraticCurveTo(1,-wing*.8,-4,-wing);
    context.quadraticCurveTo(-4.9,-wing*.45,-3,0);
    context.quadraticCurveTo(-4.9,wing*.45,-4,wing);
    context.quadraticCurveTo(1,wing*.8,2,0);context.fill();
    context.fillStyle=colors[1];context.beginPath();
    context.moveTo(-3,0);context.lineTo(-8,-2.1);context.lineTo(-7.2,0);context.lineTo(-8,2.1);context.closePath();context.fill();
    context.beginPath();context.ellipse(-.3,0,4.8,1.8,0,0,Math.PI*2);context.fill();
    context.beginPath();context.arc(3.7,0,2,0,Math.PI*2);context.fill();
    context.fillStyle=colors[2];context.beginPath();
    context.ellipse(-.7,-.5,3.1,.65,0,0,Math.PI*2);context.fill();
    context.fillStyle='#bc9b6c';context.beginPath();context.moveTo(5,-.65);context.lineTo(7,0);context.lineTo(5,.65);context.fill();
    context.restore();
  }
}
function setPaused(value) {
  paused=value;
  pauseButton.setAttribute('aria-pressed',paused);
  document.querySelector('#pause-label').textContent=paused?'Resume':'Pause';
  document.querySelector('#pause-icon').textContent=paused?'▷':'Ⅱ';
  document.querySelector('.live-dot').style.background=paused?'#b39473':'#5d8e9b';
  updatePlayback();
}
function updatePlayback() {
  document.querySelector('#state-label').textContent=paused?(motionFactor>.001?'SLOWING TO A PAUSE':'PAUSED'):'IN FLIGHT';
  document.querySelector('#paused-overlay').hidden=!(paused&&motionFactor<.001);
}
function changeCount(value,writeCount=false) {
  const count=parseCount(value,flock.capacity);
  if(count===null) {
    countInput.setAttribute('aria-invalid','true');
    message.textContent=countInput.value===''?'Enter a count when you’re ready. The flock keeps flying.':`Choose a whole number from 1 to ${flock.capacity.toLocaleString()}.`;
    return;
  }
  countInput.removeAttribute('aria-invalid');
  if(count!==flock.birds.length)flock.setCount(count);
  syncControls(writeCount);render();
  message.textContent='';
}
countInput.addEventListener('input',()=>changeCount(countInput.value));
countInput.addEventListener('change',()=>changeCount(countInput.value));
countInput.addEventListener('blur',()=>{
  if(parseCount(countInput.value,flock.capacity)===null) {
    countInput.value=flock.birds.length;countInput.removeAttribute('aria-invalid');
    message.textContent=`Keeping ${flock.birds.length.toLocaleString()} birds in the sky.`;
  }
});
document.querySelector('#count-form').addEventListener('submit',event=>{event.preventDefault();changeCount(countInput.value);});
for(const button of document.querySelectorAll('[data-count]'))button.addEventListener('click',()=>changeCount(button.dataset.count,true));
speedInput.addEventListener('input',()=>{
  const multiplier=Number(speedInput.value);
  flock.setSpeed(multiplier);
  document.querySelector('#speed-value').textContent=`${multiplier.toFixed(1)}×`;
  speedInput.setAttribute('aria-valuetext',`${multiplier.toFixed(1)} times normal flight speed`);
});
document.querySelector('#reset').addEventListener('click',()=>{
  flock.reset();syncControls();render();message.textContent='A fresh flight, with the same flock size and pace.';
});
pauseButton.addEventListener('click',()=>setPaused(!paused));
document.addEventListener('visibilitychange',()=>{previousTime=0;accumulator=0;});

function frame(now) {
  const rawElapsed=previousTime?(now-previousTime)/1000:0;
  const elapsed=Math.min(rawElapsed,.05);
  previousTime=now;
  if(!document.hidden) {
    motionFactor+=clamp((paused?0:1)-motionFactor,-elapsed*3,elapsed*2);
    if(motionFactor>.0001) {
      accumulator+=elapsed;
      while(accumulator>=1/120){flock.step(motionFactor/120);accumulator-=1/120;}
      render();
    } else accumulator=0;
    updatePlayback();
    if(now-lastStats>350){updateStats();lastStats=now;}
    // Lightweight DOM-visible diagnostics for reproducible browser performance checks.
    if(elapsed>0&&!paused){frameSamples.push(rawElapsed);if(frameSamples.length>120)frameSamples.shift();}
    if(frameSamples.length)canvas.dataset.fps=String(Math.round(frameSamples.length/frameSamples.reduce((a,b)=>a+b,0)));
    canvas.dataset.birds=String(flock.birds.length);
  }
  requestAnimationFrame(frame);
}
resize();new ResizeObserver(resize).observe(wrap);
window.addEventListener('resize',resize);
setPaused(paused);requestAnimationFrame(frame);
