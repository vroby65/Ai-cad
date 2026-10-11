<?php
declare(strict_types=1);

final class Project
{
    public const MAX_BYTES = 524288;
    public const MAX_OBJECTS = 200;
    public const MAX_OPERATIONS = 100;

    public static function empty(): stdClass
    {
        return (object)['version'=>1, 'name'=>'Nuovo progetto', 'units'=>'mm', 'objects'=>[], 'groups'=>[]];
    }

    public static function decode(string $raw): mixed
    {
        if (strlen($raw) > self::MAX_BYTES) throw new InvalidArgumentException('JSON troppo grande (massimo 512 KiB).');
        try { return json_decode($raw, false, 32, JSON_THROW_ON_ERROR); }
        catch (JsonException $e) { throw new InvalidArgumentException('JSON non valido.'); }
    }

    public static function parse(string $raw): stdClass
    {
        return self::validate(self::decode($raw));
    }

    public static function fields(mixed $value, array $required, array $optional = []): void
    {
        if (!$value instanceof stdClass) throw new InvalidArgumentException('Atteso un oggetto JSON.');
        $keys = array_keys(get_object_vars($value));
        if (array_diff($required, $keys) || array_diff($keys, array_merge($required, $optional))) {
            throw new InvalidArgumentException('Campi mancanti o non autorizzati: '.implode(', ', $required).'.');
        }
    }

    private static function text(mixed $value, int $max): void
    {
        if (!is_string($value) || trim($value) === '' || mb_strlen($value) > $max || preg_match('/[\x00-\x1f\x7f]/u', $value)) {
            throw new InvalidArgumentException('Testo non valido o troppo lungo.');
        }
    }

    private static function id(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/D', $value)) throw new InvalidArgumentException('ID non valido.');
    }

