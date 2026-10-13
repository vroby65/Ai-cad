# Verification report

## AIcad update — 13 October 2026

- Rebranded the active app as AIcad; UI labels, accessibility text, errors,
  model instructions, operation explanations and starter-project names are English.
- Added separate gateway URL:port and API-key storage. Clearing the key preserves
  the URL and unrelated storage; old DeepSeek keys are not reused.
- Catalog and Responses requests target the selected gateway, with account model
  discovery and the existing atomic CAD validation. No paid requests were made.
- `npm test`: 140 passed. JavaScript syntax checks and `git diff --check` passed.
- DOM tests cover URL retargeting, Clear, Enter/IME behavior, chat, errors and
  geometry; transport tests use fake credentials and mock model responses.
- Pi gateway tests: five passed, including restricted browser origins and
  preflight, plus a bounded 512 KiB request budget for CAD conversation context. Live LAN preflight for the Pages origin returned 204; an untrusted
  origin returned 403. No router, Tor, SSH or firewall settings were changed.
- Browser runtime reported no connected browsers, so visual/WebGL and actual
  browser local-network permission checks remain unverified.
- Gateway OAuth is still pending: real model inference, Plus permissions and
  actual token renewal are not confirmed by the simulated tests.

## Earlier DeepCAD verification notes

Checked on 12 October 2026 using Node.js 24.21.0 on Linux. The active app requires
no PHP. Tests do not use real keys or paid API requests.

## Automated suite

**140 tests passed** with npm test. The suite covers:

- Primitive creation, names/colors, movement, Euler rotation, dimensions, copies,
  grouping, overlapping target deduplication, ungroup and deletion.
- Reported bus batch: twelve create operations name a group declared only by the
  final operation. Three failing regressions preceded the fix. Deferred membership,
  unchanged inputs/IDs, JSON/STL, undo/redo and mocked API interpretation are checked.
  Missing membership/declarations, malformed/duplicate groups, invalid dimensions,
  imported missing references and targeting a group before its creation remain errors.
- Relative rotation regression: an X-tilted cylinder must turn on world Z rather
  than merely adding its Euler Z component. Three failing regressions preceded the
  fix. Quaternion composition, multi-axis order/inverse, stable IDs, JSON/undo/redo,
  actual STL extents and a ray through a jointly rotated solid/hole are checked.
  Existing absolute Euler poses remain unchanged when loading or using update.
- The reported X/Z fusion is covered at Y=90°: property controls apply distinct
  world X/Z increments, reset after Applica and add no history for unchanged zero
  inputs. Equivalent absolute poses are compared through real Three.js quaternions.
- Advanced shapes: torus dimensions/volume/empty central ray, concave extrusion
  volume and scaling, closed radial revolution and analytical frustum volumes.
  Invalid/self-intersecting profiles, field limits and JSON round trips are covered.
- Ordered twist/bend/taper: measured volume, curved extents, finite normals,
  sparse imported STL subdivision, original vertex preservation, reset, undo/redo,
  malformed/folding/budget errors and atomicity. Geometry updates preserve view
  mesh IDs; profiled/deformed holes cut real material and moving them restores it.
  Baking strips evaluated modifiers/profile so they cannot run twice.
- Forme complesse validates, opens and exports/reimports STL, including the vase's
  real cavity. Mock AI can create a profile then deform it using bounded JSON.
  Property controls edit profile coordinates and modifier axes/parameters; simulated
  selects have a read-only type as native selects do. Invalid profiles/folded bends
  retain the original scene, and new explanations do not show object placeholders.
- Exact schemas, bounded objects/operations, finite numbers, stable IDs, invalid
  references, arbitrary-code fields, prototype pollution and atomic batches.
- Forty independent undo/redo snapshots, branch replacement and reset.
- JSON save/open, size limits, mesh persistence and starter projects.
- STL ASCII/binary validation, truncated files, nonfinite coordinates, planar
  dimensions, coordinate preservation, scaling and round trips.
- Real CSG subtraction: measured STL volume, raycast through an empty tunnel,
  blind pockets, cylinder/sphere/cone cuts, multiple tools, transforms, coplanar
  faces, small shapes, group isolation, fully consumed solids and four wheel arches.
- Invisible tools, no selection outline, restored visibility when made full,
  fit excluding tools/empty material and stable Mesh instances.
- Baked subtract results retain IDs/metadata, consume tools and persist without
  helpers in JSON/STL. Side cuts recenter without moving remaining material;
  further mesh cuts and failed/no-effect batches are covered.
