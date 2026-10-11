<?php
declare(strict_types=1);

final class Demo
{
    public static function prompts(): array
    {
        return ['Disegna un cubo rosso di 100 mm.', 'Aggiungi un cilindro sopra il cubo.', 'Crea quattro ruote nere.',
            'Sposta le ruote posteriori di 50 mm.', 'Elimina il cilindro.', 'Crea una sfera blu di raggio 40 mm.',
            'Crea un cono verde alto 100 mm.', 'Ruota il cubo di 45 gradi attorno a Z.', 'Raddoppia le dimensioni del cubo.',
            'Duplica il cubo a destra.', 'Rinomina il cubo in Blocco.', 'Raggruppa tutti gli oggetti.'];
    }

    private static function newId(stdClass $state, string $prefix): string
    {
        $ids=array_column(array_merge($state->objects,$state->groups),'id'); $i=1;
        while (in_array($prefix.'-'.$i,$ids,true)) $i++;
        return $prefix.'-'.$i;
    }

    private static function primitive(stdClass $state, string $type, string $name, array $dims, array $pos, string $color, array $rot=[0,0,0]): stdClass
    {
        return (object)['op'=>'create','object'=>(object)['id'=>self::newId($state,$type),'type'=>$type,'name'=>$name,'dimensions'=>(object)$dims,'position'=>$pos,'rotation'=>$rot,'color'=>$color,'groupId'=>null]];
    }

    private static function find(stdClass $state, string $type): stdClass
    {
        foreach ($state->objects as $o) if ($o->type===$type) return $o;
        throw new InvalidArgumentException('Prima crea un oggetto di tipo '.$type.'.');
    }

    public static function interpret(string $prompt, stdClass $state): stdClass
    {
        $normalized=mb_strtolower(rtrim(trim($prompt),'.!?'));
        $match=null;
        foreach (self::prompts() as $i=>$p) if ($normalized===mb_strtolower(rtrim($p,'.'))) $match=$i;
        if ($match===null) throw new InvalidArgumentException('In modalità Demo usa uno dei comandi predefiniti sotto il prompt. Per frasi libere scegli DeepSeek.');
        $ops=[];
        switch ($match) {
            case 0: $ops[]=self::primitive($state,'box','Cubo rosso',['x'=>100,'y'=>100,'z'=>100],[0,0,50],'#f05b55'); break;
            case 1:
                $cube=self::find($state,'box');
                $ops[]=self::primitive($state,'cylinder','Cilindro',['radius'=>30,'height'=>60],[$cube->position[0],$cube->position[1],$cube->position[2]+$cube->dimensions->z/2+30],'#f4b860');
                break;
            case 2:
                $working=Project::parse(json_encode($state));
                foreach ([[-70,-65,25],[-70,65,25],[70,-65,25],[70,65,25]] as $i=>$pos) {
                    $op=self::primitive($working,'cylinder',($i<2 ? 'Ruota posteriore ' : 'Ruota anteriore ').($i%2+1),['radius'=>25,'height'=>18],$pos,'#252d3e',[90,0,0]);
                    $ops[]=$op; $working=Project::apply($working,(object)['operations'=>[$op]]);
                }
                break;
            case 3:
                $ids=array_map(fn($o)=>$o->id,array_values(array_filter($state->objects,fn($o)=>str_starts_with($o->name,'Ruota posteriore'))));
                if (!$ids) throw new InvalidArgumentException('Prima crea le quattro ruote.');
                $ops[]=(object)['op'=>'translate','ids'=>$ids,'delta'=>[-50,0,0]]; break;
            case 4: $ops[]=(object)['op'=>'delete','ids'=>[self::find($state,'cylinder')->id]]; break;
            case 5: $ops[]=self::primitive($state,'sphere','Sfera blu',['radius'=>40],[150,0,40],'#5c9cf5'); break;
            case 6: $ops[]=self::primitive($state,'cone','Cono verde',['radius'=>40,'height'=>100],[-150,0,50],'#62c7a5'); break;
            case 7: $ops[]=(object)['op'=>'rotate','ids'=>[self::find($state,'box')->id],'delta'=>[0,0,45]]; break;
            case 8:
                $o=self::find($state,'box'); $d=$o->dimensions;
                $ops[]=(object)['op'=>'resize','id'=>$o->id,'dimensions'=>(object)['x'=>$d->x*2,'y'=>$d->y*2,'z'=>$d->z*2]]; break;
            case 9: $ops[]=(object)['op'=>'duplicate','id'=>self::find($state,'box')->id,'newId'=>self::newId($state,'box'),'offset'=>[150,0,0]]; break;
            case 10: $ops[]=(object)['op'=>'update','id'=>self::find($state,'box')->id,'changes'=>(object)['name'=>'Blocco']]; break;
            case 11:
                if (!$state->objects) throw new InvalidArgumentException('Prima crea almeno un oggetto.');
                $ops[]=(object)['op'=>'group','id'=>self::newId($state,'group'),'name'=>'Il mio gruppo','ids'=>array_column($state->objects,'id')]; break;
            default: throw new InvalidArgumentException('In modalità Demo usa uno dei comandi predefiniti sotto il prompt. Per frasi libere scegli DeepSeek.');
        }
        return (object)['operations'=>$ops];
    }
}
