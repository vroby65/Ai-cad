// Local session diagnostics; never transmit logs or persist credentials.
export class Diagnostics {
  constructor(secret=()=>'',onChange=()=>{}) { this.secret=secret; this.onChange=onChange; this.entries=[]; }
  record(stage,data={}) {
    const secret=this.secret().trim();
    const redact=text=>{
      if(secret) text=text.split(secret).join('[REDACTED]');
      return text.replace(/\bsk-[a-zA-Z0-9_-]{16,}\b/g,'[REDACTED]').replace(/Bearer\s+[^\s"\\]+/gi,'Bearer [REDACTED]');
    };
    const raw=JSON.stringify(data,(key,value)=>{
      if(/^(authorization|headers|key|api[_-]?key|password|reasoning_content|vertices)$/i.test(key)) return undefined;
      return typeof value==='string' ? redact(value).slice(0,65536) : value;
    });
    const safe=new TextEncoder().encode(raw).byteLength>65536 ? {truncated:true,preview:raw.slice(0,16000)} : JSON.parse(raw);
    this.entries.push({time:new Date().toISOString(),stage:redact(stage),data:safe});
    while(this.entries.length>100 || new TextEncoder().encode(JSON.stringify(this.entries)).byteLength>256*1024) this.entries.shift();
    this.onChange();
  }
  clear() { this.entries=[];this.onChange(); }
  export() { return JSON.stringify({app:'AIcad',version:1,entries:this.entries},null,2); }
}
