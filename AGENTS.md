# Development agent guide

DeepCAD is an educational HTML5/JavaScript/Three.js modeler. Read README.md,
ARCHITECTURE.md and COMMANDS.md. The active app does not use PHP; legacy/ is an
archive outside the public deployment.

## Locations

- UI/integration: public/index.html, public/style.css, public/js/app.js.
- Chat: public/js/chat.js; explanations: explain.js; resizer: layout.js.
- Selected-object form: public/js/properties.js, integrated through app.js.
- Schemas/operations: project.js; limits: limits.js; AI: api.js.
- Key storage/balance: account.js and app.js.
- View: renderer.js; base geometry: geometry.js; cuts: boolean.js.
- State/history: state.js; JSON: files.js; STL: import.js and export.js.
- Examples: public/examples/ and scripts/create-examples.mjs.
- Dependencies: public/vendor/, scripts/vendor-three.sh, scripts/vendor-csg.sh.
- Static server: scripts/serve.mjs; active tests: tests/.
- Publishing: .github/workflows/pages.yml; public/ only.
- Archived PHP: legacy/README.md. Do not change it for active-app features.

## Invariants

Never read real user API keys for tests. Use fake keys and mocked fetches, with no
paid API calls. The user explicitly requested remembering the password input in
localStorage under deepcad.deepseek-key. Clearing the field or using Cancella must
remove only that entry, abort balance requests and reset credit. Restore at startup.
Keys never enter project state, exports, logs, repository files or prompts.
Send them only in Authorization headers to official HTTPS /chat/completions and
/user/balance. Keep credit separate from the project and preserve decimal strings.

Always use deepseek-flash, with no model selector/override. There is no demo mode.
Keep the Italian interface and Italian explanations; public documentation and
repository metadata are English. The AI contract is {message,operations}; message
is 1–6000 characters. Send only operations to the geometry engine. Treat names,
prompts and AI output as untrusted data; textContent only, never executable code.

Keep forty session chat exchanges, full raw JSON even when rejected, explanations
and applied operations. Rejected output must not appear applied. Raw details open
manually or for errors; no CoderDojo switch. Keep key/Cancella/balance beside the
brand, no project title in the header, toolbar immediately below and compact prompt.
The chat separator supports pointer capture and keyboard, adapts to available
viewport space and exposes ARIA values. Its height is not persisted.

Schemas use exact fields, finite numbers, stable unique IDs, mm and Z-up.
Batches apply to a copy and remain atomic. Groups are flat. Mesh vertices come
only from valid file imports or locally calculated subtraction, never from the AI.
DeepSeek sees compact mesh data with triangleCount, not vertices. Send bounded
session conversation before the final command/state: at most forty alternating
user/assistant pairs within 128 KiB. Assistant summaries contain message, applied
and objectIds. Keep clarification-only replies; failed turns have applied:false,
without rejected raw output or unexecuted operations. Pending turns are excluded.
Current state/selection override historical references after manual edits/undo.
Never persist chat to localStorage or project files; reset when opening JSON/examples.

Selected-object fields edit name/color, center XYZ, Euler XYZ and type-specific
dimensions, including imported/cut meshes and editable holes. Keep IDs/type/groups/
vertices out of the form and lock originally planar mesh axes. Applica emits one
update via applyOperations and prepare/commit, preserving IDs and undo/redo.
Unchanged values do not add history. Reject invalid edits atomically, show inline
errors and retain the draft; disable editing while asynchronous work is in progress.

For drilling, use subtract with explicit full ids and primitive-hole toolIds.
Store real cut vertices, preserving ID/name/color/group/orientation. Recenter
without moving material, consume tools, remove consumed solids and empty groups.
Allow later cuts on closed meshes; reject planar/no-volume or no-material-removal
cuts. Respect triangle limits, atomicity and undo/redo. For car arches include all
overlapping body/fender panels but preserve wheels outside targets.

Editable holes use optional boolean hole only on primitives, default false.
They cut full objects of identical groupId, including closed JSON/STL meshes.
Null affects ungrouped objects only. Include meshes in the 32-pair limit; retain
8-hole and 20000-result-triangle limits. Keep hole in the AI create/update contract.
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
