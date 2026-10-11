export async function request(action, body) {
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),70000);
  try {
    const response=await fetch(`api.php?action=${action}`,body===undefined ? {signal:controller.signal} : {
      method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal
    });
    let result;
    try { result=await response.json(); } catch { throw new Error('Risposta del server non valida. Verifica che PHP sia attivo.'); }
    if(!response.ok) throw new Error(result.error||`Errore HTTP ${response.status}`);
    return result;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('Tempo di attesa scaduto. Riprova.');
    throw error;
  } finally { clearTimeout(timeout); }
}
