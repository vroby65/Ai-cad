import * as THREE from 'three';
import { MAX_BOOLEAN_TRIANGLES } from './limits.js';

export function validateModifiers(modifiers) {
  if(!Array.isArray(modifiers) || modifiers.length>6) throw new Error('Deformazioni: massimo 6 modificatori.');
  for(const m of modifiers) {
    const parameter=m?.type==='taper' ? 'factor' : 'angle';
    if(!m || Object.getPrototypeOf(m)!==Object.prototype || Object.keys(m).length!==3 || !['twist','bend','taper'].includes(m.type) || !['x','y','z'].includes(m.axis) || !Object.hasOwn(m,parameter)) throw new Error('Deformazione non autorizzata: usa type, axis e angle/factor.');
    const value=m[parameter],limit=m.type==='bend'?180:720;
    if(typeof value!=='number'||!Number.isFinite(value)||(m.type==='taper' ? value<.05||value>4 : Math.abs(value)>limit)) throw new Error('Deformazione fuori limite: torsione ±720°, piegatura ±180°, rastremazione 0.05–4.');
  }
}
function clip(polygon,axis,bound,above) {
  const result=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i];
    const insideA=above ? a.p[axis]>=bound : a.p[axis]<=bound,insideB=above ? b.p[axis]>=bound : b.p[axis]<=bound;
    if(insideA!==insideB) {
      const t=(bound-a.p[axis])/(b.p[axis]-a.p[axis]);
      const normal=new THREE.Vector3(...a.n).lerp(new THREE.Vector3(...b.n),t).normalize();
      const point=a.p.map((value,j)=>value+(b.p[j]-value)*t);point[axis]=bound;
      result.push({p:point,n:normal.toArray()});
    }
    if(insideB) result.push(b);
  }
  return result;
}
function subdivide(geometry,axis,origin,step,steps=24) {
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),positions=[],normals=[];
  const count=geometry.index ? geometry.index.count : p.count;
  function emit(triangle) {
    const [a,b,c]=triangle.map(v=>new THREE.Vector3(...v.p));
    if(new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).lengthSq()<1e-20) return;
    if(positions.length/9>=MAX_BOOLEAN_TRIANGLES) throw new Error('Deformazione troppo complessa: massimo 20000 triangoli. Riduci la complessità della mesh.');
    for(const vertex of triangle){positions.push(...vertex.p);normals.push(...vertex.n);}
  }
  for(let i=0;i<count;i+=3) {
    const triangle=[0,1,2].map(j=>{
      const k=geometry.index ? geometry.index.getX(i+j) : i+j;
      return {p:[p.getX(k),p.getY(k),p.getZ(k)],n:[n.getX(k),n.getY(k),n.getZ(k)]};
    });
    const low=Math.min(...triangle.map(v=>v.p[axis])),high=Math.max(...triangle.map(v=>v.p[axis]));
    if(high-low<1e-8) {emit(triangle);continue;}
    const first=Math.max(0,Math.floor((low-origin)/step)),last=Math.min(steps-1,Math.ceil((high-origin)/step)-1);
    for(let layer=first;layer<=last;layer++) {
      const polygon=clip(clip(triangle,axis,origin+layer*step,true),axis,origin+(layer+1)*step,false);
      for(let j=2;j<polygon.length;j++) emit([polygon[0],polygon[j-1],polygon[j]]);
    }
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3)); geometry.dispose(); return result;
}
export function applyModifiers(geometry,modifiers=[]) {
  let current=geometry;
  try {
    validateModifiers(modifiers);
    for(const m of modifiers) {
      if(m.type==='taper' ? m.factor===1 : m.angle===0) continue;
      const axis=['x','y','z'].indexOf(m.axis),u=(axis+1)%3,v=(axis+2)%3;
      current.computeBoundingBox(); const min=current.boundingBox.min.toArray(),max=current.boundingBox.max.toArray();
      const length=max[axis]-min[axis],center=min.map((n,i)=>(n+max[i])/2);
      if(length<1e-6) throw new Error('L’asse della deformazione ha estensione nulla.');
      const angle=THREE.MathUtils.degToRad(m.angle||0),radius=length/angle;
      if(m.type==='bend' && (max[u]-min[u])/2>=Math.abs(radius)*.95) throw new Error('Piegatura troppo stretta: il solido si ripiega. Riduci l’angolo o lo spessore.');
      if(m.type==='twist') for(const transverse of [u,v]) {
        const width=max[transverse]-min[transverse];
        if(width>1e-6) current=subdivide(current,transverse,min[transverse],width/4,4);
      }
      const steps=m.type==='taper' ? 8 : Math.max(4,Math.ceil(Math.abs(m.angle)/(m.type==='twist'?3.75:7.5)));
      current=subdivide(current,axis,min[axis],length/steps,steps);
      const p=current.getAttribute('position'),n=current.getAttribute('normal');
      for(let i=0;i<p.count;i++) {
        const point=[p.getX(i),p.getY(i),p.getZ(i)],normal=[n.getX(i),n.getY(i),n.getZ(i)];
        const a=point[u]-center[u],b=point[v]-center[v],s=point[axis]-center[axis];
        if(m.type==='taper') {
          const scale=1+(m.factor-1)*(point[axis]-min[axis])/length;
          point[u]=center[u]+a*scale; point[v]=center[v]+b*scale;
          normal[u]/=scale; normal[v]/=scale; normal[axis]-=(m.factor-1)/length*(a*normal[u]+b*normal[v]);
        } else {
          const theta=(m.type==='twist'?point[axis]-min[axis]:s)*angle/length,c=Math.cos(theta),sin=Math.sin(theta);
          if(m.type==='twist') {
            const x=a*c-b*sin,y=a*sin+b*c,nx=normal[u]*c-normal[v]*sin,ny=normal[u]*sin+normal[v]*c;
            point[u]=center[u]+x;point[v]=center[v]+y;normal[u]=nx;normal[v]=ny;normal[axis]+=angle/length*(y*nx-x*ny);
          } else {
            const ratio=1-a/radius,nx=normal[u],nz=normal[axis];
            point[u]=center[u]+radius-(radius-a)*c;point[axis]=center[axis]+(radius-a)*sin;
            normal[u]=c*nx+sin*nz/ratio;normal[axis]=-sin*nx+c*nz/ratio;
          }
        }
        const unit=new THREE.Vector3(...normal).normalize();
        if(point.some(value=>!Number.isFinite(value)||Math.abs(value)>10000) || !unit.toArray().every(Number.isFinite)) throw new Error('Deformazione fuori dai limiti geometrici di 10000 mm.');
        p.setXYZ(i,...point);n.setXYZ(i,...unit.toArray());
      }
      p.needsUpdate=true;n.needsUpdate=true;
      current.computeBoundingBox();
      if(current.boundingBox.getSize(new THREE.Vector3()).toArray().some(size=>size>10000)) throw new Error('Deformazione troppo grande: massimo 10000 mm per asse.');
    }
    current.computeBoundingBox();current.computeBoundingSphere();return current;
  } catch(error) { current.dispose();throw error; }
}
