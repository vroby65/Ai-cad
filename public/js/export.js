import * as THREE from 'three';
import { STLExporter } from '../vendor/STLExporter.js';
import { makeMesh, disposeMesh } from './renderer.js';
import { evaluatedGeometry } from './boolean.js';

export function exportSTL(project) {
  if(!project.objects.length) throw new Error('Add at least one object before exporting.');
  const group=new THREE.Group();
  try {
    for(const object of project.objects.filter(o=>!o.hole)) {
      const geometry=evaluatedGeometry(object,project);
      if(!geometry.getAttribute('position').count) { geometry.dispose(); continue; }
      group.add(makeMesh(object,geometry));
    }
    if(!group.children.length) throw new Error('No solid material to export: hole tools are excluded from STL.');
    group.updateMatrixWorld(true);
    return new STLExporter().parse(group,{binary:true});
  } finally { group.children.forEach(disposeMesh); }
}
