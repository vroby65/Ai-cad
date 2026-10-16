import * as THREE from 'three';
import { evaluatedGeometry, intersectionVolume } from './boolean.js';

const MAX_EXACT_TRIANGLES=10000;
const MAX_SAMPLES=128;

function transform(object) {
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation.map(THREE.MathUtils.degToRad),'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...object.position),rotation,new THREE.Vector3(1,1,1));
}
function triangleCount(geometry) { return (geometry.index?.count??geometry.getAttribute('position').count)/3; }
function boxDistance(a,b) {
  let squared=0;
  for(const axis of ['x','y','z']) {
    const gap=Math.max(a.min[axis]-b.max[axis],b.min[axis]-a.max[axis],0);
    squared+=gap*gap;
  }
  return Math.sqrt(squared);
}
function samples(geometry) {
  const position=geometry.getAttribute('position'),count=Math.min(position.count,MAX_SAMPLES),points=[];
  for(let i=0;i<count;i++) points.push(new THREE.Vector3().fromBufferAttribute(position,Math.floor(i*position.count/count)));
  return points;
}
function pointDistance(points,geometry,best=Infinity) {
  const position=geometry.getAttribute('position'),triangle=new THREE.Triangle(),closest=new THREE.Vector3();
  const count=geometry.index?.count??position.count;
  for(const point of points) for(let i=0;i<count;i+=3) {
    const ids=[0,1,2].map(offset=>geometry.index?geometry.index.getX(i+offset):i+offset);
    triangle.a.fromBufferAttribute(position,ids[0]);triangle.b.fromBufferAttribute(position,ids[1]);triangle.c.fromBufferAttribute(position,ids[2]);
    triangle.closestPointToPoint(point,closest);best=Math.min(best,point.distanceTo(closest));
    if(best<1e-7) return 0;
  }
  return best;
}
function surfaceDistance(a,b) { return pointDistance(samples(b),a,pointDistance(samples(a),b)); }
function worldGeometry(object,project) {
  const geometry=evaluatedGeometry(object,project);geometry.applyMatrix4(transform(object));geometry.computeBoundingBox();return geometry;
}

export function analyzeFits(project) {
  const geometries=new Map(),reports=[];
  const geometry=id=>{
    if(!geometries.has(id)) geometries.set(id,worldGeometry(project.objects.find(object=>object.id===id),project));
    return geometries.get(id);
  };
  try {
    for(const object of project.objects) for(const targetId of object.fit?.targetIds||[]) {
      const target=project.objects.find(candidate=>candidate.id===targetId),glassGeometry=geometry(object.id),bodyGeometry=geometry(targetId);
      const clearance=boxDistance(glassGeometry.boundingBox,bodyGeometry.boundingBox);
      const report={objectId:object.id,objectName:object.name,targetId,targetName:target.name,tolerance:object.fit.maxGap,clearance};
      if(clearance>0) reports.push({...report,status:clearance>object.fit.maxGap?'too-far':'within-tolerance'});
      else if(triangleCount(glassGeometry)+triangleCount(bodyGeometry)>MAX_EXACT_TRIANGLES) reports.push({...report,status:'uncertain',reason:'Exact overlap check exceeds 10000 triangles.'});
      else {
        let overlapVolume;
        try { overlapVolume=intersectionVolume(glassGeometry,bodyGeometry); }
        catch { reports.push({...report,status:'uncertain',reason:'Exact overlap check could not be completed.'});continue; }
        if(overlapVolume>1e-6) reports.push({...report,status:'penetrating',overlapVolume});
        else {
          const measured=surfaceDistance(glassGeometry,bodyGeometry);
          reports.push({...report,clearance:measured,status:measured>object.fit.maxGap?'too-far':'within-tolerance'});
        }
      }
    }
    return reports;
  } finally { for(const geometry of geometries.values()) geometry.dispose(); }
}
