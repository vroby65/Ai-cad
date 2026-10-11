# DeepCAD JSON contract — browser client, version 1

The interpreter returns only:

~~~json
{"message":"Explanation in Italian","operations":[]}
~~~

No extra fields, code or Markdown. message is a nonblank string of 1–6000 characters.
Older responses containing only operations are accepted. A batch has 0–100
sequential, atomic operations; any error discards the entire batch. An empty list
does not modify the model. public/js/project.js is the validation authority.

## Project state

~~~json
{
  "version": 1,
  "name": "New project",
  "units": "mm",
  "objects": [
    {
      "id": "cube-1", "type": "box", "name": "Red cube",
      "dimensions": {"x": 100, "y": 100, "z": 100},
      "position": [0, 0, 50], "rotation": [0, 0, 0],
      "color": "#ef4444", "groupId": null
    }
  ],
  "groups": []
}
~~~

Shown fields are required. Primitive objects may also have boolean hole, default
false. Meshes have required vertices instead; hole is not allowed on a mesh.
Objects and groups are arrays; every group is {id,name} with at least one member.

Object/group IDs are unique across the project: 1–64 characters, first ASCII
letter, then ASCII letters/digits/_/-. Object/group names are nonblank, 1–80
characters; project names 1–100; no control characters.
Maximum 200 objects, 200 groups and 8 MiB per project. AI responses: 512 KiB.

Coordinates are right-handed, X/Y horizontal and Z vertical; 1 unit = 1 mm.
Position is the center, three finite numbers within ±100000 mm.
Rotation is local Euler XYZ in degrees, each within ±36000.
Unrotated cylinders/cones align with Z; the cone tip is +Z.
Color is #RRGGBB. GroupId is null or an existing group ID.
Numeric strings, booleans, null and nonfinite values are not numbers.

| type | exact dimensions fields |
| --- | --- |
| box | {"x":100,"y":80,"z":60}; equal dimensions make a cube |
| sphere | {"radius":40} |
| cylinder, cone | {"radius":30,"height":60} |
| mesh | {"x":100,"y":80,"z":60}; bounding-box extents |

Primitive dimensions: 0.1–10000 mm. Mesh dimensions: 0–10000 mm; zero is allowed
only on an axis whose base vertices have zero extent.

## Allowed operations

Fields below are exact and required; question marks denote optional changes.
The object in create must follow the primitive schema.

~~~text
{op:"create", object}
{op:"update", id, changes:{name?,color?,position?,rotation?,dimensions?,hole?}}
{op:"resize", id, dimensions}
{op:"translate", ids, delta:[x,y,z]}
{op:"rotate", ids, delta:[x,y,z]}
{op:"duplicate", id, newId, offset:[x,y,z]}
{op:"delete", ids}
{op:"subtract", ids, toolIds}
{op:"group", id, name, ids}
{op:"ungroup", id}
~~~

- Create needs a new ID; the AI cannot create a mesh or supply vertices.
- Update requires at least one change and sets absolute values. Type, ID,
  groupId and vertices cannot be changed directly. Hole is primitive-only.
- Resize sets all dimensions and keeps the center.
- Translate adds delta, components ±100000 mm.
- Rotate adds Euler components, ±36000 degrees; each member rotates on its own
  center, with no common group pivot.
- Duplicate copies one object with a new ID and offset ±100000 mm, outside groups.
- Ids is a nonempty list of 1–200 distinct object/group IDs. Groups expand to
  members, with overlapping recipients deduplicated.
- Group creates a new flat group and moves members from previous groups.
  Ungroup preserves members; delete on a group deletes members. Empty groups vanish.
- The state must be valid after each operation: create objects before grouping.
  Objects can be created in an already existing group.

## Subtract: persist real cut vertices

A tool is a primitive with hole:true. Subtract accepts only full objects in ids
and primitive hole tools in toolIds. Both lists are nonempty/distinct; groups can
expand, but must contain objects with the correct roles.
Limit: 8 tools, 32 full/tool pairs, 20000 triangles per resulting piece.

~~~json
{"message":"Scavo il cubo con un foro passante.","operations":[
  {"op":"create","object":{
    "id":"hole-1","type":"cylinder","name":"Drill tool",
    "dimensions":{"radius":10,"height":120},
    "position":[0,0,50],"rotation":[0,0,0],
    "color":"#aab4c4","groupId":null,"hole":true
  }},
  {"op":"subtract","ids":["cube-1"],"toolIds":["hole-1"]}
]}
~~~

