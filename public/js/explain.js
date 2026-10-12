const vector = v => v.join(', ');
const dimensions = d => Object.entries(d).map(([axis,value])=>`${axis}: ${value} mm`).join(' · ');
export function explain(op) {
  switch(op.op) {
    case 'create': return `Crea ${op.object.name} (${op.object.type}${op.object.hole ? ' · FORO: sottrae materiale' : ''}): ${dimensions(op.object.dimensions)}; centro [${vector(op.object.position)}] mm; colore ${op.object.color}.`;
    case 'translate': return `Trasla ${op.ids.join(', ')} di [${vector(op.delta)}] mm: somma il vettore alla posizione.`;
    case 'rotate': return `Aggiunge [${vector(op.delta)}] gradi agli angoli XYZ di ${op.ids.join(', ')}: ogni oggetto ruota attorno al proprio centro.`;
    case 'resize': return `Ridimensiona ${op.id}: ${dimensions(op.dimensions)}; il centro rimane fermo.`;
    case 'update': return `Modifica ${op.id}: ${Object.entries(op.changes).map(([field,value])=>`${field}: ${field==='hole' ? value ? 'FORO (sottrae materiale)' : 'PIENO' : field==='dimensions' ? dimensions(value) : Array.isArray(value) ? `[${vector(value)}] ${field==='rotation' ? '°' : 'mm'}` : value}`).join('; ')}.`;
    case 'duplicate': return `Copia ${op.id} in ${op.newId} e sposta la copia di [${vector(op.offset)}] mm.`;
    case 'delete': return `Elimina ${op.ids.join(', ')} dalla scena, compresi i membri se è un gruppo.`;
    case 'subtract': return `Sottrae le forme foro ${op.toolIds.join(', ')} dai solidi ${op.ids.join(', ')}: ${op.bake===true ? 'finalizza la geometria e consuma gli utensili' : 'conserva originali e fori modificabili dal pannello Oggetti'}; gli ID dei solidi rimangono gli stessi.`;
    case 'group': return `Raggruppa ${op.ids.join(', ')} in ${op.name}: le forme mantengono le loro coordinate.`;
    case 'ungroup': return `Scioglie ${op.id} mantenendo gli oggetti.`;
    default: return 'Operazione geometrica.';
  }
}
