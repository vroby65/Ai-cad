# Development agent guide

AIcad is an educational HTML5/JavaScript/Three.js modeler. Read README.md,
ARCHITECTURE.md and COMMANDS.md. The active app does not use PHP; legacy/ is an
archive outside the public deployment.

## Locations

- UI/integration: public/index.html, public/style.css, public/js/app.js.
- Chat: public/js/chat.js; explanations: explain.js; resizer: layout.js.
- Local diagnostic events/redaction: public/js/diagnostics.js and app.js.
- Optional loopback log collection: public/js/local-diagnostics.js and scripts/diagnostics-server.mjs.
- Selected-object form: public/js/properties.js, integrated through app.js.
- Schemas/operations: project.js; limits: limits.js; AI: api.js.
- Gateway URL/key storage: account.js and app.js.
- View: renderer.js; base geometry: geometry.js; cuts: boolean.js.
- Profiles: profiles.js; sampled deformations: deform.js.
- State/history: state.js; JSON: files.js; STL: import.js and export.js.
- Examples: public/examples/ and scripts/create-examples.mjs.
- Dependencies: public/vendor/, scripts/vendor-three.sh, scripts/vendor-csg.sh.
- Static server: scripts/serve.mjs; active tests: tests/.
- Publishing: .github/workflows/pages.yml; public/ only.
- Archived PHP: legacy/README.md. Do not change it for active-app features.

## Invariants

Never read real user API keys for tests. Use fake keys and mocked fetches, with no
paid API calls. Remember gateway URL and password input separately under
aicad.gateway-url and aicad.api-key. Clear removes only the key, aborts catalog
requests and resets the model display. Leave legacy DeepSeek storage untouched.
Keys never enter project state, exports, logs, repository files or prompts.
Send them only in Authorization headers to the user-configured HTTP(S) gateway,
with credentials/referrers/redirects omitted. Reject credentials/query/fragment
in URLs. Use /v1/models and /v1/responses. Populate the model selector with visible
account models, default to the first, retain the current choice across catalog
refreshes when available and apply selector changes to the next request. Send the
reasoning selector as Responses reasoning.effort with low/medium/high/xhigh/max and
default medium. No demo mode, balance endpoint or fixed DeepSeek model remains.
Use Responses instructions/input and accept the Pi gateway output_text JSON.
Distinguish empty/truncated output, HTTP errors, transport failures and local
schema/geometry failures. Keep the gateway LAN-only; CORS can allow the Pages
origin and loopback development. Do not expose it publicly to fix browser access.
Diagnostics stay in session memory (100 events/256 KiB compact JSON), downloadable
and clearable from the chat. Record phases/timing, compact scene, prompt, bounded
output and failure details. Redact the current key, recognizable key/Bearer strings
and sensitive fields before storing; omit headers, mesh vertices and reasoning
content. No remote uploads or paid retries. On localhost only, the optional Node
collector on 127.0.0.1:8001 writes redacted snapshots to ignored .local/logs/ outside
public. Preserve last-failure.json across startup; explicit clear removes it.
Reject non-loopback origins, arbitrary paths and oversized/malformed snapshots.
Collector failures must not block CAD. npm run logs starts it; Pages never contacts it.
Never commit user logs.
Preserve original errors while adding operation index/target or geometry object ID.
Keep the interface, explanations, example names, model instructions, public
documentation and repository metadata in English. The AI contract is {message,operations}; message
is 1–6000 characters. Send only operations to the geometry engine. Treat names,
prompts and AI output as untrusted data; textContent only, never executable code.

Keep forty session chat exchanges, full raw JSON even when rejected, explanations
and applied operations. Rejected output must not appear applied. Raw details open
manually or for errors; no CoderDojo switch. Keep URL/key/Clear/gateway status beside the
brand, no project title in the header, toolbar immediately below and compact prompt.
The chat separator supports pointer capture and keyboard, adapts to available
viewport space and exposes ARIA values. Its height is not persisted.
Enter sends; Shift+Enter inserts a newline. Ignore composition/IME Enter events
and block duplicate requests while busy. Pending replies show animated dots with
an accessible status, no visible waiting text, and respect reduced-motion settings.
Remove the indicator on both success and error. New clears scene, selection,
chat/context, prompt, undo/redo and view; confirm before discarding scene/chat/draft/
history, and block while busy. Never reset the API key, URL or their storage.

Schemas use exact fields, finite numbers, stable unique IDs, mm and Z-up.
Stored rotation remains absolute intrinsic Euler XYZ in degrees, preserving old
files and explicit update.rotation. Relative rotate must compose quaternions around
fixed world X, then Y, then Z (right-hand rule), never add Euler components. Reuse
the validated rotateAngles helper for the property panel: its rotation inputs are
zero-based increments, reset after Apply. This prevents X/Z control fusion at
Y=±90° gimbal lock. Equivalent stored angles can change together; do not reinterpret
old JSON. Rotation preserves object positions and each object's own pivot; do not
silently introduce an assembly/group pivot.
Batches apply to a copy and remain atomic. Check schemas/references/object/tool/size
bounds after each operation; check editable-hole pairs on the completed batch.
Temporary tools may be linked, consumed or grouped before rendering. Each subtract must
check its actual expanded target/tool pairs before CSG; unrelated solids do not count.
Final projects/imports must still satisfy the editable-hole pair limit.
Groups are flat. In create only, a new groupId can be deferred to a later group
operation in the same batch that explicitly lists that object's ID. Normalize the
temporary assignment to null; assign it when group executes. Do not create groups
early, reorder operations or allow missing group references in saved projects.
Undeclared/malformed groups and attempts to target them before group remain errors.
Mesh vertices come
only from valid file imports or locally calculated subtraction, never from the AI.
The AI sees compact mesh data with triangleCount, not vertices. Send bounded
session conversation before the final command/state: at most forty alternating
user/assistant pairs within 128 KiB. Internal assistant summaries contain message,
applied and objectIds, but convert them to labeled plain text before sending to the
provider. Never expose that internal JSON as an example assistant response: the
reported 2CV failure copied its keys instead of returning operations. Keep explicit
valid response examples and tell the model to act on clear modeling requests with
reasonable dimensions, without unnecessary confirmations. Strictly reject metadata
responses; never pretend missing operations were applied. Keep clarification-only replies; failed turns have applied:false,
without rejected raw output or unexecuted operations. Pending turns are excluded.
Current state/selection override historical references after manual edits/undo.
Never persist chat to localStorage or project files; reset when opening JSON/examples.

