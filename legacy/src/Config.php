<?php
declare(strict_types=1);

final class Config
{
    public static function load(): array
    {
        // A configuration file lives outside public and is never evaluated as code.
        $path = getenv('DEEPCAD_ENV_FILE') ?: __DIR__.'/../../.env';
        $values=[];
        if (is_file($path)) {
            $real=realpath($path); $public=realpath(__DIR__.'/../../public');
            if ($real && $public && str_starts_with($real,$public.DIRECTORY_SEPARATOR)) throw new RuntimeException('La configurazione deve essere esterna a public.');
            if (!is_readable($path)) throw new RuntimeException('Il server non può leggere la configurazione locale.');
            foreach (file($path, FILE_IGNORE_NEW_LINES) as $line) {
                $line=trim($line);
                if ($line==='' || str_starts_with($line,'#')) continue;
                if (!preg_match('/^([A-Z_]+)=(.*)$/D',$line,$m)) throw new RuntimeException('Configurazione non valida.');
                $values[$m[1]]=trim(trim($m[2]),'"\'');
            }
        }
        foreach (['DEEPSEEK_API_KEY','DEEPSEEK_MODEL'] as $key) {
            $env=getenv($key); if ($env!==false) $values[$key]=$env;
        }
        return $values;
    }
}
