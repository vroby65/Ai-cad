import * as THREE from 'three';
import { STLExporter } from '../vendor/STLExporter.js';
import { makeMesh, disposeMesh } from './renderer.js';
import { evaluatedGeometry } from './boolean.js';

function exportScene(project,format,serialize) {
  if(!project.objects.length) throw new Error('Add at least one object before exporting.');
  const group=new THREE.Group();
  try {
    for(const object of project.objects.filter(o=>!o.hole)) {
      const geometry=evaluatedGeometry(object,project);
      if(!geometry.getAttribute('position').count) { geometry.dispose(); continue; }
      group.add(makeMesh(object,geometry));
    }
    if(!group.children.length) throw new Error(`No solid material to export: hole tools are excluded from ${format}.`);
    group.updateMatrixWorld(true);
    return serialize(group);
  } finally { group.children.forEach(disposeMesh); }
}

export function exportSTL(project) {
  return exportScene(project,'STL',group=>new STLExporter().parse(group,{binary:true}));
}

function number(value) {
  if(Math.abs(value)<1e-9) return '0';
  return String(Number(value.toPrecision(12)));
}

export function exportOBJ(project) {
  return exportScene(project,'OBJ',group=>{
    const lines=['# AIcad OBJ export','# Units: millimeters'];
    const vertex=new THREE.Vector3();
    let offset=1;
    for(const mesh of group.children) {
      const positions=mesh.geometry.getAttribute('position');
      const index=mesh.geometry.getIndex();
      lines.push(`o ${mesh.userData.id}`);
      for(let i=0;i<positions.count;i++) {
        vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        lines.push(`v ${number(vertex.x)} ${number(vertex.y)} ${number(vertex.z)}`);
      }
      if(index) {
        for(let i=0;i<index.count;i+=3) lines.push(`f ${offset+index.getX(i)} ${offset+index.getX(i+1)} ${offset+index.getX(i+2)}`);
      } else {
        for(let i=0;i<positions.count;i+=3) lines.push(`f ${offset+i} ${offset+i+1} ${offset+i+2}`);
      }
      offset+=positions.count;
    }
    return lines.join('\n')+'\n';
  });
}
