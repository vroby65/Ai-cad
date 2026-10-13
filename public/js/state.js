export const emptyProject = () => ({version:1,name:'New project',units:'mm',objects:[],groups:[]});
const copy = value => structuredClone(value);
export class History {
  constructor(state, limit=40) { this.limit=limit; this.reset(state); }
  reset(state) { this.states=[copy(state)]; this.index=0; }
  get current() { return copy(this.states[this.index]); }
  get canUndo() { return this.index>0; }
  get canRedo() { return this.index<this.states.length-1; }
  commit(state) {
    this.states=this.states.slice(0,this.index+1); this.states.push(copy(state));
    if(this.states.length>this.limit) this.states.shift();
    this.index=this.states.length-1; return this.current;
  }
  undo() { if(this.canUndo) this.index--; return this.current; }
  redo() { if(this.canRedo) this.index++; return this.current; }
}
