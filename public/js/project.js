import { MAX_PROJECT_BYTES, MAX_OBJECTS, MAX_OPERATIONS, MAX_STL_TRIANGLES, MAX_HOLES, MAX_BOOLEAN_PAIRS } from './limits.js';
import { carveObject } from './boolean.js';
import { geometryFor } from './geometry.js';
import { validateProfile } from './profiles.js';
import { validateModifiers } from './deform.js';
import * as THREE from 'three';

export function fields(value,required,optional=[]) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) throw new Error('Expected a JSON object.');
  const keys=Object.keys(value); const allowed=new Set([...required,...optional]);
  const missing=required.filter(k=>!Object.hasOwn(value,k)),extra=keys.filter(k=>!allowed.has(k));
  if(missing.length || extra.length) throw new Error('Missing or unexpected fields.'+(missing.length ? ' Missing: '+missing.join(', ')+'.' : '')+(extra.length ? ' Unexpected: '+extra.slice(0,10).map(k=>k.slice(0,64)).join(', ')+'.' : ''));
}
function text(value,max) {
  if(typeof value!=='string' || !value.trim() || Array.from(value).length>max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid or oversized text.');
}
function id(value) {
  if(typeof value!=='string' || /[\r\n]/.test(value) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error('Invalid ID.');
}
function number(value,min,max) {
  if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max) throw new Error(`Number out of bounds [${min}, ${max}].`);
}
function vector(value,limit=100000) {
  if(!Array.isArray(value) || value.length!==3) throw new Error('Expected a vector [x,y,z].');
  for(const n of value) number(n,-limit,limit);
}
function dimensions(value,type) {
  const keys={box:['x','y','z'],sphere:['radius'],cylinder:['radius','height'],cone:['radius','height'],torus:['radius','tube'],extrude:['x','y','z'],lathe:['radius','height'],mesh:['x','y','z']}[type];
  if(!Array.isArray(keys)) throw new Error('Unsupported primitive.');
  fields(value,keys); for(const key of keys) number(value[key],type==='mesh'?0:.1,10000);
  if(type==='torus' && (value.tube>=value.radius || value.radius+value.tube>5000)) throw new Error('Torus: tube radius must be smaller than main radius; maximum diameter 10000 mm.');
  if(type==='lathe' && value.radius>5000) throw new Error('Revolution: maximum radius 5000 mm.');
}
function meshVertices(o) {
  if(!Array.isArray(o.vertices) || !o.vertices.length || o.vertices.length%9 || o.vertices.length>MAX_STL_TRIANGLES*9) throw new Error('Mesh: 1–20000 triangles allowed.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<o.vertices.length;i++) { const n=o.vertices[i]; number(n,-10000,10000); const axis=i%3; min[axis]=Math.min(min[axis],n); max[axis]=Math.max(max[axis],n); }
  for(const [i,key] of ['x','y','z'].entries()) {
    const extent=max[i]-min[i];
    if(extent>10000 || Math.abs(min[i]+max[i])>.01) throw new Error('Mesh vertices are out of bounds or not centered.');
    if(extent===0 ? o.dimensions[key]!==0 : o.dimensions[key]===0) throw new Error('Mesh dimensions do not match vertices. A planar axis must stay planar.');
  }
  if(min.filter((n,i)=>max[i]>n).length<2) throw new Error('The mesh must have a surface.');
}
function fit(value,ownerId) {
  fields(value,['targetIds','maxGap']);
  if(!Array.isArray(value.targetIds) || !value.targetIds.length || value.targetIds.length>MAX_OBJECTS || new Set(value.targetIds).size!==value.targetIds.length) throw new Error('Invalid glass fit targets.');
  for(const target of value.targetIds) { id(target); if(target===ownerId) throw new Error('Glass fit cannot target itself.'); }
  number(value.maxGap,0,1000);
}
function object(value) {
  const profiled=['extrude','lathe'].includes(value?.type);
  fields(value,['id','type','name','dimensions','position','rotation','color','groupId',...(profiled?['profile']:[])],['modifiers','fit',...(value?.type==='mesh'?['vertices']:['hole','targetIds'])]);
  if(profiled) validateProfile(value.profile,value.type);
  if(Object.hasOwn(value,'modifiers')) validateModifiers(value.modifiers);
  if(Object.hasOwn(value,'hole') && typeof value.hole!=='boolean') throw new Error('hole must be a boolean.');
  if(value.fit && value.hole===true) throw new Error('A hole tool cannot be checked as glass.');
  id(value.id); text(value.name,80);
  if(Object.hasOwn(value,'fit')) fit(value.fit,value.id);
  if(Object.hasOwn(value,'targetIds')) {
    if(!Array.isArray(value.targetIds) || value.targetIds.length>MAX_OBJECTS || new Set(value.targetIds).size!==value.targetIds.length) throw new Error('Invalid hole targets.');
    for(const target of value.targetIds) { id(target); if(target===value.id) throw new Error('A hole cannot cut itself.'); }
  }
  if(typeof value.type!=='string') throw new Error('Invalid type.');
  dimensions(value.dimensions,value.type); vector(value.position); vector(value.rotation,36000);
  if(typeof value.color!=='string' || value.color.length!==7 || !/^#[0-9a-fA-F]{6}$/.test(value.color)) throw new Error('Color must be #RRGGBB.');
  if(value.groupId!==null) id(value.groupId);
  if(value.type==='mesh') meshVertices(value);
}
function validateState(state) {
  fields(state,['version','name','units','objects','groups']);
  if(state.version!==1 || state.units!=='mm') throw new Error('Unsupported version or units.');
  text(state.name,100);
  for(const key of ['objects','groups']) if(!Array.isArray(state[key]) || state[key].length>MAX_OBJECTS) throw new Error('Invalid list: maximum 200 items.');
  const ids=new Set(),groups=new Set();
  for(const g of state.groups) {
    fields(g,['id','name']); id(g.id); text(g.name,80);
    if(ids.has(g.id)) throw new Error('Duplicate ID.'); ids.add(g.id); groups.add(g.id);
  }
  for(const o of state.objects) {
    object(o); if(ids.has(o.id)) throw new Error('Duplicate ID.'); ids.add(o.id);
    if(o.groupId!==null && !groups.has(o.groupId)) throw new Error('Group does not exist.');
  }
  for(const group of groups) if(!state.objects.some(o=>o.groupId===group)) throw new Error('Empty group.');
  for(const o of state.objects) for(const target of o.targetIds||[]) {
    if(!state.objects.some(full=>full.id===target && !full.hole)) throw new Error('A hole target must be an existing solid.');
  }
  for(const o of state.objects) for(const target of o.fit?.targetIds||[]) {
    if(!state.objects.some(full=>full.id===target && !full.hole)) throw new Error('A glass fit target must be an existing solid.');
  }
  const holes=state.objects.filter(o=>o.hole===true);
  if(holes.length>MAX_HOLES) throw new Error('Maximum 8 hole tools per project.');
  if(new TextEncoder().encode(JSON.stringify(state)).byteLength>MAX_PROJECT_BYTES) throw new Error('Project too large (maximum 8 MiB).');
  return state;
}
export function validateProject(state) {
  validateState(state);
  const holes=state.objects.filter(o=>o.hole===true);
  const pairs=holes.reduce((count,hole)=>count+(hole.targetIds ? hole.targetIds.length : state.objects.filter(o=>o.hole!==true && o.groupId===hole.groupId).length),0);
  if(pairs>MAX_BOOLEAN_PAIRS) throw new Error('Too many cuts: maximum 32 solid/hole pairs. Use groups to isolate parts.');
  return state;
}
export function newId(state,prefix) {
  const ids=new Set([...state.objects,...state.groups].map(o=>o.id)); let i=1;
  while(ids.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
function find(state,value) {
  id(value); const o=state.objects.find(o=>o.id===value);
  if(!o) throw new Error(`Object does not exist: ${value}.`); return o;
}
function unused(state,value) {
  id(value); if([...state.objects,...state.groups].some(o=>o.id===value)) throw new Error('ID already used.');
}
function targets(state,ids) {
  if(!Array.isArray(ids) || !ids.length || ids.length>MAX_OBJECTS) throw new Error('Invalid recipients.');
  const result=new Map(),seen=new Set();
  for(const value of ids) {
    id(value); if(seen.has(value)) throw new Error('Repeated recipient ID.'); seen.add(value);
    const members=state.groups.some(g=>g.id===value) ? state.objects.filter(o=>o.groupId===value) : [find(state,value)];
    for(const o of members) result.set(o.id,o);
  }
  return [...result.values()];
}
function prune(state) {
  state.groups=state.groups.filter(g=>state.objects.some(o=>o.groupId===g.id));
  const fullIds=new Set(state.objects.filter(o=>!o.hole).map(o=>o.id));
  for(const object of state.objects) if(object.targetIds) object.targetIds=object.targetIds.filter(id=>fullIds.has(id));
  for(const object of state.objects) if(object.fit) {
    object.fit.targetIds=object.fit.targetIds.filter(id=>fullIds.has(id));
    if(!object.fit.targetIds.length) delete object.fit;
  }
}
export function rotateAngles(rotation,delta) {
  vector(rotation,36000);vector(delta,36000);
  if(delta.every(angle=>angle===0)) return rotation.slice();
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad),'XYZ'));
  for(let axis=0;axis<3;axis++) if(delta[axis]!==0) {
    const change=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().setComponent(axis,1),THREE.MathUtils.degToRad(delta[axis]));
    quaternion.premultiply(change);
  }
  const angles=new THREE.Euler().setFromQuaternion(quaternion.normalize(),'XYZ');
  return [angles.x,angles.y,angles.z].map(value=>{
    const degrees=THREE.MathUtils.radToDeg(value);
    return Math.abs(degrees)<1e-9 ? 0 : Math.round(degrees*1e10)/1e10;
  });
}

// Apply to an independent copy: one invalid operation rejects the whole command.
export function applyOperations(state,batch) {
  validateProject(state); fields(batch,['operations']);
  if(!Array.isArray(batch.operations) || batch.operations.length>MAX_OPERATIONS) throw new Error('Maximum 100 operations per command.');
  const next=structuredClone(state);
  for(const [index,op] of batch.operations.entries()) {
    try {
    if(!op || typeof op.op!=='string') throw new Error('Invalid operation.');
    switch(op.op) {
      case 'create': {
        fields(op,['op','object']); object(op.object); unused(next,op.object.id);
        if(op.object.type==='mesh') throw new Error('Create meshes with Import STL, not through AI.');
        if(Object.hasOwn(op.object,'targetIds')) throw new Error('Link hole targets with subtract, not create.');
        const created=structuredClone(op.object);
        if(created.groupId!==null && !next.groups.some(group=>group.id===created.groupId)) {
          const declared=batch.operations.slice(index+1).some(later=>later?.op==='group' && later.id===created.groupId && Array.isArray(later.ids) && later.ids.includes(created.id));
          if(declared) created.groupId=null;
        }
        next.objects.push(created); break;
      }
      case 'update':
        fields(op,['op','id','changes']); fields(op.changes,[],['name','color','position','rotation','dimensions','hole','profile','modifiers','fit']);
        if(!Object.keys(op.changes).length) throw new Error('Empty changes.');
        {
          const changed=find(next,op.id),changes=structuredClone(op.changes);
          if(changes.fit===null) { delete changed.fit; delete changes.fit; }
          Object.assign(changed,changes);
        }
        break;
      case 'deform': {
        fields(op,['op','id','modifiers']);validateModifiers(op.modifiers);
        const object=find(next,op.id);object.modifiers=structuredClone(op.modifiers);
        const geometry=geometryFor(object);geometry.dispose();break;
      }
      case 'resize':
        fields(op,['op','id','dimensions']); find(next,op.id).dimensions=structuredClone(op.dimensions); break;
      case 'translate': case 'rotate': {
        fields(op,['op','ids','delta']); vector(op.delta,op.op==='rotate'?36000:100000);
        for(const o of targets(next,op.ids)) {
          if(op.op==='translate') o.position=o.position.map((n,i)=>n+op.delta[i]);
          else o.rotation=rotateAngles(o.rotation,op.delta);
        }
        break;
      }
      case 'duplicate': {
        fields(op,['op','id','newId','offset']); unused(next,op.newId); vector(op.offset);
        const o=structuredClone(find(next,op.id)); o.id=op.newId; o.name=Array.from(o.name).slice(0,73).join('')+' copy'; o.groupId=null;
        o.position=o.position.map((n,i)=>n+op.offset[i]); next.objects.push(o); break;
      }
      case 'delete': {
        fields(op,['op','ids']); const remove=new Set(targets(next,op.ids).map(o=>o.id));
        next.objects=next.objects.filter(o=>!remove.has(o.id)); prune(next); break;
      }
      case 'subtract': {
        fields(op,['op','ids','toolIds'],['bake']);
        if(Object.hasOwn(op,'bake') && typeof op.bake!=='boolean') throw new Error('bake deve essere un booleano.');
        const solids=targets(next,op.ids),tools=targets(next,op.toolIds);
        if(solids.some(o=>o.hole) || tools.some(o=>o.hole!==true || o.type==='mesh')) throw new Error('Subtract: use solids as targets and primitive hole shapes as tools.');
        if(tools.length>MAX_HOLES || solids.length*tools.length>MAX_BOOLEAN_PAIRS) throw new Error('Subtract: maximum 8 hole tools and 32 solid/hole pairs.');
        const replacements=new Map(solids.map(o=>[o.id,carveObject(o,tools)]));
        if(op.bake!==true) {
          for(const tool of tools) tool.targetIds=[...new Set([...(tool.targetIds||[]),...solids.map(o=>o.id)])];
          break;
        }
        if(tools.some(tool=>tool.targetIds?.some(id=>!replacements.has(id)))) throw new Error('To finalize a cut, include all targets of its hole tools.');
        const consumed=new Set(tools.map(o=>o.id));
        next.objects=next.objects.filter(o=>!consumed.has(o.id)).map(o=>replacements.has(o.id) ? replacements.get(o.id) : o).filter(Boolean);
        prune(next); break;
      }
      case 'group':
        fields(op,['op','id','name','ids']); unused(next,op.id); text(op.name,80);
        for(const o of targets(next,op.ids)) o.groupId=op.id;
        next.groups.push({id:op.id,name:op.name}); prune(next); break;
      case 'ungroup':
        fields(op,['op','id']); id(op.id);
        if(!next.groups.some(g=>g.id===op.id)) throw new Error('Group does not exist.');
        for(const o of next.objects) if(o.groupId===op.id) o.groupId=null;
        prune(next); break;
      default: throw new Error(`Unsupported operation: ${op.op}.`);
    }
    validateState(next);
    } catch(error) {
      const label=typeof op?.op==='string'?op.op.slice(0,64):'unknown';
      const target=op?.id??op?.object?.id;
      throw new Error(`Operation ${index+1} (${label}${typeof target==='string'?' · '+target.slice(0,64):''}): ${error.message}`,{cause:error});
    }
  }
  // Temporary tools may be linked, consumed or grouped before rendering.
  return validateProject(next);
}
