const vector = v => v.join(', ');
const dimensions = d => Object.entries(d).map(([axis,value])=>`${axis}: ${value} mm`).join(' · ');
const modifiers = list => list.length ? list.map(m=>`${{twist:'torsione',bend:'piegatura',taper:'rastremazione'}[m.type]} su ${m.axis.toUpperCase()} ${m.type==='taper' ? '×'+m.factor : m.angle+'°'}`).join('; ') : 'ripristina la geometria originale';
export function explain(op) {
  switch(op.op) {
    case 'create': return `Crea ${op.object.name} (${op.object.type}${op.object.hole ? ' · FORO: sottrae materiale' : ''}): ${dimensions(op.object.dimensions)}; centro [${vector(op.object.position)}] mm; colore ${op.object.color}${op.object.profile ? '; profilo: '+op.object.profile.length+' punti' : ''}${op.object.modifiers?.length ? '; '+modifiers(op.object.modifiers) : ''}.`;
    case 'translate': return `Trasla ${op.ids.join(', ')} di [${vector(op.delta)}] mm: somma il vettore alla posizione.`;
    case 'rotate': return `Ruota ${op.ids.join(', ')} di [${vector(op.delta)}] gradi sugli assi della griglia, prima X, poi Y, poi Z, componendo l’orientamento esistente. Ogni oggetto ruota attorno al proprio centro.`;
    case 'resize': return `Ridimensiona ${op.id}: ${dimensions(op.dimensions)}; il centro rimane fermo.`;
    case 'deform': return `Deforma ${op.id}: ${modifiers(op.modifiers)}. I parametri restano modificabili.`;
    case 'update': return `Modifica ${op.id}: ${Object.entries(op.changes).map(([field,value])=>`${field}: ${field==='hole' ? value ? 'FORO (sottrae materiale)' : 'PIENO' : field==='profile' ? `${value.length} punti di riferimento in mm` : field==='modifiers' ? modifiers(value) : field==='dimensions' ? dimensions(value) : Array.isArray(value) ? `[${vector(value)}] ${field==='rotation' ? '°' : 'mm'}` : value}`).join('; ')}.`;
    case 'duplicate': return `Copia ${op.id} in ${op.newId} e sposta la copia di [${vector(op.offset)}] mm.`;
    case 'delete': return `Elimina ${op.ids.join(', ')} dalla scena, compresi i membri se è un gruppo.`;
    case 'subtract': return `Sottrae le forme foro ${op.toolIds.join(', ')} dai solidi ${op.ids.join(', ')}: ${op.bake===true ? 'finalizza la geometria e consuma gli utensili' : 'conserva originali e fori modificabili dal pannello Oggetti'}; gli ID dei solidi rimangono gli stessi.`;
    case 'group': return `Raggruppa ${op.ids.join(', ')} in ${op.name}: le forme mantengono le loro coordinate.`;
    case 'ungroup': return `Scioglie ${op.id} mantenendo gli oggetti.`;
    default: return 'Operazione geometrica.';
  }
}
