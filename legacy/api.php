<?php
declare(strict_types=1);
ini_set('display_errors','0');
require __DIR__.'/src/Project.php';
require __DIR__.'/src/Config.php';
require __DIR__.'/src/DeepSeek.php';
require __DIR__.'/src/Demo.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(array $value, int $status=200): never {
    http_response_code($status); echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR); exit;
}
try {
    // Limit to loopback even if a server is accidentally exposed on the LAN.
    if (!in_array($_SERVER['REMOTE_ADDR'] ?? '',['127.0.0.1','::1'],true)) respond(['error'=>'Accesso consentito solo da localhost.'],403);
    $host=$_SERVER['HTTP_HOST'] ?? '';
    if (!preg_match('/^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/D',$host)) respond(['error'=>'Host non autorizzato.'],403);
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        $expected=(!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off' ? 'https' : 'http').'://'.$host;
        if ($_SERVER['HTTP_ORIGIN']!==$expected) respond(['error'=>'Origine non autorizzata.'],403);
    }
    $action=$_GET['action'] ?? '';
    if ($action==='config' && $_SERVER['REQUEST_METHOD']==='GET') {
        $config=Config::load();
        respond(['deepseekReady'=>!empty($config['DEEPSEEK_API_KEY']) && !empty($config['DEEPSEEK_MODEL']),'demoPrompts'=>Demo::prompts()]);
    }
    if ($_SERVER['REQUEST_METHOD']!=='POST') respond(['error'=>'Metodo non autorizzato.'],405);
    if (trim(explode(';',strtolower($_SERVER['CONTENT_TYPE'] ?? ''))[0])!=='application/json') respond(['error'=>'Usa Content-Type application/json.'],415);
    if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH']>Project::MAX_BYTES) respond(['error'=>'Richiesta troppo grande.'],413);
    $input=Project::decode(file_get_contents('php://input',false,null,0,Project::MAX_BYTES+1));
    if ($action==='validate') {
        Project::fields($input,['project']);
        respond(['project'=>Project::validate($input->project)]);
    }
    if ($action!=='command') respond(['error'=>'Endpoint inesistente.'],404);
    Project::fields($input,['project','prompt','mode','selectedId']);
    $project=Project::validate($input->project);
    if (!is_string($input->prompt) || trim($input->prompt)==='' || mb_strlen($input->prompt)>2000) throw new InvalidArgumentException('Il comando deve contenere da 1 a 2000 caratteri.');
    if (!in_array($input->mode,['demo','deepseek'],true)) throw new InvalidArgumentException('Modalità non valida.');
    if ($input->selectedId!==null && (!is_string($input->selectedId) || !in_array($input->selectedId,array_column($project->objects,'id'),true))) throw new InvalidArgumentException('Selezione inesistente.');
    $batch=$input->mode==='demo' ? Demo::interpret($input->prompt,$project) : DeepSeek::interpret($input->prompt,$project,$input->selectedId,Config::load());
    $updated=Project::apply($project,$batch);
    respond(['project'=>$updated,'operations'=>$batch->operations,'modelJson'=>$batch,'source'=>$input->mode]);
} catch (InvalidArgumentException $e) {
    respond(['error'=>$e->getMessage()],422);
} catch (RuntimeException $e) {
    respond(['error'=>$e->getMessage()],502);
} catch (Throwable $e) {
    error_log('DeepCAD: errore interno '.get_class($e));
    respond(['error'=>'Errore interno del server. Controlla i log locali.'],500);
}
