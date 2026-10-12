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
| js/diagnostics.js | Bounded, redacted session events and downloadable diagnostics |
| js/properties.js | Selected-object form, typed changes and inline errors |
| js/layout.js | Chat separator, pointer capture, keyboard and adaptive bounds |
| js/renderer.js | Three.js scene, Z-up camera, selection and stable-ID meshes |
| js/geometry.js | Base shapes and shared evaluated geometry builder |
| js/profiles.js, js/deform.js | Validated profiles, sampling and ordered transformations |
| js/boolean.js | Local CSG subtraction, baked meshes and cache signatures |
| js/state.js | Forty independent undo/redo snapshots |
| js/files.js | Validated JSON, size checks and local downloads |
| js/import.js, js/export.js | ASCII/binary STL import and evaluated STL export |
| examples/, vendor/ | Starter models, pinned dependencies and licenses |
| scripts/serve.mjs | Loopback-only static server |
| scripts/diagnostics-server.mjs, js/local-diagnostics.js | Optional private local diagnostic snapshots |
| tests/ | Node tests without PHP or paid API calls |

The first paths are relative to public/.

## Command flow

The browser sends recent conversation pairs, the command, selectedId and compact project to the official
HTTPS API using the fixed deepseek-flash model and JSON response mode.
thinking.type is explicitly disabled. The documented provider default enables
thinking at high effort, which can spend time/output budget before the final JSON;
the application previously inherited that default despite its 60-second deadline.
Mesh vertices are omitted and triangleCount added. The key occurs only in the
Authorization header, never in the prompt, snapshots or exported files.

The response is untrusted. parseEnvelope requires a complete stop response, JSON
with exact message/operations fields, a bounded explanation and allowed operations.
applyOperations works on a copy and validates schemas, references and resource bounds
after each operation. Editable-hole pair limits are checked on the completed batch,
so temporary tools can be linked/consumed by subtract or isolated by grouping before preview.
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
Before HTTP serialization the API converts these summaries into labeled plain text
containing the prior explanation, result and IDs. Sending their internal JSON as an
assistant response had primed the model to output applied/objectIds rather than
operations. Explicit valid command examples reinforce the actual output format;
clear modeling requests use reasonable defaults rather than asking for routine
confirmation. Metadata-shaped replies remain invalid and receive a specific error.
Failed turns record applied:false with a safe error, never rejected raw JSON or
unexecuted operations. In-flight turns are excluded. The API accepts only alternating
user/assistant pairs (at most forty), trimming older whole pairs to a 128 KiB UTF-8
budget. Conversation summaries omit operations/vertices; they are historical context,
not commands. Current compact state and selection are sent last and are authoritative
after manual edits, undo/redo or imports. Chat memory is not saved to files/storage.
Pending chat replies show three animated dots with an accessible status label;
completion/failure hides the indicator and shows the reply. Reduced-motion users
receive a static indicator. Enter submits the prompt, Shift+Enter keeps a newline,
and composition/IME events do not submit. The busy guard prevents duplicate sends.

The client has a 60-second timeout and 512 KiB streamed-response limit, with no
redirects or automatic retries. Provider bodies are not exposed as error details.
The API must permit CORS; static hosting cannot bypass a provider restriction.

The API emits diagnostic events for settings, HTTP status, response usage/finish
reason, validation and errors, without headers or reasoning text. App integration
adds the compact source scene, prompt, bounded output and geometry/application phases.
Diagnostics removes sensitive field names, the current key and recognizable key/
Bearer strings before storing or displaying entries. It retains at most 100 events
and 256 KiB of compact JSON; records above 64 KiB become marked bounded previews.
There is no remote upload or paid retry. The expandable chat panel
renders textContent and supports explicit download/clear. Startup/WebGL/runtime errors
are recorded after app module loading; a failed initial module import cannot be
captured by that module. Operation wrappers add index/target; geometry preparation
adds object identity. Error classification only treats network/body TypeErrors as
connection failures, preserving local validation/UI errors for diagnosis.

An optional Node collector listens only on 127.0.0.1:8001. Only pages served from
HTTP loopback origins send redacted snapshots, with a two-second timeout and no
CAD dependency on delivery. The collector accepts POST/OPTIONS on one fixed route,
limits bodies to 768 KiB, checks snapshot fields and redacts again. Serialized atomic
writes store latest.json and last-failure.json under ignored .local/logs/, outside
public, with private filesystem permissions. Startup does not erase the last failure;
clearing an empty log removes it. Remote origins, reads and arbitrary paths are
rejected. GitHub Pages never contacts this service. Start it with npm run logs.

## Selected-object editing

PropertyEditor creates labeled fields for name/color, center XYZ, relative world
rotation increments and the dimensions of the selected type. Rotation fields start
at zero and reset after application; they use project.js rotateAngles to calculate
the resulting absolute Euler XYZ pose for one update. Planar mesh axes are disabled. The form reads
finite numbers and emits one update operation containing only changed fields;
unchanged submissions create no snapshot. IDs/type/groups/vertices are not editable.
app.js uses applyOperations and the same prepare/commit path as AI commands, so
validation and geometry failures remain atomic and updates are undoable. Inline
errors preserve the entered values. Selection, undo and imports rebuild the form
from current state; the fieldset is disabled while asynchronous work is in progress.

## State, coordinates and meshes

