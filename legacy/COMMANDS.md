# Archived DeepCAD JSON contract v1

This is the original PHP backend contract, not the active browser app's contract.
Interpreter responses contain only {"operations":[...]}, no extra fields, code or
Markdown. A batch has 0–100 sequential, atomic operations. Any error rejects the
entire batch; an empty list means no change. The PHP backend validates everything.

## State

~~~json
{
  "version":1,"name":"New project","units":"mm",
  "objects":[{
    "id":"cube-1","type":"box","name":"Red cube",
    "dimensions":{"x":100,"y":100,"z":100},
    "position":[0,0,50],"rotation":[0,0,0],
    "color":"#ef4444","groupId":null
  }],
  "groups":[]
}
~~~

All fields are required; objects/groups are arrays. Groups are {id,name} with
members. Object/group IDs are unique: 1–64 characters, first ASCII letter, then
ASCII letters/digits/_/-. Names: 1–80 characters, project name 1–100, no controls.
Text must always be rendered as text.

Right-handed coordinates: X/Y horizontal, Z vertical, one unit = one millimeter.
Position is the object center, components ±100000 mm. Rotation is local Euler
XYZ degrees, components ±36000. Cylinders/cones align with Z, cone tip +Z.

| type | dimensions (exact fields, finite numbers 0.1–10000 mm) |
| --- | --- |
| box | {"x":100,"y":80,"z":60}; cube when equal |
| sphere | {"radius":40} |
| cylinder, cone | {"radius":30,"height":60} |

Color is #RRGGBB; groupId is null or an existing group ID. Limits: 200 objects,
200 groups and 512 KiB per file/request/AI response. Numeric strings, booleans and
null are not numbers. No meshes, hole tools or subtraction are supported.

## Operations

~~~text
{op:"create",object}
{op:"update",id,changes:{name?,color?,position?,rotation?,dimensions?}}
{op:"resize",id,dimensions}
{op:"translate",ids,delta:[x,y,z]}
{op:"rotate",ids,delta:[x,y,z]}
{op:"duplicate",id,newId,offset:[x,y,z]}
{op:"delete",ids}
{op:"group",id,name,ids}
{op:"ungroup",id}
~~~

Only shown fields are allowed; changes must contain at least one allowed field.
Create requires a new ID. Update sets absolute values, never type/ID/groupId.
Resize sets all dimensions with fixed center. Translate adds delta ±100000 mm;
rotate adds Euler components ±36000 degrees on each object's center.
Duplicate copies one object with a new ID, offset ±100000 mm and no group.

Ids is 1–200 distinct object/group IDs; groups expand to members and overlapping
recipients are processed once. Groups are flat without shared pivots. Group moves
members from prior groups and empty groups disappear. Delete on a group deletes
members; ungroup retains them. Validate after every operation; create before group.

## Archived HTTP API

Relative endpoint: api.php?action=...; loopback only, Host localhost/127.0.0.1/[::1],
same-origin requests when Origin exists, no CORS.

- GET config: {deepseekReady:false,demoPrompts:[...]}, no key/model.
- POST validate with {project}: returns validated {project}.
- POST command with {project,prompt,mode,selectedId}. Mode demo/deepseek; selection
  null or existing object; prompt 1–2000 characters. Returns
  {project,operations,modelJson:{operations},source:"demo"}.
- Errors: {error:"Message"}, HTTP 422 validation, 502 provider/configuration,
  403 access, 413 Content-Length, 415 Content-Type, 405 method, 500 internal.

POST needs application/json. No endpoint accepts paths, filenames or executable
code. Complete state accompanies each request; there are no persistent server
project sessions. Files are downloaded/uploaded locally.
