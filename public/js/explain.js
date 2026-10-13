const vector = v => v.join(', ');
const dimensions = d => Object.entries(d).map(([axis,value])=>`${axis}: ${value} mm`).join(' · ');
const modifiers = list => list.length ? list.map(m=>`${m.type} on ${m.axis.toUpperCase()} ${m.type==='taper' ? '×'+m.factor : m.angle+'°'}`).join('; ') : 'restore the original geometry';
export function explain(op) {
  switch(op.op) {
    case 'create': return `Create ${op.object.name} (${op.object.type}${op.object.hole ? ' · HOLE: removes material' : ''}): ${dimensions(op.object.dimensions)}; center [${vector(op.object.position)}] mm; color ${op.object.color}${op.object.profile ? '; profile: '+op.object.profile.length+' points' : ''}${op.object.modifiers?.length ? '; '+modifiers(op.object.modifiers) : ''}.`;
    case 'translate': return `Translate ${op.ids.join(', ')} by [${vector(op.delta)}] mm: add the vector to the position.`;
    case 'rotate': return `Rotate ${op.ids.join(', ')} by [${vector(op.delta)}] degrees around world axes, X then Y then Z, composing the existing orientation. Each object rotates around its own center.`;
    case 'resize': return `Resize ${op.id}: ${dimensions(op.dimensions)}; preserve the center.`;
    case 'deform': return `Deform ${op.id}: ${modifiers(op.modifiers)}. Parameters remain editable.`;
    case 'update': return `Update ${op.id}: ${Object.entries(op.changes).map(([field,value])=>`${field}: ${field==='hole' ? value ? 'HOLE (removes material)' : 'SOLID' : field==='profile' ? `${value.length} reference points in mm` : field==='modifiers' ? modifiers(value) : field==='dimensions' ? dimensions(value) : Array.isArray(value) ? `[${vector(value)}] ${field==='rotation' ? '°' : 'mm'}` : value}`).join('; ')}.`;
    case 'duplicate': return `Duplicate ${op.id} as ${op.newId} and move the copy by [${vector(op.offset)}] mm.`;
    case 'delete': return `Delete ${op.ids.join(', ')} from the scene, including members of any deleted group.`;
    case 'subtract': return `Subtract hole tools ${op.toolIds.join(', ')} from solids ${op.ids.join(', ')}: ${op.bake===true ? 'finalize geometry and consume tools' : 'preserve original solids and holes editable in Objects'}; solid IDs stay the same.`;
    case 'group': return `Group ${op.ids.join(', ')} as ${op.name}: shapes keep their coordinates.`;
    case 'ungroup': return `Ungroup ${op.id}, preserving the objects.`;
    default: return 'Geometry operation.';
  }
}