- Default subtract preserves base solids and stable-ID tools with explicit target
  links. Moving a tool restores the old material and cuts the new position, verified
  by real raycasts, STL volume and stable view meshes. Resizing, disabling/deleting
  tools, multiple tools and full-removal recovery are covered. Groups/unrelated
  parts stay unchanged; many ungrouped objects do not inflate linked pair counts.
- Closed STL sources keep their original vertices after drilling and retain editable
  holes through JSON, undo/redo and exports. The property form moves/resizes a retained
  tool. Four car arches persist after JSON reopening and individual tool movement,
  preserving wheels. Target references, deletion pruning, empty target lists and
  baked partial-finalization guards are validated. bake:true explicitly covers the
  previous finalized-mesh behavior; mocked AI uses editable cuts by default.
- Temporary tools in a crowded scene can be consumed by subtract or isolated by
  grouping in the same batch, despite exceeding preview pairs at an intermediate
  step. Final editable-hole limits and actual subtract pair limits remain enforced;
  malformed intermediate dimensions remain rejected and inputs stay unchanged.
- Imported JSON containing meshes and editable holes: actual removed volume,
  empty raycast, geometry cache refresh on tool movement and undo/redo.
- Imported STL with editable tools, resizing/rotation, group isolation, mesh pair
  limits and planar-cut errors leaving the scene intact. Distant tools do not
  reject an unrelated planar mesh.
- Mock DeepSeek: official URL/fixed Flash/JSON mode, key only in Authorization,
  compact mesh context, explanations, raw rejected/truncated output, HTTP/network
  errors, timeout and bounded streamed responses.
- Explicit non-thinking Flash requests; distinct truncated/empty responses; HTTP
  400 classification, usage/finish/phase diagnostics and preservation of local
  TypeErrors. Numbered operation/target and geometry object errors are checked.
- Diagnostic redaction of keys/headers/vertices/reasoning, bounded immutable events,
  clear and download. Actual app event handlers with simulated DOM/fetch capture a
  rejected generation without modifying the model, download safe logs, then apply
  the next successful command and preserve the account when logs are cleared.
- Simulated DOM chat: safe text, bubbles, detailed operations, raw JSON, errors,
  forty-turn cap and reset.
- Pending chat animation: three status dots without visible waiting text; success
  and failure hide the indicator. Reduced-motion styling is provided; visual
  animation timing has not been verified in a real browser.
- Actual app event handlers with simulated DOM/account/fetch and a stub WebGL view:
  Enter submits once, Shift+Enter and IME/composition do not submit. Nuovo confirms
  existing work, cancellation preserves it, and acceptance clears model/selection/
  chat/context/draft/undo/redo while keeping the key and unrelated storage. Busy
  requests block resets; the next command receives an empty model/conversation.
- Conversation memory: clarification replies, stable affected IDs, pending-turn
  exclusion, failures marked unapplied, whole recent pairs within a 128 KiB UTF-8
  budget, strict roles and unchanged caller data. Rejected raw JSON is not sent.
- Reported 2CV schema failure: internal memory fields were being sent as assistant
  JSON and appeared in the provider's reply instead of operations. A regression
  reproduces that format collision using simulated provider output; plain-text
  historical summaries retain explanations/IDs/outcomes without that JSON template.
  The malformed metadata reply remains rejected, and valid operation examples are
  included in the system contract. Real provider behavior after this fix is unverified.
- Real loopback diagnostic collector: private redacted disk snapshots, retained
  last failure after startup, explicit clearing, size/schema limits, foreign-origin
  and arbitrary-route/read rejection. Browser delivery is simulated and only
  enabled on loopback hosts; remote pages and offline collectors do not block CAD.
- Selected-object forms: all primitive dimensions, planar mesh axes, names/colors,
  center/rotation/dimensions, invalid values, atomic edits, unchanged submissions,
  busy/selection handling and undo/redo. Real imported STL is resized/exported;
  changing editable-hole dimensions/position changes the measured removed volume.
- A clarification followed by a manual property edit and a short chat reply sends
  the remembered question, current selection and updated dimensions/position;
  mocked AI operations apply to the latest state.
- Simulated account storage/fetch: restore/remove only the app key, blocked storage,
  decimal balance strings, multiple currencies, stale-request cancellation and errors.
