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

Shown fields are required. Extrude/lathe additionally require profile. All types
may have optional modifiers, default []. Primitive objects may also have boolean hole, default
false, and engine-managed targetIds. Meshes have required vertices instead;
hole/targetIds are not allowed on a mesh. TargetIds is a list of 0–200 distinct
existing full-object IDs, not groups. It is stored by subtract and cannot be supplied
in AI create/update. An empty list means no targets, with no group fallback.
Objects and groups are arrays; every group is {id,name} with at least one member.

Object/group IDs are unique across the project: 1–64 characters, first ASCII
letter, then ASCII letters/digits/_/-. Object/group names are nonblank, 1–80
characters; project names 1–100; no control characters.
Maximum 200 objects, 200 groups and 8 MiB per project. AI responses: 512 KiB.

Coordinates are right-handed, X/Y horizontal and Z vertical; 1 unit = 1 mm.
Position is the center, three finite numbers within ±100000 mm.
Rotation stores absolute intrinsic Euler XYZ in degrees, each within ±36000.
It is not a vector of independent world-axis turns. Positive angles follow the
right-hand rule: +X 90° maps local +Z to world −Y; +Y 90° maps +Z to +X.
At Y=±90° this Euler representation has gimbal lock: X/Z are not independent.
Use relative rotate for independent turns on fixed world axes. Equivalent Euler
values may change together after quaternion composition; saved old poses stay valid.
Unrotated cylinders/cones align with Z; the cone tip is +Z.
Color is #RRGGBB. GroupId is null or an existing group ID.
Numeric strings, booleans, null and nonfinite values are not numbers.

| type | exact dimensions fields |
| --- | --- |
| box | {"x":100,"y":80,"z":60}; equal dimensions make a cube |
| sphere | {"radius":40} |
| cylinder, cone | {"radius":30,"height":60} |
| torus | {"radius":40,"tube":10}; ring radius and tube radius |
| extrude | {"x":40,"y":30,"z":20}; scaled outline and extrusion depth |
| lathe | {"radius":40,"height":100}; maximum radius and axial height |
| mesh | {"x":100,"y":80,"z":60}; bounding-box extents |

Primitive dimensions: 0.1–10000 mm. Mesh dimensions: 0–10000 mm; zero is allowed
only on an axis whose base vertices have zero extent.
Torus requires tube < radius and radius + tube ≤5000 mm. Lathe radius ≤5000 mm.
The torus lies in local XY; extrusion/revolution axes are local Z before rotation.
Position is the base reference center; deformation can shift the resulting bounds.

## Reference profiles

Only extrude/lathe objects may contain profile. Every point is two finite numbers
within ±10000 mm, with each reference extent ≤10000 mm. Repeated consecutive points
and zero-height profiles are rejected. Coordinates are reference data: dimensions
set the final undeformed extents, independently of these reference magnitudes.

- Extrude: 3–64 [x,y] points around a simple, nonzero-area contour, concave or convex.
  Nonadjacent edges must not cross/touch. The last point may repeat the first; an
  omitted closing point is added automatically. The outline is centered in XY,
  scaled to dimensions.x/y and extruded symmetrically along Z to dimensions.z.
- Lathe: 2–64 [radius,Z] points in nondecreasing Z order (equal Z allows shoulders).
  Radii are nonnegative, with positive radii at all interior points and a positive
  maximum. At least two distinct Z values are required. The engine closes ends
  to the axis, revolves 360° around Z, centers height, then scales to radius/height.
  This is a closed solid: a hollow vessel needs additional hole tools/subtraction.

~~~json
{"message":"Creo una staffa a L e un solido tornito.","operations":[
  {"op":"create","object":{
    "id":"bracket","type":"extrude","name":"L bracket",
    "dimensions":{"x":40,"y":30,"z":20},
    "profile":[[0,0],[40,0],[40,10],[10,10],[10,30],[0,30]],
    "position":[0,0,10],"rotation":[0,0,0],"color":"#62c7a5","groupId":null
  }},
  {"op":"create","object":{
    "id":"turned","type":"lathe","name":"Turned body",
    "dimensions":{"radius":40,"height":100},
    "profile":[[20,0],[40,50],[10,100]],
    "position":[100,0,50],"rotation":[0,0,0],"color":"#91bff1","groupId":null
  }}
]}
~~~

## Ordered deformations

All types, including imported meshes, accept up to six modifiers. Each has exactly
three fields: type, axis and the required numeric angle or factor.