Selected-object fields edit name/color, center XYZ, relative world rotation and type-specific
dimensions, including imported/cut meshes and editable holes. Keep IDs/type/groups/
vertices out of the form and lock originally planar mesh axes. Apply emits one
update via applyOperations and prepare/commit, preserving IDs and undo/redo.
Unchanged values do not add history. Reject invalid edits atomically, show inline
errors and retain the draft; disable editing while asynchronous work is in progress.

Allowed generated types also include torus, extrude and lathe. Profiles are bounded
2D reference data, never executable code: simple closed contours for extrusion,
ordered nonnegative radial/Z points for closed revolution. Dimensions scale the
source extents. Keep strict validation in profiles.js and document the contract.
Optional modifiers (maximum six) support twist/bend/taper on primitives, profiled
shapes and imported meshes; deform replaces the whole list, [] restores the source.
Apply them before cuts. Preserve source type/profile/vertices and stable IDs; baked
mesh replacements must remove profile/modifiers to prevent double application.
Cache signatures include target/tool profiles and modifiers. The property editor
exposes point coordinates and existing modifier axes/parameters with undo/redo.
Keep angular/radius/factor bounds and the 20000-triangle/10000-mm deformation limits;
reject foldovers and invalid batches without changing the scene. Normals need the
inverse Jacobian; sparse STL and box surfaces must be subdivided before bending or
twisting. Do not weaken complexity limits or claim NURBS/lofts/precision CAD support.

For drilling, use subtract with explicit full ids and primitive-hole toolIds.
Default to preserving original solids and editable tools. Store expanded targetIds
on tools locally; do not change groups. Only explicit bake:true finalizes meshes,
recentered without moving material, consuming tools and removing consumed solids.
AI must use bake:true only when the user explicitly asks to finalize, including
all explicit targets of those tools. Existing baked meshes have no recoverable
tool/base information: never promise to independently move their old openings.
Allow later cuts on closed meshes; reject planar/no-volume or no-material-removal
cuts. Respect triangle limits, atomicity and undo/redo. For car arches include all
overlapping body/fender panels but preserve wheels outside targets.

Editable holes use optional boolean hole only on primitives, default false.
With targetIds they cut only those full IDs, including closed JSON/STL meshes;
without targetIds, retain legacy identical-group behavior (null = ungrouped only).
Validate unique existing full IDs, including inactive links when hole:false.
Create/update from AI cannot supply targetIds; subtract manages them. Prune links
when targets are deleted, retaining [] to prevent implicit group fallback. Keep
tool IDs stable; changing center/rotation/dimensions must restore the old material.
Include linked targets/legacy meshes in the 32-pair limit; retain
8-hole, 50000 editable-cut-triangle and 20000 saved-mesh limits. Keep hole in the AI create/update contract.
Tools are invisible and not exported, but selectable/editable in the object panel.
Raycasts, selection outlines and fit ignore them. View and export use the same
evaluated geometry. Prepare geometry before committing, dispose failures and
preserve original shapes/tools in JSON and snapshots. Do not claim CAD precision
or guaranteed printability; topology is not exhaustively validated.

File imports must be undoable and invalid files leave the scene unchanged.
Preserve coordinates, units and triangles on STL round trips. Mesh resizing scales
base vertices; planar axes remain planar. Never expose repository roots or legacy/
through static hosting. .env is archived-backend configuration only.

Keep dependency versions/commits and MIT attributions; no CDN/framework/workers.
Make surgical changes. For changed behavior add a failing regression test first,
then fix it and retain relevant tests. Do not refactor unrelated working code.
Update documentation/contracts when behavior changes. Keep verification honest.

## Checks and publishing

~~~bash
npm test
node --check public/js/app.js
git diff --check
npm start
~~~

Node 20.6+ is sufficient; CI uses Node 24 with no npm install. HTTP tests create
and stop their own loopback server. DOM/pointer/API tests are simulated; follow
the manual Firefox checklist and report absent browser/authenticated verification.

Publish only when the user explicitly requests it. Review staged content for keys,
personal data and machine-specific paths before pushing; use English descriptions
and commit messages, main as the default branch, MIT licensing and a GitHub noreply
commit identity. No user projects or local credential files belong in the repo.
Run tests before deploying. Pages publishes public/ plus LICENSE after CI succeeds;
pull requests must never deploy. Keep action commits pinned and permissions scoped.
