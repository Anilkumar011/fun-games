import * as THREE from './vendor/three.module.min.js';
import {createBirdGeometry,birdMatrices} from './bird-model.mjs';
import {MAX_COUNT} from './flock.mjs';

function featherTexture(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e4d6b9';ctx.fillRect(0,0,64,128);
  // Shaft and paired barbs are shared by every cambered flight feather.
  for(let y=0;y<140;y+=4){ctx.strokeStyle=y%8?'#c6b493':'#aa9575';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y-15);ctx.lineTo(32,y);ctx.lineTo(64,y-15);ctx.stroke();}
  ctx.fillStyle='#efe2c3';ctx.fillRect(31,0,2,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class BirdRenderer {
  constructor(canvas){
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x000000,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera();
    this.scene.add(new THREE.HemisphereLight('#dceeff','#a29179',2.2));
    const sun=new THREE.DirectionalLight('#fff2d7',3.2);sun.position.set(-240,260,420);this.scene.add(sun);
    const fill=new THREE.DirectionalLight('#c1d9ec',.65);fill.position.set(120,-120,80);this.scene.add(fill);
    this.texture=featherTexture();
    const body=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0});
    const feathers=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0,map:this.texture,bumpMap:this.texture,bumpScale:.045,side:THREE.DoubleSide});
    // Per-bird screen-door transparency keeps the eight instanced draw calls
    // and opaque depth ordering, while temporary birds gently arrive/depart.
    this.opacity=new THREE.InstancedBufferAttribute(new Float32Array(MAX_COUNT).fill(1),1);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    for(const material of [body,feathers])material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float birdOpacity;\nvarying float flockOpacity;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nflockOpacity = birdOpacity;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float flockOpacity;')
        .replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat fadeNoise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));\nif (flockOpacity <= fadeNoise) discard;');
    };
    this.transforms=[];this.meshes={};this.colors=[0xffffff,0xe5dfd4,0xf6e7cc,0xd6c9ba,0xede8df].map(c=>new THREE.Color(c));
    for(const [name,geometry] of Object.entries(createBirdGeometry())){
      geometry.setAttribute('birdOpacity',this.opacity);
      const mesh=new THREE.InstancedMesh(geometry,name==='body'?body:feathers,MAX_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;
      this.scene.add(mesh);this.meshes[name]=mesh;
    }
  }
  resize(width,height,ratio){
    this.width=width;this.height=height;
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);
    const focal=Math.max(width,height)*4,tilt=.46;
    this.camera.fov=2*Math.atan(height/(2*focal))*180/Math.PI;
    this.camera.aspect=width/height;this.camera.near=1;this.camera.far=focal*3;
    this.camera.position.set(0,-focal*Math.sin(tilt),focal*Math.cos(tilt));
    this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();
  }
  render(flock){
    const ids=`${flock.birds.length}:${flock.birds[0].id}:${flock.birds.at(-1).id}`;
    const changed=this.ids!==ids;this.ids=ids;
    const parts=this.parts ||= Object.entries(this.meshes);
    for(let i=0;i<flock.birds.length;i++){
      const b=flock.birds[i],matrices=birdMatrices(b,flock.time,flock.scale,this.width/2,this.height/2,this.transforms[i] ||= {});
      this.opacity.array[i]=b.opacity??1;
      for(const [name,mesh] of parts){
        mesh.setMatrixAt(i,matrices[name]);
        if(changed)mesh.setColorAt(i,this.colors[b.id%this.colors.length]);
      }
    }
    this.opacity.needsUpdate=true;
    for(const mesh of Object.values(this.meshes)){
      mesh.count=flock.birds.length;mesh.instanceMatrix.needsUpdate=true;
      if(changed)mesh.instanceColor.needsUpdate=true;
    }
    this.renderer.render(this.scene,this.camera);
    this.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);
    this.canvas.dataset.renderer='webgl';
  }
}