~~~json
{"op":"deform","id":"bracket","modifiers":[
  {"type":"twist","axis":"z","angle":45},
  {"type":"taper","axis":"z","factor":0.7}
]}
~~~

Axes are exactly x/y/z. Modifiers evaluate in order against each stage's bounds,
in local coordinates before object rotation/translation and before holes.

| type | parameter | behavior |
| --- | --- | --- |
| twist | angle, −720…720° | rotate cross-sections from zero at the negative axis end to angle at the positive end |
| bend | angle, −180…180° | bend the axis into an arc: X toward Y, Y toward Z, Z toward X; negative angle reverses direction |
| taper | factor, 0.05…4 | linearly scale transverse sections from 1 at the negative end to factor at the positive end |

Deform replaces the complete list, not appends; modifiers:[] restores the original
source. Create can include modifiers; update can change the whole list or profile.
IDs and base dimensions/profile/vertices remain unchanged. Dimension edits scale
the source before reevaluating modifiers. JSON retains editing information; STL
contains the transformed mesh. Baked subtraction removes profile/modifiers because
their evaluated effect is already stored in its mesh vertices.

Sparse triangles are subdivided for curved surfaces. Intermediate results are
limited to 20000 triangles; deformed coordinates/extents to 10000 mm. A nonzero
modifier on a zero-extent axis is rejected. Bends whose half-thickness exceeds 95%
of the bend radius are rejected to avoid local inversion. Identity modifiers are
skipped. Complex chains/cuts can exceed the budget; compound self-intersections
are not exhaustively detected. Profiles contain linear segments, not NURBS curves.

## Allowed operations

Fields below are exact and required; question marks denote optional changes.
The object in create must follow the primitive schema.

~~~text
{op:"create", object}
{op:"update", id, changes:{name?,color?,position?,rotation?,dimensions?,hole?,profile?,modifiers?}}
{op:"deform", id, modifiers:[...]}
{op:"resize", id, dimensions}
{op:"translate", ids, delta:[x,y,z]}
{op:"rotate", ids, delta:[x,y,z]}
{op:"duplicate", id, newId, offset:[x,y,z]}
{op:"delete", ids}
{op:"subtract", ids, toolIds, bake?}
{op:"group", id, name, ids}
{op:"ungroup", id}
~~~

- Create needs a new ID; the AI cannot create a mesh or supply vertices.
- Update requires at least one change and sets absolute values. Type, ID,
  groupId and vertices cannot be changed directly. Hole is primitive-only,
  profile is extrude/lathe-only, modifiers can change on any type.
- Resize sets all dimensions and keeps the center.
- Translate adds delta, components ±100000 mm.
- Rotate composes additional turns around fixed world X, then Y, then Z, with
  delta components within ±36000 degrees. The result is stored as an equivalent
  absolute Euler XYZ pose. An existing [90,0,0] cylinder points toward −Y; rotate
  delta:[0,0,90] turns that axis toward +X. This differs from update.rotation:
  [90,0,90], which sets an absolute intrinsic pose and keeps that axis toward −Y.
  Each member rotates on its own center, with no common group pivot or position orbit.
- Duplicate copies one object with a new ID and offset ±100000 mm, outside groups.
- Ids is a nonempty list of 1–200 distinct object/group IDs. Groups expand to
  members, with overlapping recipients deduplicated.
- Group creates a new flat group and moves members from previous groups.
  Ungroup preserves members; delete on a group deletes members. Empty groups vanish.
- Schemas, references and object/tool/size limits must hold after each operation:
  create objects before grouping. Objects can be created in an already existing group.
  Prefer groupId:null for new pieces. A create may name a new group only if a later
  group operation in the same batch explicitly includes that object's ID in ids.
  The engine keeps it ungrouped until group executes; this does not make the group
  available to earlier transformations. Missing declarations/membership remain
  errors, and imported project JSON still requires every groupId to exist.
  The editable-hole pair limit is checked on the completed atomic batch; temporary
  tools may be linked/consumed by subtract or isolated in groups before rendering.

## Subtract: real cuts with editable tools

A tool is a primitive with hole:true. Subtract accepts only full objects in ids
and primitive hole tools in toolIds. Both lists are nonempty/distinct; groups can
expand, but must contain objects with the correct roles.
Limit: 8 tools, 32 full/tool pairs, 20000 triangles per resulting piece.
The pair count is the number of expanded targets times the number of tools for
this subtract operation. Unrelated scene objects do not contribute. Creating tools
with groupId:null earlier in the same batch does not trigger editable preview checks
before they are linked or consumed. Final editable holes still respect their own pair limit.

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

