import * as THREE from 'three';

const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(a,b,p) {
  return Math.abs(cross(a,b,p))<1e-8 && p.every((n,i)=>n>=Math.min(a[i],b[i])-1e-8 && n<=Math.max(a[i],b[i])+1e-8);
}
function intersects(a,b,c,d) {
  return onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b)||
    (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0);
}
function pointsFor(profile,type) {
  return type==='extrude' && profile.length>1 && profile[0].every((n,i)=>n===profile.at(-1)[i]) ? profile.slice(0,-1) : profile;
}
export function validateProfile(profile,type) {
  if(!Array.isArray(profile) || profile.length>64 || profile.length<(type==='extrude'?3:2)) throw new Error('Profile: use 3–64 points for extrusion, 2–64 for revolution.');
  for(const p of profile) if(!Array.isArray(p) || p.length!==2 || p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>10000)) throw new Error('Profile: each point contains two finite numbers in mm, within ±10000.');
  const points=pointsFor(profile,type),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  if(points.length<(type==='extrude'?3:2) || Math.max(...ys)-Math.min(...ys)<1e-6 || Math.max(...ys)-Math.min(...ys)>10000) throw new Error('Profile: height is zero or out of bounds.');
  for(let i=1;i<points.length;i++) if(points[i].every((n,j)=>n===points[i-1][j])) throw new Error('Profile: duplicate consecutive points.');
  if(type==='lathe') {
    if(Math.max(...xs)<=0 || xs.some(r=>r<0) || points.some((p,i)=>i>0&&p[1]<points[i-1][1]) || points.some((p,i)=>i>0&&i<points.length-1&&p[0]===0)) throw new Error('Revolution: radii must be nonnegative, interior radii positive, and Z coordinates increasing.');
    return;
  }
  if(Math.max(...xs)-Math.min(...xs)<1e-6 || Math.max(...xs)-Math.min(...xs)>10000) throw new Error('Profile: width is zero or out of bounds.');
  const area=points.reduce((sum,p,i)=>sum+p[0]*points[(i+1)%points.length][1]-p[1]*points[(i+1)%points.length][0],0);
  if(Math.abs(area)<1e-8) throw new Error('Profile: zero area.');
  for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
    if(j===i+1 || (i===0&&j===points.length-1)) continue;
    if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length])) throw new Error('Self-intersecting profile: reorder points along the contour.');
  }
}
export function profileGeometry(object) {
  validateProfile(object.profile,object.type);
  const points=pointsFor(object.profile,object.type),d=object.dimensions;
  if(object.type==='extrude') {
    const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p))); shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:d.z,steps:1,bevelEnabled:false});
    g.computeBoundingBox(); const size=g.boundingBox.getSize(new THREE.Vector3());
    g.center(); g.scale(d.x/size.x,d.y/size.y,1); return g;
  }
  const min=points[0][1],max=points.at(-1)[1],radius=Math.max(...points.map(p=>p[0]));
  const closed=points.map(p=>new THREE.Vector2(...p));
  if(points[0][0]!==0) closed.unshift(new THREE.Vector2(0,min));
  if(points.at(-1)[0]!==0) closed.push(new THREE.Vector2(0,max));
  const g=new THREE.LatheGeometry(closed,64); g.rotateX(Math.PI/2);
  g.translate(0,0,-(min+max)/2); g.scale(d.radius/radius,d.radius/radius,d.height/(max-min)); return g;
}