    private static function number(mixed $value, float $min, float $max): void
    {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < $min || $value > $max) {
            throw new InvalidArgumentException("Numero fuori limite [$min, $max].");
        }
    }

    private static function vector(mixed $value, float $limit = 100000): void
    {
        if (!is_array($value) || !array_is_list($value) || count($value) !== 3) throw new InvalidArgumentException('Atteso vettore [x,y,z].');
        foreach ($value as $n) self::number($n, -$limit, $limit);
    }

    private static function dimensions(mixed $dims, string $type): void
    {
        $keys = match ($type) { 'box'=>['x','y','z'], 'sphere'=>['radius'], 'cylinder','cone'=>['radius','height'], default=>throw new InvalidArgumentException('Primitiva non autorizzata.') };
        self::fields($dims, $keys);
        foreach ($keys as $key) self::number($dims->$key, 0.1, 10000);
    }

    private static function object(mixed $o): void
    {
        self::fields($o, ['id','type','name','dimensions','position','rotation','color','groupId']);
        self::id($o->id); self::text($o->name, 80);
        if (!is_string($o->type)) throw new InvalidArgumentException('Tipo non valido.');
        self::dimensions($o->dimensions, $o->type);
        self::vector($o->position); self::vector($o->rotation, 36000);
        if (!is_string($o->color) || !preg_match('/^#[0-9a-fA-F]{6}$/D', $o->color)) throw new InvalidArgumentException('Colore deve essere #RRGGBB.');
        if ($o->groupId !== null) self::id($o->groupId);
    }

    public static function validate(mixed $state): stdClass
    {
        self::fields($state, ['version','name','units','objects','groups']);
        if ($state->version !== 1 || $state->units !== 'mm') throw new InvalidArgumentException('Versione o unità non supportata.');
        self::text($state->name, 100);
        foreach (['objects','groups'] as $list) {
            if (!is_array($state->$list) || !array_is_list($state->$list) || count($state->$list) > self::MAX_OBJECTS) throw new InvalidArgumentException('Lista non valida: massimo 200 elementi.');
        }
        $ids=[]; $groups=[];
        foreach ($state->groups as $g) {
            self::fields($g, ['id','name']); self::id($g->id); self::text($g->name,80);
            if (isset($ids[$g->id])) throw new InvalidArgumentException('ID duplicato.');
            $ids[$g->id]=true; $groups[$g->id]=true;
        }
        foreach ($state->objects as $o) {
            self::object($o);
            if (isset($ids[$o->id])) throw new InvalidArgumentException('ID duplicato.');
            $ids[$o->id]=true;
            if ($o->groupId !== null && !isset($groups[$o->groupId])) throw new InvalidArgumentException('Gruppo inesistente.');
        }
        foreach ($groups as $id=>$_) {
            if (!array_filter($state->objects, fn($o)=>$o->groupId === $id)) throw new InvalidArgumentException('Gruppo vuoto.');
        }
        return $state;
    }

    private static function find(stdClass $state, mixed $id): stdClass
    {
        self::id($id);
        foreach ($state->objects as $o) if ($o->id === $id) return $o;
        throw new InvalidArgumentException('Oggetto inesistente: '.$id.'.');
    }

    private static function targets(stdClass $state, mixed $ids): array
    {
        if (!is_array($ids) || !array_is_list($ids) || !$ids || count($ids)>200) throw new InvalidArgumentException('Destinatari non validi.');
        $result=[]; $seen=[];
        foreach ($ids as $id) {
            self::id($id);
            if (isset($seen[$id])) throw new InvalidArgumentException('ID destinatario ripetuto.');
            $seen[$id]=true;
            $group = array_filter($state->groups, fn($g)=>$g->id === $id);
            $members = $group ? array_filter($state->objects, fn($o)=>$o->groupId === $id) : [self::find($state,$id)];
            foreach ($members as $o) $result[$o->id]=$o;
        }
        return array_values($result);
    }

    private static function unused(stdClass $state, mixed $id): void
    {
        self::id($id);
        foreach (array_merge($state->objects,$state->groups) as $o) if ($o->id === $id) throw new InvalidArgumentException('ID già utilizzato.');
    }

    private static function prune(stdClass $state): void
    {
        $state->groups = array_values(array_filter($state->groups, fn($g)=>count(array_filter($state->objects,fn($o)=>$o->groupId === $g->id))>0));
    }

    // Work on a deep copy: a failed operation cannot partially change a project.
    public static function apply(stdClass $state, mixed $batch): stdClass
    {
        self::validate($state);
        self::fields($batch, ['operations']);
        if (!is_array($batch->operations) || !array_is_list($batch->operations) || count($batch->operations)>self::MAX_OPERATIONS) throw new InvalidArgumentException('Massimo 100 operazioni per comando.');
        $next = self::parse(json_encode($state,JSON_THROW_ON_ERROR));
        foreach ($batch->operations as $op) {
            if (!$op instanceof stdClass || !isset($op->op) || !is_string($op->op)) throw new InvalidArgumentException('Operazione non valida.');
            switch ($op->op) {
                case 'create':
                    self::fields($op,['op','object']); self::object($op->object); self::unused($next,$op->object->id);
                    $next->objects[]=clone $op->object;
                    break;
                case 'update':
                    self::fields($op,['op','id','changes']);
                    self::fields($op->changes,[],['name','color','position','rotation','dimensions']);
                    if (!get_object_vars($op->changes)) throw new InvalidArgumentException('Modifiche vuote.');
                    $o=self::find($next,$op->id);
                    foreach ($op->changes as $key=>$value) $o->$key=$value;
                    break;
                case 'resize':
                    self::fields($op,['op','id','dimensions']);
                    self::find($next,$op->id)->dimensions=$op->dimensions;
                    break;
                case 'translate': case 'rotate':
                    self::fields($op,['op','ids','delta']); self::vector($op->delta, $op->op==='rotate' ? 36000 : 100000);
                    $field=$op->op==='translate' ? 'position' : 'rotation';
                    foreach (self::targets($next,$op->ids) as $o) for ($i=0;$i<3;$i++) $o->{$field}[$i]+=$op->delta[$i];
                    break;
                case 'duplicate':
                    self::fields($op,['op','id','newId','offset']); self::unused($next,$op->newId); self::vector($op->offset);
                    $o=self::decode(json_encode(self::find($next,$op->id),JSON_THROW_ON_ERROR));
                    $o->id=$op->newId; $o->name=mb_substr($o->name,0,73).' copia'; $o->groupId=null;
                    for ($i=0;$i<3;$i++) $o->position[$i]+=$op->offset[$i];
                    $next->objects[]=$o;
                    break;
                case 'delete':
                    self::fields($op,['op','ids']);
                    $remove=array_column(self::targets($next,$op->ids),'id');
                    $next->objects=array_values(array_filter($next->objects,fn($o)=>!in_array($o->id,$remove,true)));
                    self::prune($next);
                    break;
                case 'group':
                    self::fields($op,['op','id','name','ids']); self::unused($next,$op->id); self::text($op->name,80);
                    foreach (self::targets($next,$op->ids) as $o) $o->groupId=$op->id;
                    $next->groups[]=(object)['id'=>$op->id,'name'=>$op->name]; self::prune($next);
                    break;
                case 'ungroup':
                    self::fields($op,['op','id']); self::id($op->id);
                    if (!array_filter($next->groups,fn($g)=>$g->id===$op->id)) throw new InvalidArgumentException('Gruppo inesistente.');
                    foreach ($next->objects as $o) if ($o->groupId===$op->id) $o->groupId=null;
                    self::prune($next);
                    break;
                default: throw new InvalidArgumentException('Operazione non autorizzata: '.$op->op.'.');
            }
            self::validate($next);
        }
        return $next;
    }
}