The motor calculates geometry locally: cube-1 becomes a mesh retaining its ID,
name, color, group and orientation; hole-1 is consumed. Groups do not limit this
explicit operation. Closed mesh solids imported from JSON/STL are valid targets.
Original tool/target roles, invalid references and no-material-removal cuts reject
the whole batch. Every target must lose material. Fully consumed solids are removed.

The output vertices are centered and position adjusted so remaining material stays
in place. Cuts persist in JSON/STL without tools. Undo restores the original state.
For car arches, include all overlapping body/fender panels, not just fenders;
exclude wheels. Existing correctly placed tools can be reused.

## Editable holes

Without subtract, hole:true tools cut full objects with identical groupId,
including closed imported JSON/STL meshes. Null affects only ungrouped objects.
Other groups remain unchanged. Group a part with its tools to isolate it.

Move/rotate/resize updates the actual cut; hole:false makes the tool full and
deleting it restores material. Tools are invisible even when selected, editable
from the object panel and excluded from STL. JSON retains original geometry/tools.

Maximum 8 tools, 32 relevant full/tool pairs including meshes, and 20000 result
triangles per piece. Planar or zero-volume meshes cannot be cut; a nonintersecting
tool leaves a planar surface unchanged. Closed topology is required for correct
results but is not exhaustively checked.

## Mesh vertices in saved JSON

Mesh objects require a flat vertices array:
[ax,ay,az,bx,by,bz,cx,cy,cz,...], nine finite numbers per triangle, 1–20000 triangles.
Local coordinates are within ±10000 mm and base extents ≤10000 mm on at least two
nonzero axes. The bounding box is centered: abs(min+max) ≤0.01 mm per axis.

~~~json
{
  "id":"stl-1","type":"mesh","name":"Triangle",
  "dimensions":{"x":10,"y":10,"z":0},"position":[5,5,0],
  "rotation":[0,0,0],"color":"#91bff1","groupId":null,
  "vertices":[-5,-5,0,5,-5,0,-5,5,0]
}
~~~

Rendering scales base vertices relative to their extents. Import preserves world
coordinates by storing the original bounding-box center in position.
The archived PHP backend does not support mesh/hole/subtract extensions.

## DeepSeek HTTP contract

Official POST https://api.deepseek.com/chat/completions, Authorization Bearer and
Content-Type application/json. Model is always deepseek-flash. Payload fields:
model, messages (system, prior user/assistant pairs, current user), response_format:{"type":"json_object"}, max_tokens:8192,
stream:false. No PHP endpoint, application proxy or selectable model.

The final user message is serialized JSON containing command, selectedId and project.
Command is 1–2000 characters; selection is null or an existing object ID.
Mesh context omits vertices and adds triangleCount. This compact context is not
a saveable project. Mesh vertices are never sent.

Previous user messages contain their prompts; assistant context is a JSON summary
{message,applied,objectIds}. It includes explanations/clarifications and stable IDs,
not executable operations or rejected raw output. applied:false means the request
failed with no scene changes. At most 40 whole pairs within 128 KiB UTF-8 are sent,
keeping the most recent pairs. Current project/selection override historical context.
Conversation is session-only and resets when a JSON file or example opens.
See [DeepSeek's multi-round guide](https://api-docs.deepseek.com/guides/multi_round_chat).

The property panel uses the same update schema, with absolute values for name,
color, position, rotation and dimensions. Applica creates a single atomic, undoable
batch locally, without calling DeepSeek. It cannot change IDs/type/groups/vertices.

A complete choices[0].finish_reason:"stop" and string message.content are required.
The raw content reaches the chat before validation; invalid/truncated content is
kept as safe text, with no changes applied. The explanation is displayed only
after successful execution. Forty exchanges remain in the current session.

Timeout: 60 seconds. Streamed response maximum: 512 KiB. Redirects/retries are
disabled. Provider errors become bounded local messages; private body details and
keys are not exposed. The browser must receive a CORS permission from DeepSeek.

The account uses official GET https://api.deepseek.com/user/balance, with the same
Authorization-only key handling, ten-second timeout and bounded JSON validation.
Key storage/removal and credit are separate from CAD state and exported files.
