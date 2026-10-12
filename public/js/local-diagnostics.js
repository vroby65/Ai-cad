// Optional loopback collector; unavailable collectors never block modeling.
export function localDiagnostics(log,location=globalThis.location,fetcher=globalThis.fetch) {
  if(!['localhost','127.0.0.1','[::1]'].includes(location?.hostname)) return async()=>{};
  return async()=>{
    try {
      await fetcher('http://127.0.0.1:8001/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:log.export(),credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(2000)});
    } catch { /* The in-page log remains available. */ }
  };
}
