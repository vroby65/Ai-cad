# DeepCAD architecture

The active HTML5/ES-module app lives in public/ and needs only a browser and HTTP
static hosting. The archived PHP backend is not called or deployed.

## Modules

| Module | Responsibility |
| --- | --- |
| index.html, style.css, js/app.js | UI, account, scene, chat and events |
| js/project.js, js/limits.js | Strict schemas, bounds and atomic operations |
| js/api.js | Official DeepSeek client, system contract and response parsing |
| js/account.js | Remember/delete key, fetch and validate balance |
| js/chat.js, js/explain.js | Safe text bubbles, session conversation, applied operations |
| js/properties.js | Selected-object form, typed changes and inline errors |
| js/layout.js | Chat separator, pointer capture, keyboard and adaptive bounds |
| js/renderer.js | Three.js scene, Z-up camera, selection and stable-ID meshes |
| js/geometry.js | Primitive and imported mesh base geometries |
| js/boolean.js | Local CSG subtraction, baked meshes and cache signatures |
| js/state.js | Forty independent undo/redo snapshots |
| js/files.js | Validated JSON, size checks and local downloads |
| js/import.js, js/export.js | ASCII/binary STL import and evaluated STL export |
| examples/, vendor/ | Starter models, pinned dependencies and licenses |
| scripts/serve.mjs | Loopback-only static server |
| tests/ | Node tests without PHP or paid API calls |

The first paths are relative to public/.

## Command flow

The browser sends recent conversation pairs, the command, selectedId and compact project to the official
HTTPS API using the fixed deepseek-flash model and JSON response mode.
Mesh vertices are omitted and triangleCount added. The key occurs only in the
Authorization header, never in the prompt, snapshots or exported files.

The response is untrusted. parseEnvelope requires a complete stop response, JSON
with exact message/operations fields, a bounded explanation and allowed operations.
applyOperations works on a copy and validates schemas, references and resource bounds
after each operation. Editable-hole pair limits are checked on the completed batch,
so temporary tools can be consumed by subtract or isolated by grouping before preview.
Each subtract independently checks its actual target/tool pair count before CSG.
Errors reject the whole batch. Only a prepared, valid result is committed.

message.content is exposed to the chat before schema validation, so malformed or
truncated output stays readable. textContent renders all untrusted data.
Applied explanations are shown only after successful validation and commit.
No eval, generated code, PHP endpoint or database is involved.

The chat retains forty exchanges in the DOM and resets when a project opens.
Raw JSON details open manually, or automatically for errors. There is no CoderDojo
selector. Completed turns retain the user prompt and a compact assistant summary
with message, applied and affected objectIds, including clarification-only replies.
Failed turns record applied:false with a safe error, never rejected raw JSON or
unexecuted operations. In-flight turns are excluded. The API accepts only alternating
user/assistant pairs (at most forty), trimming older whole pairs to a 128 KiB UTF-8
budget. Conversation summaries omit operations/vertices; they are historical context,
not commands. Current compact state and selection are sent last and are authoritative
after manual edits, undo/redo or imports. Chat memory is not saved to files/storage.

The client has a 60-second timeout and 512 KiB streamed-response limit, with no
redirects or automatic retries. Provider bodies are not exposed as error details.
The API must permit CORS; static hosting cannot bypass a provider restriction.

## Selected-object editing

PropertyEditor creates labeled fields for name/color, center XYZ, Euler XYZ and the
dimensions of the selected type. Planar mesh axes are disabled. The form reads
finite numbers and emits one update operation containing only changed fields;
unchanged submissions create no snapshot. IDs/type/groups/vertices are not editable.
app.js uses applyOperations and the same prepare/commit path as AI commands, so
validation and geometry failures remain atomic and updates are undoable. Inline
errors preserve the entered values. Selection, undo and imports rebuild the form
from current state; the fieldset is disabled while asynchronous work is in progress.

## State, coordinates and meshes

Version 1 has box/sphere/cylinder/cone objects and mesh objects from STL, saved JSON
or local subtraction. Legacy primitive projects remain valid. Units are mm.
Coordinates are right-handed with Z vertical; position is the object's center and
rotation is local Euler XYZ in degrees. Cylinder/cone axes are Z before rotation.