Version 1 has box/sphere/cylinder/cone/torus/extrude/lathe objects and mesh objects
from STL, saved JSON or local subtraction. Legacy projects remain valid. Units are mm.
Coordinates are right-handed with Z vertical; position is the object's center and
rotation stores absolute intrinsic Euler XYZ in degrees. Cylinder/cone axes are Z
before rotation. Existing JSON poses and explicit update.rotation retain this meaning.

Mesh vertices are centered local triangle positions; dimensions scales relative
to their original extents. Import recenters vertices and preserves the world center.
Zero dimensions are allowed only on originally planar axes. The AI cannot supply
vertices or create meshes directly. Nonparametric meshes support transformations,
name/color, duplication, grouping, deletion and further cuts.

Groups are flat; every object belongs to zero or one group. Group targets expand
to members with duplicates removed. Relative rotations compose quaternions around
fixed world axes, applying X then Y then Z, and convert the final orientation back
to bounded Euler XYZ for storage. Adding Euler components was incorrect for already
tilted objects. At Y=±90°, direct intrinsic Euler X/Z controls also share an axis
(gimbal lock); the panel now exposes independent world-axis increments instead.
Both paths use the same validated rotateAngles helper. Equivalent stored Euler
values may change together; existing files are not reinterpreted or migrated.
Each member rotates around its own center; there is no shared assembly pivot.

Meshes remain in a Three.js Map by ID. Changed geometry is replaced and disposed;
simple edits preserve geometry. Cache signatures include vertices, profiles,
modifiers and applicable tools plus their relative transforms. Raycasts ignore
invisible tools and helpers.
ResizeObserver updates the canvas when its viewport changes.

## Profiles and deformations

profiles.js validates 2D reference points without accepting executable code or
AI-generated mesh vertices. Extrusions accept simple concave contours with 3–64
points; nonadjacent edge intersections and degenerate profiles are rejected.
Three.js triangulates the closed outline, extrudes along Z, centers it and scales
it to dimensions. Revolution accepts 2–64 ordered [radius,Z] points, nonnegative
radii with positive interior radii, and closes both ends on the axis. It uses 64
radial segments, scales radius/height and aligns the lathe axis to Z.
Tori use 24 tube segments and 64 radial segments.

deform.js validates up to six ordered twist/bend/taper modifiers on any object type.
geometryFor builds the undeformed source, then applies those modifiers before CSG.
Each stage uses its current bounding box and the specified local axis. The source
object's dimensions/profile/vertices remain unchanged. Clearing modifiers restores
that source; baking a subtraction stores the evaluated vertices and removes the
profile/modifiers to avoid applying them twice.

Triangles are clipped against shared axis slabs and retriangulated before nonlinear
transformation. Twist also uses four transverse slabs per nonzero cross-section
axis; its axial sampling is at most 3.75° per step, bend at most 7.5°, taper eight
steps. Interpolated normals are transformed by the inverse Jacobian and normalized.
This makes sparse box/STL surfaces curve rather than merely moving their corners.
Each intermediate subdivision is capped at 20000 triangles; deformed coordinates
and extents are bounded to 10000 mm. Tight bends are rejected before inversion.
These are sampled surface transformations, with no guarantee against compound
self-intersections and no NURBS, loft or geometric constraint solver.

The property form exposes profile coordinates and existing modifier axes/parameters.
It uses the same atomic update path and preserves invalid drafts. Adding/removing
modifier stages or changing the point count is handled by chat JSON operations.
Tool signatures include their own profile/modifiers, so changed deformed holes also
invalidate affected solids. View, export and subtraction share the same builder.

## Subtraction

subtract accepts explicit full-object ids and primitive hole toolIds. project.js
validates references, roles and pair limits, then calls carveObject. boolean.js
transforms tools into target-local coordinates and subtracts polygons using the
pinned MIT THREE-CSGMesh BSP core. External bounding boxes and degenerate input
triangles are skipped. Results exceeding 20000 triangles or containing nonfinite
values are rejected.

By default, the source solids and tools stay in project.objects. Subtract records
targetIds on tools, containing expanded full-object IDs and merging existing explicit
links. Groups do not constrain these links. The source geometry is never baked, so
tool edits can restore material at the old position and cut the new position.
View/export use evaluatedGeometry to derive actual CSG surfaces from originals.
Only bake:true replaces targets with centered meshes, adjusts their world centers,
consumes tools and removes fully consumed solids. It must include all explicitly
linked targets of those tools. All initial targets must lose material;
volume reduction must exceed max(1e-9 mm³, original volume × 1e-8).
An error leaves the source state and tools unchanged. JSON/STL persist the result.

Editable hole tools use the optional primitive-only hole boolean. They cut all
full objects in optional targetIds, including **closed meshes imported from JSON
or STL**. Without targetIds they use identical groupId for old/manual tools.
Null then affects only ungrouped objects; other groups are isolated.
Tools remain invisible but selectable in the object panel. Moving, rotating,
resizing, toggling or deleting a tool recalculates/restores the material.
Original geometry and tools are saved, not preview CSG triangles.
Target lists are validated as unique existing full-object IDs. Create/update from
the AI cannot supply targetIds; subtract maintains them locally. Deleting a target
prunes its links but preserves an explicit empty list, preventing fallback cuts on
unrelated grouped objects. Toggling a tool to full retains its inactive links.
The pair limit counts explicit links or applicable legacy group members.
Old baked meshes/STL contain no reconstructible editing history for their old cuts.

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
Nuovo prepares an empty scene and resets history, chat/context, selection, prompt
and camera. Existing scene/chat/draft/undo data require confirmation; cancellation
changes nothing. A busy request/load blocks it. Account storage and credit stay intact.

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
