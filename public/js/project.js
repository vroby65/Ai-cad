import { MAX_PROJECT_BYTES, MAX_OBJECTS, MAX_OPERATIONS, MAX_STL_TRIANGLES, MAX_HOLES, MAX_BOOLEAN_PAIRS } from './limits.js';
import { carveObject } from './boolean.js';
import { geometryFor } from './geometry.js';
import { validateProfile } from './profiles.js';
import { validateModifiers } from './deform.js';
import * as THREE from 'three';

export function fields(value,required,optional=[]) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) throw new Error('Atteso un oggetto JSON.');
  const keys=Object.keys(value); const allowed=new Set([...required,...optional]);
  const missing=required.filter(k=>!Object.hasOwn(value,k)),extra=keys.filter(k=>!allowed.has(k));
  if(missing.length || extra.length) throw new Error('Campi mancanti o non autorizzati.'+(missing.length ? ' Mancanti: '+missing.join(', ')+'.' : '')+(extra.length ? ' Non consentiti: '+extra.slice(0,10).map(k=>k.slice(0,64)).join(', ')+'.' : ''));
}
function text(value,max) {
  if(typeof value!=='string' || !value.trim() || Array.from(value).length>max || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Testo non valido o troppo lungo.');
}
function id(value) {
  if(typeof value!=='string' || /[\r\n]/.test(value) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error('ID non valido.');
}
function number(value,min,max) {
  if(typeof value!=='number' || !Number.isFinite(value) || value<min || value>max) throw new Error(`Numero fuori limite [${min}, ${max}].`);
}
function vector(value,limit=100000) {
  if(!Array.isArray(value) || value.length!==3) throw new Error('Atteso vettore [x,y,z].');
  for(const n of value) number(n,-limit,limit);
}
function dimensions(value,type) {
  const keys={box:['x','y','z'],sphere:['radius'],cylinder:['radius','height'],cone:['radius','height'],torus:['radius','tube'],extrude:['x','y','z'],lathe:['radius','height'],mesh:['x','y','z']}[type];
  if(!Array.isArray(keys)) throw new Error('Primitiva non autorizzata.');
  fields(value,keys); for(const key of keys) number(value[key],type==='mesh'?0:.1,10000);
  if(type==='torus' && (value.tube>=value.radius || value.radius+value.tube>5000)) throw new Error('Toro: il raggio del tubo deve essere minore del raggio principale; diametro massimo 10000 mm.');
  if(type==='lathe' && value.radius>5000) throw new Error('Rivoluzione: raggio massimo 5000 mm.');
}
function meshVertices(o) {
  if(!Array.isArray(o.vertices) || !o.vertices.length || o.vertices.length%9 || o.vertices.length>MAX_STL_TRIANGLES*9) throw new Error('Mesh: consentiti da 1 a 20000 triangoli.');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<o.vertices.length;i++) { const n=o.vertices[i]; number(n,-10000,10000); const axis=i%3; min[axis]=Math.min(min[axis],n); max[axis]=Math.max(max[axis],n); }
  for(const [i,key] of ['x','y','z'].entries()) {
    const extent=max[i]-min[i];
    if(extent>10000 || Math.abs(min[i]+max[i])>.01) throw new Error('Vertici mesh fuori limite o non centrati.');
    if(extent===0 ? o.dimensions[key]!==0 : o.dimensions[key]===0) throw new Error('Misure mesh incompatibili con i vertici. Un asse piano deve rimanere piano.');
  }
  if(min.filter((n,i)=>max[i]>n).length<2) throw new Error('La mesh deve avere una superficie.');
}
function object(value) {
  const profiled=['extrude','lathe'].includes(value?.type);
  fields(value,['id','type','name','dimensions','position','rotation','color','groupId',...(profiled?['profile']:[])],['modifiers',...(value?.type==='mesh'?['vertices']:['hole','targetIds'])]);
  if(profiled) validateProfile(value.profile,value.type);
  if(Object.hasOwn(value,'modifiers')) validateModifiers(value.modifiers);
  if(Object.hasOwn(value,'hole') && typeof value.hole!=='boolean') throw new Error('hole deve essere un booleano.');
  id(value.id); text(value.name,80);
  if(Object.hasOwn(value,'targetIds')) {
    if(!Array.isArray(value.targetIds) || value.targetIds.length>MAX_OBJECTS || new Set(value.targetIds).size!==value.targetIds.length) throw new Error('Bersagli del foro non validi.');
    for(const target of value.targetIds) { id(target); if(target===value.id) throw new Error('Un foro non può scavare sé stesso.'); }
  }
  if(typeof value.type!=='string') throw new Error('Tipo non valido.');
  dimensions(value.dimensions,value.type); vector(value.position); vector(value.rotation,36000);
  if(typeof value.color!=='string' || value.color.length!==7 || !/^#[0-9a-fA-F]{6}$/.test(value.color)) throw new Error('Colore deve essere #RRGGBB.');
  if(value.groupId!==null) id(value.groupId);
  if(value.type==='mesh') meshVertices(value);
}
function validateState(state) {
  fields(state,['version','name','units','objects','groups']);
  if(state.version!==1 || state.units!=='mm') throw new Error('Versione o unità non supportata.');
  text(state.name,100);
  for(const key of ['objects','groups']) if(!Array.isArray(state[key]) || state[key].length>MAX_OBJECTS) throw new Error('Lista non valida: massimo 200 elementi.');
  const ids=new Set(),groups=new Set();
  for(const g of state.groups) {
    fields(g,['id','name']); id(g.id); text(g.name,80);
    if(ids.has(g.id)) throw new Error('ID duplicato.'); ids.add(g.id); groups.add(g.id);
  }
  for(const o of state.objects) {
    object(o); if(ids.has(o.id)) throw new Error('ID duplicato.'); ids.add(o.id);
    if(o.groupId!==null && !groups.has(o.groupId)) throw new Error('Gruppo inesistente.');
  }
  for(const group of groups) if(!state.objects.some(o=>o.groupId===group)) throw new Error('Gruppo vuoto.');
  for(const o of state.objects) for(const target of o.targetIds||[]) {
    if(!state.objects.some(full=>full.id===target && !full.hole)) throw new Error('Il bersaglio del foro deve essere un solido pieno esistente.');
  }
  const holes=state.objects.filter(o=>o.hole===true);
  if(holes.length>MAX_HOLES) throw new Error('Massimo 8 forme foro per progetto.');
  if(new TextEncoder().encode(JSON.stringify(state)).byteLength>MAX_PROJECT_BYTES) throw new Error('Progetto troppo grande (massimo 8 MiB).');
  return state;
}
export function validateProject(state) {
  validateState(state);
  const holes=state.objects.filter(o=>o.hole===true);
  const pairs=holes.reduce((count,hole)=>count+(hole.targetIds ? hole.targetIds.length : state.objects.filter(o=>o.hole!==true && o.groupId===hole.groupId).length),0);
  if(pairs>MAX_BOOLEAN_PAIRS) throw new Error('Troppe sottrazioni: massimo 32 coppie pieno/foro. Usa gruppi per isolare i pezzi.');
  return state;
}
export function newId(state,prefix) {
  const ids=new Set([...state.objects,...state.groups].map(o=>o.id)); let i=1;
  while(ids.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}
function find(state,value) {
  id(value); const o=state.objects.find(o=>o.id===value);
  if(!o) throw new Error(`Oggetto inesistente: ${value}.`); return o;
}
function unused(state,value) {
  id(value); if([...state.objects,...state.groups].some(o=>o.id===value)) throw new Error('ID già utilizzato.');
}
function targets(state,ids) {
  if(!Array.isArray(ids) || !ids.length || ids.length>MAX_OBJECTS) throw new Error('Destinatari non validi.');
  const result=new Map(),seen=new Set();
  for(const value of ids) {
    id(value); if(seen.has(value)) throw new Error('ID destinatario ripetuto.'); seen.add(value);
    const members=state.groups.some(g=>g.id===value) ? state.objects.filter(o=>o.groupId===value) : [find(state,value)];
    for(const o of members) result.set(o.id,o);
  }
  return [...result.values()];
}
function prune(state) {
  state.groups=state.groups.filter(g=>state.objects.some(o=>o.groupId===g.id));
  const fullIds=new Set(state.objects.filter(o=>!o.hole).map(o=>o.id));
  for(const object of state.objects) if(object.targetIds) object.targetIds=object.targetIds.filter(id=>fullIds.has(id));
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
  if(!Array.isArray(batch.operations) || batch.operations.length>MAX_OPERATIONS) throw new Error('Massimo 100 operazioni per comando.');
  const next=structuredClone(state);
  for(const [index,op] of batch.operations.entries()) {
    try {
    if(!op || typeof op.op!=='string') throw new Error('Operazione non valida.');
    switch(op.op) {
      case 'create': {
        fields(op,['op','object']); object(op.object); unused(next,op.object.id);
        if(op.object.type==='mesh') throw new Error('Le mesh si creano con Importa STL, non tramite AI.');
        if(Object.hasOwn(op.object,'targetIds')) throw new Error('I bersagli dei fori si collegano con subtract, non con create.');
        const created=structuredClone(op.object);
        if(created.groupId!==null && !next.groups.some(group=>group.id===created.groupId)) {
          const declared=batch.operations.slice(index+1).some(later=>later?.op==='group' && later.id===created.groupId && Array.isArray(later.ids) && later.ids.includes(created.id));
          if(declared) created.groupId=null;
        }
        next.objects.push(created); break;
      }
      case 'update':
        fields(op,['op','id','changes']); fields(op.changes,[],['name','color','position','rotation','dimensions','hole','profile','modifiers']);
        if(!Object.keys(op.changes).length) throw new Error('Modifiche vuote.');
        Object.assign(find(next,op.id),structuredClone(op.changes)); break;
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
        const o=structuredClone(find(next,op.id)); o.id=op.newId; o.name=Array.from(o.name).slice(0,73).join('')+' copia'; o.groupId=null;
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
        if(solids.some(o=>o.hole) || tools.some(o=>o.hole!==true || o.type==='mesh')) throw new Error('Sottrazione: indica solidi pieni come bersagli e forme foro primitive come utensili.');
        if(tools.length>MAX_HOLES || solids.length*tools.length>MAX_BOOLEAN_PAIRS) throw new Error('Sottrazione: massimo 8 forme foro e 32 coppie pieno/foro.');
        const replacements=new Map(solids.map(o=>[o.id,carveObject(o,tools)]));
        if(op.bake!==true) {
          for(const tool of tools) tool.targetIds=[...new Set([...(tool.targetIds||[]),...solids.map(o=>o.id)])];
          break;
        }
        if(tools.some(tool=>tool.targetIds?.some(id=>!replacements.has(id)))) throw new Error('Per finalizzare lo scavo includi tutti i bersagli delle forme foro.');
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
        if(!next.groups.some(g=>g.id===op.id)) throw new Error('Gruppo inesistente.');
        for(const o of next.objects) if(o.groupId===op.id) o.groupId=null;
        prune(next); break;
      default: throw new Error(`Operazione non autorizzata: ${op.op}.`);
    }
    validateState(next);
    } catch(error) {
      const label=typeof op?.op==='string'?op.op.slice(0,64):'sconosciuta';
      const target=op?.id??op?.object?.id;
      throw new Error(`Operazione ${index+1} (${label}${typeof target==='string'?' · '+target.slice(0,64):''}): ${error.message}`,{cause:error});
    }
  }
  // Temporary tools may be linked, consumed or grouped before rendering.
  return validateProject(next);
}