- Simulated resize events: pointer capture, foreign pointers, release/cancel, touch,
  right-click ignored, keyboard/Home/End, ARIA and window limits.
- Real static HTTP server: assets/examples, compact header, account controls,
  separator and one-row input; no demo/CoderDojo/project-title controls; private
  paths and POST rejected.

Three.js, STLLoader, STLExporter and the pinned CSG core are real in the geometry
tests. WebGL is not initialized. DOM, pointer capture and fetches are simulated,
not live browser interactions. File formats/data and event wiring are verified;
native file dialogs and downloads have not been clicked by an automated browser.

## Additional checks

- JavaScript syntax and git diff --check pass.
- Replaying the exact bus response from the user's diagnostic log now produces
  twelve objects, one group and an STL with 864 triangles. Recoverable JSON/STL
  copies were saved outside the repository without overwriting user files.
  The aircraft response had successfully applied nine objects but placed its wings
  vertically and its tail along height instead of length. World-position/assembly
  guidance was added to the AI contract; new authenticated generation is unverified.
- Local Apache serves the app and updated modules with HTTP 200 below a project
  subdirectory; the retired PHP API and legacy files are not public.
- An actual user-provided car JSON reproduced a blocked wheel-arch opening:
  tools were grouped with fenders while the full body was ungrouped.
  Explicitly subtracting from body and fenders consumed four tools and preserved
  all four wheels. A ray at the arch met the body 20.33 mm farther inside after the
  cut. Corrected JSON/STL copies were written outside the repository without
  overwriting the original. User files are not included in the publication.
- The reported four-tool create/subtract failure was reproduced by regression tests:
  intermediate preview validation counted 36 unrelated/full-tool pairs, although
  explicit subtract needed only four. With final preview validation, the same batch
  succeeds and preserves wheels/other parts. A synthetic scene using the reported
  body/tool dimensions and coordinates confirmed real removal: the ray at an arch
  reaches Y=-40.65 mm after cutting, versus Y=-70 mm before. JSON/STL exports passed.
- Unauthenticated official chat POST and balance GET CORS preflights succeeded
  for localhost and the intended HTTPS GitHub Pages origin, returning HTTP 200
  and the matching allowed origin/method/headers. These checks verify CORS only,
  not authentication, credit or model interpretation.
- Deepseek-flash is the official fixed model identifier
  ([DeepSeek documentation](https://api-docs.deepseek.com/)).
- Archived PHP checks were previously run after moving it: 66 assertions and five
  HTTP tests passed. They do not describe the active application's runtime.

## GitHub publication and Pages

The public [repository](https://github.com/vroby65/deepcad) uses main, English
documentation and metadata, the MIT license and a GitHub noreply commit identity.
The [first GitHub Actions run](https://github.com/vroby65/deepcad/actions/runs/38132815691)
passed all 71 tests, JavaScript syntax checks and the Pages deployment.

At initial publication, the live app at [GitHub Pages](https://vroby65.github.io/deepcad/)
returned HTTP 200. Its landing page and all 28 public assets matched the local files
by SHA-256, and the deployed project license matched LICENSE. Six private/source paths, including
.env, legacy/api.php, legacy/README.md, AGENTS.md, package.json and this report,
returned HTTP 404 on Pages. The deployment contains the public directory and license;
archived PHP and user project files are excluded.

## Remaining verification

The user provided a failed 2CV reply with message/applied/objectIds and no operations.
It matches the internal chat-memory schema formerly sent as assistant JSON. The
same schema rejection was reproduced, and the outgoing history was changed to
plain text with strict valid command examples. A separate pasted diagnostic snapshot
contained startup only, so it did not preserve those earlier failed attempts.
The optional loopback collector now makes subsequent redacted logs readable from
disk and retains the last failure across page reloads. No authenticated post-fix
DeepSeek request was performed, so generated-model quality remains unverified.
Fresh unauthenticated CORS preflights for localhost and Pages returned HTTP 200 with
matching allowed origins, POST and authorization/content-type headers.

The integrated browser returned “No browser is available”; connected browser
discovery was empty. Real Firefox/WebGL, layout, selection, touch/pointer capture,
native file dialogs, downloads and API-key controls still need manual verification.
There are no screenshots or claims of verified graphical compatibility.

No authenticated DeepSeek request or real balance read was performed. Mock fetches
and CORS checks cannot replace this. No STL was printed or validated in an external
slicer; volume/raycast checks do not guarantee manifold topology or printability.
