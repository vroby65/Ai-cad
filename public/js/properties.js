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
    const wrapper=this.node('label'),input=this.node('input');
    input.type=type; input.name=key; input.id='property-'+key.replace('.','-'); input.value=String(value);
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
    for(const [key,title,values,limit] of [['position','Centro · mm',object.position,100000],['rotation','Rotazione · °',object.rotation,36000]]) {
      const group=this.node('fieldset'),row=this.node('div'); row.className='property-vector';
      group.append(this.node('legend',title));
      for(const [i,axis] of ['x','y','z'].entries()) row.append(this.input(key+'.'+axis,axis.toUpperCase(),'number',values[i],-limit,limit));
      group.append(row); this.fields.append(group);
    }
    const group=this.node('fieldset'); group.append(this.node('legend','Dimensioni · mm'));
    const labels={x:'X · larghezza',y:'Y · profondità',z:'Z · altezza',radius:'Raggio',height:'Altezza'};
    for(const [key,value] of Object.entries(object.dimensions)) {
      const planar=object.type==='mesh' && value===0;
      group.append(this.input('dimensions.'+key,labels[key],'number',value,object.type==='mesh'?0:.1,planar?0:10000,planar));
    }
    const button=this.node('button','Applica'); button.type='submit'; button.className='property-apply';
    this.fields.append(group,button);
  }
  setBusy(busy) { this.fields.disabled=busy; }
  changes() {
    const values={name:this.inputs.name.value,color:this.inputs.color.value,position:[],rotation:[],dimensions:{}};
    for(const [key,input] of Object.entries(this.inputs)) {
      if(input.type!=='number') continue;
      if(!input.value.trim() || !Number.isFinite(Number(input.value))) throw new Error('Inserisci un numero valido in tutti i campi.');
      const [field,axis]=key.split('.');
      if(field==='dimensions') values.dimensions[axis]=Number(input.value);
      else values[field][['x','y','z'].indexOf(axis)]=Number(input.value);
    }
    return Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(this.object[key])));
  }
}
