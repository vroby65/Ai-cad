export function setupChatResize(editor,chat,handle) {
  let height=chat.getBoundingClientRect().height,drag=null;
  function limits() {
    const available=Math.max(0,editor.clientHeight-handle.offsetHeight);
    const min=Math.min(140,available/2);
    return {min,max:Math.max(min,available-160)};
  }
  function resize(value) {
    const {min,max}=limits(); height=Math.round(Math.min(max,Math.max(min,value)));
    chat.style.setProperty('--chat-height',height+'px');
    handle.setAttribute('aria-valuemin',Math.round(min)); handle.setAttribute('aria-valuemax',Math.round(max));
    handle.setAttribute('aria-valuenow',height); handle.setAttribute('aria-valuetext',`Chat alta ${height} pixel`);
  }
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0 || event.isPrimary===false || drag) return;
    drag={id:event.pointerId,y:event.clientY,height}; handle.setPointerCapture(event.pointerId); event.preventDefault();
  });
  handle.addEventListener('pointermove',event=>{
    if(drag && drag.id===event.pointerId) resize(drag.height+drag.y-event.clientY);
  });
  function end(event) {
    if(!drag || drag.id!==event.pointerId) return;
    drag=null; if(handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(name,end);
  handle.addEventListener('keydown',event=>{
    const {min,max}=limits();
    const values={ArrowUp:height+20,ArrowDown:height-20,Home:min,End:max};
    if(!Object.hasOwn(values,event.key)) return;
    event.preventDefault(); resize(values[event.key]);
  });
  resize(height);
  new ResizeObserver(()=>resize(height)).observe(editor);
}
