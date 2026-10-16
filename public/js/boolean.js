import * as THREE from 'three';
import { CSG, Vertex, Polygon } from '../vendor/csg-lib.js';
import { geometryFor } from './geometry.js';
import { MAX_BOOLEAN_TRIANGLES } from './limits.js';

function holesFor(object,project) {
  if(object.hole) return [];
  return project.objects.filter(hole=>hole.hole===true && (hole.targetIds ? hole.targetIds.includes(object.id) : hole.groupId===object.groupId));
}
export function geometrySignature(object,project) {
  const holes=holesFor(object,project);
  return JSON.stringify([object.type,object.dimensions,object.vertices,object.profile,object.modifiers,object.hole,
    holes.length ? [object.position,object.rotation,holes.map(hole=>[hole.id,hole.type,hole.dimensions,hole.profile,hole.modifiers,hole.position,hole.rotation])] : null]);
}
function transform(object) {
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad),'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...object.position),rotation,new THREE.Vector3(1,1,1));
}
function toCSG(geometry) {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),polygons=[];
  const count=geometry.index ? geometry.index.count : position.count;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
  for(let i=0;i<count;i+=3) {
    const ids=[0,1,2].map(j=>geometry.index ? geometry.index.getX(i+j) : i+j);
    a.fromBufferAttribute(position,ids[0]); b.fromBufferAttribute(position,ids[1]); c.fromBufferAttribute(position,ids[2]);
    cross.crossVectors(b.clone().sub(a),c.clone().sub(a));
    if(cross.lengthSq()<1e-16) continue;
    polygons.push(new Polygon(ids.map(id=>new Vertex({x:position.getX(id),y:position.getY(id),z:position.getZ(id)},
      {x:normal.getX(id),y:normal.getY(id),z:normal.getZ(id)}))));
  }
  return CSG.fromPolygons(polygons);
}
function fromCSG(csg) {
  const triangles=csg.polygons.reduce((count,polygon)=>count+polygon.vertices.length-2,0);
  if(triangles>MAX_BOOLEAN_TRIANGLES) throw new Error(`Cut too complex: ${triangles} triangles generated; maximum ${MAX_BOOLEAN_TRIANGLES} per part.`);
  const positions=[],normals=[];
  for(const polygon of csg.polygons) for(let i=2;i<polygon.vertices.length;i++) {
    for(const vertex of [polygon.vertices[0],polygon.vertices[i-1],polygon.vertices[i]]) {
      const p=vertex.pos,n=vertex.normal;
      if(![p.x,p.y,p.z,n.x,n.y,n.z].every(Number.isFinite)) throw new Error('Invalid cut. Change the hole tool position or dimensions.');
      positions.push(p.x,p.y,p.z); normals.push(n.x,n.y,n.z);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geometry;
}
function volume(geometry) {
  const p=geometry.getAttribute('position'),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(); let total=0;
  const count=geometry.index ? geometry.index.count : p.count;
  for(let i=0;i<count;i+=3) {
    const ids=[0,1,2].map(j=>geometry.index ? geometry.index.getX(i+j) : i+j);
    a.fromBufferAttribute(p,ids[0]); b.fromBufferAttribute(p,ids[1]); c.fromBufferAttribute(p,ids[2]);
    total+=a.dot(b.cross(c))/6;
  }
  return Math.abs(total);
}
export function intersectionVolume(first,second) {
  const result=toCSG(first).intersect(toCSG(second));
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let total=0;
  for(const polygon of result.polygons) for(let i=2;i<polygon.vertices.length;i++) {
    const points=[polygon.vertices[0],polygon.vertices[i-1],polygon.vertices[i]].map(vertex=>vertex.pos);
    a.set(points[0].x,points[0].y,points[0].z);b.set(points[1].x,points[1].y,points[1].z);c.set(points[2].x,points[2].y,points[2].z);
    total+=a.dot(b.cross(c))/6;
  }
  return Math.abs(total);
}
function subtractGeometry(object,holes,requireCut=false) {
  const base=geometryFor(object);
  if(!holes.length) return base;
  base.computeBoundingBox();
  const inverse=transform(object).invert(); let result=null;
  try {
    const originalVolume=requireCut || object.type==='mesh' ? volume(base) : 0;
    if(requireCut && (!originalVolume || (object.type==='mesh' && Object.values(object.dimensions).some(n=>n===0)))) throw new Error('Cutting requires a solid with volume: use a closed STL, not a planar surface.');
    for(const hole of holes) {
      const cutter=geometryFor(hole);
      try {
        cutter.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,transform(hole))); cutter.computeBoundingBox();
        if(!base.boundingBox.intersectsBox(cutter.boundingBox)) continue;
        if(object.type==='mesh' && (!originalVolume || Object.values(object.dimensions).some(n=>n===0))) throw new Error('Cutting requires a closed mesh with volume, not a planar surface.');
        result=(result??toCSG(base)).subtract(toCSG(cutter));
        if(!result.polygons.length) break;
      } finally { cutter.dispose(); }
    }
    if(result) {
      const geometry=fromCSG(result);
      if(requireCut && originalVolume-volume(geometry)<=Math.max(1e-9,originalVolume*1e-8)) {
        geometry.dispose(); throw new Error('Hole tools do not remove material from the solid. Check position and dimensions.');
      }
      base.dispose(); return geometry;
    }
    if(requireCut) throw new Error('No intersection between hole tools and the solid: no material removed.');
    return base;
  } catch(error) { base.dispose(); throw error; }
}
export function evaluatedGeometry(object,project) { return subtractGeometry(object,holesFor(object,project)); }

export function carveObject(object,tools) {
  const geometry=subtractGeometry(object,tools,true);
  try {
    if(!geometry.getAttribute('position').count) return null;
    geometry.computeBoundingBox();
    const center=geometry.boundingBox.getCenter(new THREE.Vector3()),size=geometry.boundingBox.getSize(new THREE.Vector3());
    const position=center.clone().applyMatrix4(transform(object));
    geometry.translate(-center.x,-center.y,-center.z);
    const {hole,targetIds,vertices,profile,modifiers,...result}=object;
    return {...result,type:'mesh',dimensions:{x:size.x,y:size.y,z:size.z},position:position.toArray(),vertices:Array.from(geometry.getAttribute('position').array)};
  } finally { geometry.dispose(); }
}
