import { Vector3 } from 'three';
import { STLLoader } from '../vendor/STLLoader.js';

import { MAX_STL_BYTES, MAX_STL_TRIANGLES } from './limits.js';
export { MAX_STL_BYTES, MAX_STL_TRIANGLES };

function checkFormat(buffer) {
  if(!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength>MAX_STL_BYTES) throw new Error('STL is empty or too large (maximum 10 MiB).');
  if(buffer.byteLength>=84) {
    const count=new DataView(buffer).getUint32(80,true);
    if(84+count*50===buffer.byteLength) {
      if(!count || count>MAX_STL_TRIANGLES) throw new Error('STL: 1–20000 triangles allowed.');
      return;
    }
  }
  let text;
  try { text=new TextDecoder('utf-8',{fatal:true}).decode(buffer); } catch { throw new Error('Incomplete or invalid binary STL.'); }
  if(!/^\s*solid[^\r\n]*[\r\n]/i.test(text) || !/\bendsolid[^\r\n]*\s*$/i.test(text)) throw new Error('Invalid ASCII or binary STL.');
  const number='[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
  const triple=`${number}\\s+${number}\\s+${number}`;
  const facet=new RegExp(`facet\\s+normal\\s+${triple}\\s+outer\\s+loop\\s+(?:vertex\\s+${triple}\\s+){3}endloop\\s+endfacet`,'gi');
  const body=text.replace(/^[\t ]*(?:solid|endsolid)[^\r\n]*/gim,'');
  const matches=body.match(facet);
  if(!matches?.length || matches.length>MAX_STL_TRIANGLES || body.replace(facet,'').trim()) throw new Error('ASCII STL is incomplete or exceeds the 20000-triangle limit.');
}

export function importSTL(buffer,filename,id) {
  checkFormat(buffer);
  let geometry;
  try {
    geometry=new STLLoader().parse(buffer);
    const positions=geometry.getAttribute('position');
    if(!positions || !positions.count || positions.count%3 || positions.count/3>MAX_STL_TRIANGLES) throw new Error('STL contains no valid triangles.');
    for(const n of positions.array) if(!Number.isFinite(n) || Math.abs(n)>100000) throw new Error('STL has invalid coordinates or exceeds ±100000 mm.');
    geometry.computeBoundingBox();
    const center=geometry.boundingBox.getCenter(new Vector3());
    const size=geometry.boundingBox.getSize(new Vector3());
    if(Math.max(size.x,size.y,size.z)>10000 || [size.x,size.y,size.z].filter(n=>n>0).length<2) throw new Error('STL: maximum dimensions 10000 mm; the mesh must have a surface.');
    geometry.translate(-center.x,-center.y,-center.z);
    const name=filename.replace(/\.stl$/i,'').replace(/[\x00-\x1f\x7f]/g,'').trim();
    return {id,type:'mesh',name:Array.from(name||'Imported STL').slice(0,80).join(''),
      dimensions:{x:size.x,y:size.y,z:size.z},position:center.toArray(),rotation:[0,0,0],
      color:'#91bff1',groupId:null,vertices:Array.from(geometry.getAttribute('position').array)};
  } catch(error) {
    if(error instanceof RangeError) throw new Error('Incomplete or invalid binary STL.');
    throw error;
  } finally { geometry?.dispose(); }
}
