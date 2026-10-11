<?php
declare(strict_types=1);
require __DIR__ . '/../src/Project.php';
require __DIR__ . '/../src/DeepSeek.php';
require __DIR__ . '/../src/Demo.php';
require __DIR__ . '/../src/Config.php';
$n = 0;
function check(bool $ok, string $name): void { global $n; if (!$ok) throw new RuntimeException($name); ++$n; echo "✓ $name\n"; }
function bad(callable $fn, string $name): void { try { $fn(); } catch (InvalidArgumentException|RuntimeException $e) { check(true, $name); return; } throw new RuntimeException("Accettato: $name"); }
function data(string $json): mixed { return json_decode($json, false, 64, JSON_THROW_ON_ERROR); }
function batch(array $ops): stdClass { return (object)['operations' => $ops]; }
$empty = Project::empty();
$cube = data('{"id":"cube-1","type":"box","name":"Cubo","dimensions":{"x":100,"y":100,"z":100},"position":[0,0,50],"rotation":[0,0,0],"color":"#ef4444","groupId":null}');
$created = Project::apply($empty, batch([(object)['op'=>'create','object'=>$cube]]));
check(count($created->objects) === 1 && $created->objects[0]->id === 'cube-1', 'creazione e ID stabile');
check(count($empty->objects) === 0, 'stato iniziale immutato');
$modified = Project::apply($created, data('{"operations":[{"op":"translate","ids":["cube-1"],"delta":[50,0,0]},{"op":"rotate","ids":["cube-1"],"delta":[0,0,90]},{"op":"resize","id":"cube-1","dimensions":{"x":120,"y":80,"z":60}},{"op":"update","id":"cube-1","changes":{"name":"Nuovo","color":"#000000"}}]}'));
check($modified->objects[0]->position[0] === 50 && $modified->objects[0]->rotation[2] === 90, 'traslazione e rotazione');
check($modified->objects[0]->dimensions->x === 120 && $modified->objects[0]->name === 'Nuovo', 'dimensioni, colore e nome');
$duplicated = Project::apply($modified, data('{"operations":[{"op":"duplicate","id":"cube-1","newId":"cube-2","offset":[200,0,0]},{"op":"group","id":"group-1","name":"Cubi","ids":["cube-1","cube-2"]}]}'));
check(count($duplicated->objects) === 2 && $duplicated->objects[1]->position[0] === 250, 'duplicazione con nuovo ID');
check($duplicated->objects[1]->groupId === 'group-1', 'raggruppamento');
$groupMoved = Project::apply($duplicated, data('{"operations":[{"op":"translate","ids":["group-1"],"delta":[0,20,0]}]}'));
check($groupMoved->objects[0]->position[1] === 20 && $groupMoved->objects[1]->position[1] === 20, 'trasformazione del gruppo');
$ungroup = Project::apply($duplicated, data('{"operations":[{"op":"ungroup","id":"group-1"}]}'));
check(count($ungroup->groups) === 0 && $ungroup->objects[0]->groupId === null, 'scioglimento del gruppo');
$deleted = Project::apply($duplicated, data('{"operations":[{"op":"delete","ids":["group-1"]}]}'));
check(count($deleted->objects) === 0 && count($deleted->groups) === 0, 'eliminazione gruppo e membri');
$roundtrip = Project::parse(json_encode($duplicated, JSON_THROW_ON_ERROR));
check(json_encode($roundtrip) === json_encode($duplicated), 'salvataggio e caricamento JSON');
foreach (['sphere'=>['radius'=>30], 'cylinder'=>['radius'=>20,'height'=>60], 'cone'=>['radius'=>30,'height'=>90]] as $type=>$dims) {
    $o = clone $cube; $o->id=$type; $o->type=$type; $o->dimensions=(object)$dims;
    check(Project::apply($empty, batch([(object)['op'=>'create','object'=>$o]]))->objects[0]->type === $type, "primitiva $type");
}
bad(fn()=>Project::apply($created, batch([(object)['op'=>'create','object'=>$cube]])), 'ID duplicati');
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"delete","ids":["missing"]}]}')), 'ID inesistente');
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"execute","code":"alert(1)"}]}')), 'codice arbitrario vietato');
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"update","id":"cube-1","changes":{"type":"sphere"}}]}')), 'campi non autorizzati');
foreach (['0','-1','10001','"100"','null','true','1e999'] as $v) bad(fn()=>Project::apply($created, data('{"operations":[{"op":"resize","id":"cube-1","dimensions":{"x":'.$v.',"y":1,"z":1}}]}')), "dimensione non valida $v");
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"translate","ids":["cube-1"],"delta":[1,2]}]}')), 'vettore incompleto');
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"translate","ids":["cube-1","cube-1"],"delta":[1,2,3]}]}')), 'destinatari ripetuti');
bad(fn()=>Project::apply($created, data('{"operations":[{"op":"update","id":"cube-1","changes":{"color":"<script>"}}]}')), 'colore ostile');
bad(fn()=>Project::parse('{"version":1,"name":"x","units":"inch","objects":[],"groups":[]}'), 'unità non autorizzata');
bad(fn()=>Project::parse(str_repeat(' ', Project::MAX_BYTES+1)), 'file troppo grande');
bad(fn()=>Project::parse('{"version":1,"name":"x","units":"mm","objects":{},"groups":[]}'), 'oggetto al posto di lista');
bad(fn()=>Project::parse('{"version":1,"name":"x","units":"mm","objects":[],"groups":[],"path":"../../etc/passwd"}'), 'path traversal non ammesso');
foreach (['', '```json {} ```', 'null', '[]', '{"operations":{}}', '{"operations":[],"code":"x"}', '{"operations":[{"op":"create"}]}'] as $raw) bad(fn()=>DeepSeek::parseOperations($raw, $empty), 'risposta LLM malformata '.substr($raw,0,30));
bad(fn()=>DeepSeek::parseEnvelope('{"choices":[{"finish_reason":"length","message":{"content":"{}"}}]}', $empty), 'risposta troncata');
bad(fn()=>DeepSeek::parseEnvelope('{}', $empty), 'envelope API malformato');
bad(fn()=>DeepSeek::parseEnvelope('{"choices":{}}', $empty), 'envelope API con tipo errato');
$content=json_encode(batch([(object)['op'=>'create','object'=>$cube]]),JSON_THROW_ON_ERROR);
$envelope=json_encode(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>$content]]]],JSON_THROW_ON_ERROR);
check(count(Project::apply($empty,DeepSeek::parseEnvelope($envelope,$empty))->objects)===1, 'risposta provider valida produce una modifica effettiva');
$ops = data('{"operations":[{"op":"translate","ids":["cube-1"],"delta":[10,0,0]},{"op":"delete","ids":["missing"]}]}');
bad(fn()=>Project::apply($created, $ops), 'batch atomico');
check($created->objects[0]->position[0] === 0, 'rollback intero batch');
$oversized = clone $empty; $oversized->objects=[];
for ($i=0; $i<201; $i++) { $o=clone $cube; $o->id='id-'.$i; $oversized->objects[]=$o; }
bad(fn()=>Project::validate($oversized), 'limite 200 oggetti');
bad(fn()=>Project::apply($empty,batch(array_fill(0,101,(object)['op'=>'delete','ids'=>['x']]))), 'limite 100 operazioni');
$orphan=Project::parse(json_encode($created)); $orphan->objects[0]->groupId='unknown';
bad(fn()=>Project::validate($orphan), 'gruppo inesistente');
foreach (Demo::prompts() as $prompt) {
    $state = str_contains($prompt,'cilindro') || str_contains($prompt,'cubo') && !str_starts_with($prompt,'Disegna') || str_starts_with($prompt,'Raggruppa') ? $created : $empty;
    if (str_starts_with($prompt,'Elimina')) $state=Project::apply($created,Demo::interpret('Aggiungi un cilindro sopra il cubo.', $created));
    if (str_starts_with($prompt,'Sposta le ruote')) $state=Project::apply($empty,Demo::interpret('Crea quattro ruote nere.', $empty));
    check(count(Project::apply($state,Demo::interpret($prompt,$state))->objects)<=200, "demo: $prompt");
}
foreach (glob(__DIR__.'/../../public/examples/*.json') as $path) check(count(Project::parse(file_get_contents($path))->objects)>0, 'esempio '.basename($path));
bad(fn()=>Demo::interpret('Esegui PHP', $empty), 'demo rifiuta prompt non predefiniti');
$savedEnv=[];
foreach (['DEEPCAD_ENV_FILE','DEEPSEEK_API_KEY','DEEPSEEK_MODEL'] as $name) { $savedEnv[$name]=getenv($name); putenv($name); }
$temp=tempnam(sys_get_temp_dir(),'deepcad-config-');
$publicTemp=tempnam(__DIR__.'/../../public','deepcad-test-');
try {
    file_put_contents($temp,"# Esempio di test, non una chiave reale\nDEEPSEEK_API_KEY=\"demo-not-a-key\"\nDEEPSEEK_MODEL=fictional-model\n");
    putenv('DEEPCAD_ENV_FILE='.$temp);
    $config=Config::load();
    check($config['DEEPSEEK_API_KEY']==='demo-not-a-key' && $config['DEEPSEEK_MODEL']==='fictional-model', 'configurazione privata senza valutazione di codice');
    putenv('DEEPSEEK_MODEL=environment-model');
    check(Config::load()['DEEPSEEK_MODEL']==='environment-model', 'modello da ambiente ha precedenza sul file');
    putenv('DEEPCAD_ENV_FILE='.$publicTemp);
    bad(fn()=>Config::load(), 'configurazione dentro public vietata');
} finally {
    unlink($temp); unlink($publicTemp);
    foreach ($savedEnv as $name=>$value) putenv($value===false ? $name : $name.'='.$value);
}
echo "$n controlli superati.\n";