The engine calculates geometry locally: cube-1 keeps its original shape and fields;
hole-1 stays invisible/editable and gains targetIds:["cube-1"]. Groups do not limit
this explicit operation. Closed mesh solids imported from JSON/STL are valid targets.
Original tool/target roles, invalid references and no-material-removal cuts reject
the whole batch. Every initial target must lose material. Fully consumed solids
remain recoverable by moving or deleting tools, though they export no material.

JSON stores original geometry and tools/links for later edits; STL contains the
evaluated cut vertices and no tools. Move/rotate/resize the same hole ID to edit the
opening and restore material at the previous location. Undo restores the prior state.
For car arches, include all overlapping body/fender panels, not just fenders;
exclude wheels. Existing correctly placed tools can be reused.

Optional bake must be a boolean, default false. Only bake:true finalizes a cut:
the output mesh is recentered without moving material; tools are consumed and fully
consumed solids removed. Include all explicitly linked targets of those tools.
Use this only when finalization is explicitly requested. Old baked meshes/STL do
not retain their tool or pre-cut geometry; old openings cannot be moved independently.

## Editable holes

After subtract, hole:true tools cut only explicit targetIds, including closed
imported JSON/STL meshes. Groups stay unchanged. Without targetIds, legacy/manual
tools cut full objects with identical groupId; null affects only ungrouped objects.
Group such tools with their parts to isolate them, or link them with subtract.

Move/rotate/resize updates the actual cut; hole:false makes the tool full and
deleting it restores material. Tools are invisible even when selected, editable
from the object panel and excluded from STL. JSON retains original geometry/tools.
Deleting a target removes its ID from tool lists, retaining empty lists. Setting
hole:false retains the inactive link so enabling the hole again restores the cut.

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
model, thinking:{"type":"disabled"}, messages (system, prior user/assistant pairs, current user), response_format:{"type":"json_object"}, max_tokens:8192,
stream:false. No PHP endpoint, application proxy or selectable model.

The final user message is serialized JSON containing command, selectedId and project.
Command is 1–2000 characters; selection is null or an existing object ID.
Mesh context omits vertices and adds triangleCount. This compact context is not
a saveable project. Mesh vertices are never sent.

Previous user messages contain their prompts. Internal assistant memory uses
{message,applied,objectIds}, converted before sending into labeled plain-text
explanation, historical outcome and involved IDs. It is not sent as a JSON response
template. The reported metadata-shaped 2CV response is rejected; the output must
contain operations, with no applied/objectIds. Explanations/clarifications and stable
IDs persist; executable operations and rejected raw output are omitted. Failed
requests are labeled as errors with no changes. At most 40 whole pairs within 128 KiB UTF-8 are sent,
keeping the most recent pairs. Current project/selection override historical context.
Conversation is session-only and resets when a JSON file or example opens.
See [DeepSeek's multi-round guide](https://api-docs.deepseek.com/guides/multi_round_chat).

The property panel uses the same update schema, with absolute values for name,
color, position and dimensions. Its rotation inputs are additional world-axis
turns (zero-initialized); rotateAngles computes an absolute rotation for the update
and clears those inputs after application. Applica creates a single atomic, undoable
batch locally, without calling DeepSeek. It cannot change IDs/type/groups/vertices.
For profiled objects it also edits reference point coordinates; for modified
objects it edits existing modifier axes/angles/factors. Point/modifier counts
are changed through chat operations. Geometry failures leave the scene unchanged.

A complete choices[0].finish_reason:"stop" and string message.content are required.
Thinking is explicitly disabled; the provider's default is enabled, as documented
in [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/).
finish_reason:"length" and empty content are rejected with distinct errors. Diagnostic
events include finish reason and token usage, but never reasoning_content or headers.
The raw content reaches the chat before validation; invalid/truncated content is
kept as safe text, with no changes applied. The explanation is displayed only
after successful execution. Forty exchanges remain in the current session.

Timeout: 60 seconds. Streamed response maximum: 512 KiB. Redirects/retries are
disabled. Provider errors become bounded local messages; private body details and
keys are not exposed. The browser must receive a CORS permission from DeepSeek.

The account uses official GET https://api.deepseek.com/user/balance, with the same
Authorization-only key handling, ten-second timeout and bounded JSON validation.
Key storage/removal and credit are separate from CAD state and exported files.
