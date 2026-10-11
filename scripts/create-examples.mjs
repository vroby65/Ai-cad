import { writeFileSync } from 'node:fs';
const shape=(id,type,name,dimensions,position,color,rotation=[0,0,0],groupId=null)=>({id,type,name,dimensions,position,rotation,color,groupId});
const box=(id,name,d,p,c,r=[0,0,0],g=null)=>shape(id,'box',name,{x:d[0],y:d[1],z:d[2]},p,c,r,g);
const cylinder=(id,name,r,h,p,c,rot=[0,0,0],g=null)=>shape(id,'cylinder',name,{radius:r,height:h},p,c,rot,g);
const project=(name,objects,groups=[])=>({version:1,name,units:'mm',objects,groups});
const house=project('Una casetta',[
  box('walls','Pareti',[160,130,120],[0,0,60],'#e9d9b4'),
  box('door','Porta',[32,5,65],[0,-67.5,32.5],'#80583c'),
  box('window-left','Finestra sinistra',[30,5,30],[-48,-67.5,78],'#79bfe2'),
  box('window-right','Finestra destra',[30,5,30],[48,-67.5,78],'#79bfe2'),
  box('roof-left','Falda sinistra del tetto',[110,155,8],[-45,0,151],'#c36354',[0,-35,0]),
  box('roof-right','Falda destra del tetto',[110,155,8],[45,0,151],'#c36354',[0,35,0]),
  cylinder('chimney','Comignolo',12,60,[42,30,179],'#e2c6a1'),
]);
const robot=project('Un piccolo robot',[
  box('body','Corpo',[90,50,95],[0,0,107.5],'#62c7a5'),
  box('head','Testa',[80,60,55],[0,0,192.5],'#91bff1'),
  cylinder('neck','Collo',12,10,[0,0,160],'#c5d1e3'),
  shape('eye-left','sphere','Occhio sinistro',{radius:8},[-22,-31,196],'#202c3d'),
  shape('eye-right','sphere','Occhio destro',{radius:8},[22,-31,196],'#202c3d'),
  box('mouth','Sorriso',[24,3,4],[0,-31.5,178],'#202c3d'),
  cylinder('arm-left','Braccio sinistro',10,80,[-63,0,110],'#91bff1',[0,-15,0]),
  cylinder('arm-right','Braccio destro',10,80,[63,0,110],'#91bff1',[0,15,0]),
  cylinder('leg-left','Gamba sinistra',12,40,[-25,0,40],'#c5d1e3'),
  cylinder('leg-right','Gamba destra',12,40,[25,0,40],'#c5d1e3'),
  box('foot-left','Piede sinistro',[35,65,20],[-25,-12,10],'#91bff1'),
  box('foot-right','Piede destro',[35,65,20],[25,-12,10],'#91bff1'),
  cylinder('antenna','Antenna',3,25,[0,0,232.5],'#c5d1e3'),
  shape('antenna-tip','sphere','Punta antenna',{radius:7},[0,0,250],'#f4b860'),
]);
const carObjects=[
  box('chassis','Carrozzeria',[210,105,45],[0,0,50],'#edaa62'),
  box('cabin','Abitacolo',[100,90,45],[-10,0,95],'#edaa62'),
  box('window-front','Parabrezza',[4,74,30],[42,0,99],'#9bc9e8'),
  box('window-side-a','Finestrino sinistro',[72,4,28],[-10,-47,99],'#9bc9e8'),
  box('window-side-b','Finestrino destro',[72,4,28],[-10,47,99],'#9bc9e8'),
  box('headlight-a','Faro sinistro',[4,22,14],[107,-30,54],'#f3edce'),
  box('headlight-b','Faro destro',[4,22,14],[107,30,54],'#f3edce'),
];
for(const [i,p] of [[-70,-63,25],[-70,63,25],[70,-63,25],[70,63,25]].entries()) carObjects.push(cylinder('wheel-'+(i+1),(i<2?'Ruota posteriore ':'Ruota anteriore ')+(i%2+1),25,20,p,'#252d3e',[90,0,0],'wheels'));
const car=project('Un’automobile',carObjects,[{id:'wheels',name:'Quattro ruote'}]);
for(const [file,state] of Object.entries({house,robot,car})) writeFileSync(new URL(`../public/examples/${file}.json`,import.meta.url),JSON.stringify(state,null,2)+'\n');