Mesh vertices are centered local triangle positions; dimensions scales relative
to their original extents. Import recenters vertices and preserves the world center.
Zero dimensions are allowed only on originally planar axes. The AI cannot supply
vertices or create meshes directly. Nonparametric meshes support transformations,
name/color, duplication, grouping, deletion and further cuts.

Groups are flat; every object belongs to zero or one group. Group targets expand
to members with duplicates removed. Rotation adds Euler components around each
member's own center; there is no shared assembly pivot.

Meshes remain in a Three.js Map by ID. Changed geometry is replaced and disposed;
simple edits preserve geometry. Cache signatures include vertices and applicable
tools plus their relative transforms. Raycasts ignore invisible tools and helpers.
ResizeObserver updates the canvas when its viewport changes.

## Subtraction

subtract accepts explicit full-object ids and primitive hole toolIds. project.js
validates references, roles and pair limits, then calls carveObject. boolean.js
transforms tools into target-local coordinates and subtracts polygons using the
pinned MIT THREE-CSGMesh BSP core. External bounding boxes and degenerate input
triangles are skipped. Results exceeding 20000 triangles or containing nonfinite
values are rejected.

The result is stored as a centered mesh with the same ID, name, color, group and
orientation. Its world center is adjusted so remaining material does not move.
Tools are consumed; fully consumed solids are removed; empty groups are pruned.
Groups do not constrain explicit subtraction. All targets must lose material;
volume reduction must exceed max(1e-9 mm³, original volume × 1e-8).
An error leaves the source state and tools unchanged. JSON/STL persist the result.

Editable hole tools use the optional primitive-only hole boolean. They cut all
full objects with identical groupId, including **closed meshes imported from JSON
or STL**. Null affects only ungrouped objects; other groups are isolated.
Tools remain invisible but selectable in the object panel. Moving, rotating,
resizing, toggling or deleting a tool recalculates/restores the material.
Original geometry and tools are saved, not preview CSG triangles.

For car wheel arches, every overlapping full panel must be cut. A fender opening
can be blocked by an untouched body in a different group. Explicit subtraction
should target body and fenders together, keeping wheels outside the target list.

Limits are 8 tools and 32 relevant full/tool pairs, including meshes. Planar/zero-
volume mesh cutting is rejected when a tool intersects; a distant tool leaves it
unchanged. Input topology is not exhaustively validated. The BSP core does not
guarantee manifold output, printability or mechanical precision, and does not fuse
separate full objects.

CadView.prepare computes changed geometries before mutating scene or history,
disposing prepared results on failure. Export evaluates the same geometry as the
view, skips tools and fully consumed solids, and refuses a material-free export.

## Files and history

JSON is limited to 8 MiB, with exact field/type/reference validation. STL is limited
to 10 MiB and 20000 triangles. Binary lengths and ASCII facets are prevalidated
before STLLoader runs; nonfinite/out-of-range coordinates are rejected.
Files are local browser downloads/uploads; no client filename becomes a server path.
Imports are atomic and undoable. Opening JSON starts new project history.
Forty cloned snapshots retain undo/redo; a new edit discards the redo branch.

## Account and layout

The key is stored only in localStorage under deepcad.deepseek-key, per origin.
Blocked storage does not break the app. Cancella removes only this entry, aborts
pending balance requests and resets the display. It never clears unrelated storage.

The balance client uses official GET /user/balance, Authorization only, a ten-second
timeout and 512 KiB maximum response. Decimal strings retain precision; currencies
are not added together. Refresh happens at startup, after commands and after a
600 ms key-input debounce. Abort and version checks prevent stale display updates.

The compact header contains brand, key, Cancella and balance; toolbar follows.
Narrow screens wrap the account onto another line. The title remains in model/file
data without a header element. Chat uses a --chat-height flex panel, scrolling
messages and a 38 px prompt. Pointer capture and Up/Down/Home/End resize the chat;
ResizeObserver adapts limits and ARIA values. Height is not persisted.

## Deployment and future work

The optional Node server serves only public/ on loopback. Static Pages deployment
tests first, uploads public/ with the project license and excludes legacy/, .env,
tests and project sources. Actions are pinned; no build-time API secret exists.
Relative paths work under repository subdirectories.

Replace the AI adapter or geometric core through their narrow boundaries when
adding local models or a true CAD kernel. Boolean union/intersection, constraints,
fillets, dimensions, STEP and assembly pivots remain future work.
