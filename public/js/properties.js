import { rotateAngles } from './project.js';

export class PropertyEditor {
  constructor(form,fields,error,onApply,document=globalThis.document) {
    this.fields=fields; this.error=error; this.onApply=onApply; this.document=document;
    this.object=null; this.inputs={};
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(!this.object || this.fields.disabled) return;
      try {
        const changes=this.changes();
        if(!Object.keys(changes).length) { this.error.textContent='Nessun valore modificato.'; return; }
        this.onApply({op:'update',id:this.object.id,changes});
        this.error.textContent='';
      } catch(error) { this.error.textContent=error.message; }
    });
  }
  node(tag,text) {
    const node=this.document.createElement(tag); if(text!==undefined) node.textContent=text; return node;
  }
  input(key,label,type,value,min,max,disabled=false) {
    const wrapper=this.node('label'),input=this.node(type==='select'?'select':'input');
    if(type==='select') for(const axis of ['x','y','z']) {const option=this.node('option',axis.toUpperCase());option.value=axis;input.append(option);}
    if(type!=='select') input.type=type;
    input.name=key; input.id='property-'+key.replaceAll('.','-'); input.value=String(value);
    input.required=true; input.disabled=disabled;
    if(type==='number') { input.min=String(min); input.max=String(max); input.step='any'; }
    if(type==='text') input.maxLength=80;
    wrapper.append(this.node('span',label),input); this.inputs[key]=input; return wrapper;
  }
  render(object,busy=false) {
    this.object=object ? structuredClone(object) : null; this.inputs={};
    this.fields.replaceChildren(); this.error.textContent=''; this.setBusy(busy);
    if(!object) return;
    this.fields.append(this.input('name','Nome','text',object.name),this.input('color','Colore','color',object.color));
    for(const [key,title,values,limit] of [['position','Centro · mm',object.position,100000],['rotation','Ruota di · ° (assi della griglia)',[0,0,0],36000]]) {
      const group=this.node('fieldset'),row=this.node('div'); row.className='property-vector';
      group.append(this.node('legend',title));
      for(const [i,axis] of ['x','y','z'].entries()) row.append(this.input(key+'.'+axis,axis.toUpperCase(),'number',values[i],-limit,limit));
      group.append(row);
      if(key==='rotation') group.append(this.node('small','Incrementi X → Y → Z. Applica ruota il pezzo; i campi tornano a zero.'));
      this.fields.append(group);
    }
    const group=this.node('fieldset'); group.append(this.node('legend','Dimensioni · mm'));
    const labels={x:'X · larghezza',y:'Y · profondità',z:'Z · altezza',radius:'Raggio',height:'Altezza',tube:'Raggio tubo'};
    for(const [key,value] of Object.entries(object.dimensions)) {
      const planar=object.type==='mesh' && value===0;
      group.append(this.input('dimensions.'+key,labels[key],'number',value,object.type==='mesh'?0:.1,planar?0:10000,planar));
    }
    this.fields.append(group);
    if(object.profile) {
      const details=this.node('details'),points=this.node('div');details.append(this.node('summary','Profilo di riferimento · mm'),this.node('p','Le dimensioni scalano il profilo.'));
      for(const [i,point] of object.profile.entries()) {
        const row=this.node('div');row.className='property-vector';
        for(let j=0;j<2;j++) row.append(this.input(`profile.${i}.${j}`,`${i+1} · ${object.type==='lathe' ? ['R','Z'][j] : ['X','Y'][j]}`,'number',point[j],object.type==='lathe'&&j===0?0:-10000,10000));
        points.append(row);
      }
      details.append(points);this.fields.append(details);
    }
    for(const [i,m] of (object.modifiers||[]).entries()) {
      const group=this.node('fieldset'),parameter=m.type==='taper'?'factor':'angle';
      group.append(this.node('legend',`${i+1} · ${{twist:'Torsione',bend:'Piegatura',taper:'Rastremazione'}[m.type]}`),this.input(`modifiers.${i}.axis`,'Asse','select',m.axis),this.input(`modifiers.${i}.${parameter}`,parameter==='angle'?'Angolo · °':'Fattore finale','number',m[parameter],parameter==='factor'?.05:m.type==='bend'?-180:-720,parameter==='factor'?4:m.type==='bend'?180:720));
      this.fields.append(group);
    }
    const button=this.node('button','Applica'); button.type='submit'; button.className='property-apply';
    this.fields.append(button);
  }
  setBusy(busy) { this.fields.disabled=busy; }
  changes() {
    const values={name:this.inputs.name.value,color:this.inputs.color.value,position:[],rotation:[],dimensions:{}};
    if(this.object.profile) values.profile=structuredClone(this.object.profile);
    if(this.object.modifiers) values.modifiers=structuredClone(this.object.modifiers);
    for(const [key,input] of Object.entries(this.inputs)) {
      const [field,axis,parameter]=key.split('.');
      if(field==='modifiers' && parameter==='axis') {values.modifiers[axis].axis=input.value;continue;}
      if(input.type!=='number') continue;
      if(!input.value.trim() || !Number.isFinite(Number(input.value))) throw new Error('Inserisci un numero valido in tutti i campi.');
      if(field==='dimensions') values.dimensions[axis]=Number(input.value);
      else if(field==='profile') values.profile[axis][parameter]=Number(input.value);
      else if(field==='modifiers') values.modifiers[axis][parameter]=Number(input.value);
      else values[field][['x','y','z'].indexOf(axis)]=Number(input.value);
    }
    values.rotation=rotateAngles(this.object.rotation,values.rotation);
    return Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(this.object[key])));
  }
}
