import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { geometryFor } from './geometry.js';
import { evaluatedGeometry, geometrySignature } from './boolean.js';
import { analyzeFits } from './fit-analysis.js';
export { geometryFor } from './geometry.js';

export function makeMesh(object,geometry=geometryFor(object)) {
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:object.color,roughness:.6,metalness:.08}));
  updateTransform(mesh,object); return mesh;
}
function updateTransform(mesh,object) {
  mesh.position.fromArray(object.position);
  mesh.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad),'XYZ');
  mesh.material.color.set(object.color); mesh.userData.id=object.id;
  mesh.visible=object.hole!==true;
}
export function disposeMesh(mesh) { mesh.geometry.dispose(); mesh.material.dispose(); }
function prepareChanges(project,meshes) {
  const prepared=new Map();
  try {
    for(const object of project.objects) {
      try {
        if(meshes.get(object.id)?.userData.geometry!==geometrySignature(object,project)) prepared.set(object.id,evaluatedGeometry(object,project));
      } catch(error) { throw new Error(`Geometry ${object.name} (${object.id}): ${error.message}`,{cause:error}); }
    }
    return prepared;
  } catch(error) { prepared.forEach(geometry=>geometry.dispose()); throw error; }
}

export class CadView {
  constructor(container,onSelect) {
    this.container=container; this.onSelect=onSelect; this.meshes=new Map(); this.selectedId=null;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#101826');
    this.model=new THREE.Group(); this.scene.add(this.model);
    this.camera=new THREE.PerspectiveCamera(40,1,.1,2000000); this.camera.up.set(0,0,1);
    this.camera.position.set(420,-550,400);
    this.renderer=new THREE.WebGLRenderer({antialias:true}); this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace; container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement); this.controls.enableDamping=true;
    this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
    this.controls.target.set(0,0,50); this.controls.minDistance=1; this.controls.maxDistance=1500000;
    this.scene.add(new THREE.HemisphereLight('#e6f0ff','#384157',2.5));
    const light=new THREE.DirectionalLight('#fff0de',3); light.position.set(300,-300,600); this.scene.add(light);
    const grid=new THREE.GridHelper(2000,80,'#435269','#29364a'); grid.rotation.x=Math.PI/2; this.scene.add(grid);
    const axes=new THREE.AxesHelper(180); axes.position.z=.15; this.scene.add(axes);
    this.selection=new THREE.BoxHelper(new THREE.Object3D(),'#8fbaef'); this.selection.visible=false; this.scene.add(this.selection);
    this.raycaster=new THREE.Raycaster();
    let down=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{ down={x:e.clientX,y:e.clientY}; });
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(e.button!==0 || !down || Math.hypot(e.clientX-down.x,e.clientY-down.y)>5) return;
      const r=this.renderer.domElement.getBoundingClientRect();
      const p=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(p,this.camera);
      const hit=this.raycaster.intersectObjects([...this.meshes.values()].filter(mesh=>mesh.visible))[0];
      this.onSelect(hit?.object.userData.id||null);
    });
    new ResizeObserver(()=>this.resize()).observe(container); this.resize();
    this.renderer.setAnimationLoop(()=>{ this.controls.update(); this.renderer.render(this.scene,this.camera); });
  }
  resize() {
    const {width,height}=this.container.getBoundingClientRect();
    if(!width||!height) return;
    this.camera.aspect=width/height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width,height);
  }
  prepare(project) { return prepareChanges(project,this.meshes); }
  analyzeFits(project) { return analyzeFits(project); }
  sync(project,prepared=prepareChanges(project,this.meshes)) {
    const present=new Set(project.objects.map(o=>o.id));
    for(const [id,mesh] of this.meshes) if(!present.has(id)) { this.model.remove(mesh); disposeMesh(mesh); this.meshes.delete(id); }
    for(const o of project.objects) {
      let mesh=this.meshes.get(o.id);
      const signature=geometrySignature(o,project);
      if(!mesh) { mesh=makeMesh(o,prepared.get(o.id)); this.meshes.set(o.id,mesh); this.model.add(mesh); }
      else {
        if(prepared.has(o.id)) { mesh.geometry.dispose(); mesh.geometry=prepared.get(o.id); }
        updateTransform(mesh,o);
      }
      mesh.userData.geometry=signature;
    }
    this.model.updateMatrixWorld(true); this.select(present.has(this.selectedId) ? this.selectedId : null);
  }
  select(id) {
    const mesh=this.meshes.get(id);
    this.selectedId=id; this.selection.visible=!!mesh?.visible && !!mesh.geometry.getAttribute('position').count;
    if(this.selection.visible) this.selection.setFromObject(this.meshes.get(id));
  }
  frame() {
    const box=new THREE.Box3();
    for(const mesh of this.meshes.values()) if(mesh.visible && mesh.geometry.getAttribute('position').count) box.expandByObject(mesh);
    if(box.isEmpty()) { this.controls.target.set(0,0,50); this.camera.position.set(420,-550,400); this.controls.update(); return; }
    const center=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3()).length();
    const narrowFov=Math.min(this.camera.fov,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect)));
    const distance=Math.max(100,size/(2*Math.tan(THREE.MathUtils.degToRad(narrowFov/2)))*1.25);
    this.controls.target.copy(center); this.camera.position.copy(center).add(new THREE.Vector3(1,-1.35,.95).normalize().multiplyScalar(distance));
    this.controls.update();
  }
  captureReviewImage() {
    const box=new THREE.Box3();
    for(const mesh of this.meshes.values()) if(mesh.visible && mesh.geometry.getAttribute('position').count) box.expandByObject(mesh);
    if(box.isEmpty()) throw new Error('Add at least one visible object before visual review.');
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    if(!context) throw new Error('Scene capture is unavailable in this browser.');
    const tile=300,labels=['Perspective','Side','Front'];
    canvas.width=tile*3;canvas.height=tile;
    const center=box.getCenter(new THREE.Vector3()),radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
    const distance=Math.max(100,radius/Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*1.35);
    const directions=[new THREE.Vector3(1,-1.35,.95),new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0)];
    const size=this.renderer.getSize(new THREE.Vector2()),pixelRatio=this.renderer.getPixelRatio();
    const position=this.camera.position.clone(),target=this.controls.target.clone(),aspect=this.camera.aspect,selection=this.selection.visible;
    try {
      this.selection.visible=false;this.renderer.setPixelRatio(1);this.renderer.setSize(tile,tile,false);
      this.camera.aspect=1;this.camera.updateProjectionMatrix();
      for(const [index,direction] of directions.entries()) {
        this.controls.target.copy(center);this.camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
        this.controls.update();this.renderer.render(this.scene,this.camera);
        context.drawImage(this.renderer.domElement,index*tile,0,tile,tile);
        context.fillStyle='#101826cc';context.fillRect(index*tile+10,10,88,24);
        context.fillStyle='#d9e4f2';context.font='12px sans-serif';context.fillText(labels[index],index*tile+18,27);
      }
      return canvas.toDataURL('image/jpeg',.78);
    } finally {
      this.renderer.setPixelRatio(pixelRatio);this.renderer.setSize(size.x,size.y,false);
      this.camera.aspect=aspect;this.camera.updateProjectionMatrix();this.controls.target.copy(target);this.camera.position.copy(position);
      this.controls.update();this.selection.visible=selection;this.renderer.render(this.scene,this.camera);
    }
  }
}
