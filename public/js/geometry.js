import * as THREE from 'three';
import { profileGeometry } from './profiles.js';
import { applyModifiers } from './deform.js';

export function geometryFor(object) {
  return applyModifiers(baseGeometry(object),object.modifiers);
}
function baseGeometry(object) {
  const d=object.dimensions;
  switch(object.type) {
    case 'box': return new THREE.BoxGeometry(d.x,d.y,d.z);
    case 'sphere': return new THREE.SphereGeometry(d.radius,32,20);
    case 'cylinder': {
      const g=new THREE.CylinderGeometry(d.radius,d.radius,d.height,48);
      g.rotateX(Math.PI/2); return g;
    }
    case 'cone': {
      const g=new THREE.ConeGeometry(d.radius,d.height,48);
      g.rotateX(Math.PI/2); return g;
    }
    case 'torus': return new THREE.TorusGeometry(d.radius,d.tube,24,64);
    case 'extrude': case 'lathe': return profileGeometry(object);
    case 'mesh': {
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(object.vertices,3));
      g.computeBoundingBox();
      const size=g.boundingBox.getSize(new THREE.Vector3());
      g.scale(size.x ? d.x/size.x : 1,size.y ? d.y/size.y : 1,size.z ? d.z/size.z : 1);
      g.computeVertexNormals(); return g;
    }
    default: throw new Error('Unknown primitive.');
  }
}
