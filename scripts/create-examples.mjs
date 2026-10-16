import { writeFileSync } from 'node:fs';
const shape=(id,type,name,dimensions,position,color,rotation=[0,0,0],groupId=null)=>({id,type,name,dimensions,position,rotation,color,groupId});
const box=(id,name,d,p,c,r=[0,0,0],g=null)=>shape(id,'box',name,{x:d[0],y:d[1],z:d[2]},p,c,r,g);
const cylinder=(id,name,r,h,p,c,rot=[0,0,0],g=null)=>shape(id,'cylinder',name,{radius:r,height:h},p,c,rot,g);
const project=(name,objects,groups=[])=>({version:1,name,units:'mm',objects,groups});
const house=project('A small house',[
  box('walls','Walls',[160,130,120],[0,0,60],'#e9d9b4'),
  box('door','Door',[32,5,65],[0,-67.5,32.5],'#80583c'),
  box('window-left','Left window',[30,5,30],[-48,-67.5,78],'#79bfe2'),
  box('window-right','Right window',[30,5,30],[48,-67.5,78],'#79bfe2'),
  box('roof-left','Left roof slope',[110,155,8],[-45,0,151],'#c36354',[0,-35,0]),
  box('roof-right','Right roof slope',[110,155,8],[45,0,151],'#c36354',[0,35,0]),
  cylinder('chimney','Chimney',12,60,[42,30,179],'#e2c6a1'),
]);
const robot=project('A small robot',[
  box('body','Body',[90,50,95],[0,0,107.5],'#62c7a5'),
  box('head','Head',[80,60,55],[0,0,192.5],'#91bff1'),
  cylinder('neck','Neck',12,10,[0,0,160],'#c5d1e3'),
  shape('eye-left','sphere','Left eye',{radius:8},[-22,-31,196],'#202c3d'),
  shape('eye-right','sphere','Right eye',{radius:8},[22,-31,196],'#202c3d'),
  box('mouth','Smile',[24,3,4],[0,-31.5,178],'#202c3d'),
  cylinder('arm-left','Left arm',10,80,[-63,0,110],'#91bff1',[0,-15,0]),
  cylinder('arm-right','Right arm',10,80,[63,0,110],'#91bff1',[0,15,0]),
  cylinder('leg-left','Left leg',12,40,[-25,0,40],'#c5d1e3'),
  cylinder('leg-right','Right leg',12,40,[25,0,40],'#c5d1e3'),
  box('foot-left','Left foot',[35,65,20],[-25,-12,10],'#91bff1'),
  box('foot-right','Right foot',[35,65,20],[25,-12,10],'#91bff1'),
  cylinder('antenna','Antenna',3,25,[0,0,232.5],'#c5d1e3'),
  shape('antenna-tip','sphere','Antenna tip',{radius:7},[0,0,250],'#f4b860'),
]);
const carObjects=[
  box('chassis','Car body',[210,105,45],[0,0,50],'#edaa62'),
  box('cabin','Cabin',[100,90,45],[-10,0,95],'#edaa62'),
  {...box('window-front','Windshield',[4,74,30],[42,0,99],'#9bc9e8'),fit:{targetIds:['cabin'],maxGap:2}},
  {...box('window-side-a','Left side window',[72,4,28],[-10,-47,99],'#9bc9e8'),fit:{targetIds:['cabin'],maxGap:2}},
  {...box('window-side-b','Right side window',[72,4,28],[-10,47,99],'#9bc9e8'),fit:{targetIds:['cabin'],maxGap:2}},
  box('headlight-a','Left headlight',[4,22,14],[107,-30,54],'#f3edce'),
  box('headlight-b','Right headlight',[4,22,14],[107,30,54],'#f3edce'),
];
for(const [i,p] of [[-70,-63,25],[-70,63,25],[70,-63,25],[70,63,25]].entries()) carObjects.push(cylinder('wheel-'+(i+1),(i<2?'Rear wheel ':'Front wheel ')+(i%2+1),25,20,p,'#252d3e',[90,0,0],'wheels'));
const car=project('A car',carObjects,[{id:'wheels',name:'Four wheels'}]);
const advanced=project('Complex shapes',[
  {...shape('vase','lathe','Shaped vase',{radius:38,height:110},[-150,0,55],'#e9ad73'),profile:[[25,0],[32,15],[38,40],[31,75],[22,95],[25,110]]},
  {...cylinder('vase-hole','Vase cavity',16,100,[-150,0,72],'#91bff1'),hole:true,targetIds:['vase']},
  {...shape('tower','extrude','Twisted tower',{x:40,y:40,z:120},[-50,0,60],'#62c7a5'),profile:[[0,10],[10,0],[30,0],[40,10],[40,30],[30,40],[10,40],[0,30]],modifiers:[{type:'twist',axis:'z',angle:120},{type:'taper',axis:'z',factor:.7}]},
  {...box('arch','Curved handle',[10,15,120],[50,0,60],'#91bff1'),modifiers:[{type:'bend',axis:'z',angle:180}]},
  shape('ring','torus','Ring',{radius:32,tube:10},[160,0,10],'#c88de5'),
  {...shape('wing','extrude','Shaped wing',{x:75,y:25,z:8},[20,-90,20],'#f0cd6b'),profile:[[0,0],[75,0],[55,20],[10,25]],modifiers:[{type:'twist',axis:'x',angle:20}]},
]);
for(const [file,state] of Object.entries({house,robot,car,advanced})) writeFileSync(new URL(`../public/examples/${file}.json`,import.meta.url),JSON.stringify(state,null,2)+'\n');
