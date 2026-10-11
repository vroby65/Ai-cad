# Verification report

Checked on 11 October 2026 using Node.js 24.21.0 on Linux. The active app requires
no PHP. Tests do not use real keys or paid API requests.

## Automated suite

**71 tests passed** with npm test. The suite covers:

- Primitive creation, names/colors, movement, Euler rotation, dimensions, copies,
  grouping, overlapping target deduplication, ungroup and deletion.
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
- Imported JSON containing meshes and editable holes: actual removed volume,
  empty raycast, geometry cache refresh on tool movement and undo/redo.
- Imported STL with editable tools, resizing/rotation, group isolation, mesh pair
  limits and planar-cut errors leaving the scene intact. Distant tools do not
  reject an unrelated planar mesh.
- Mock DeepSeek: official URL/fixed Flash/JSON mode, key only in Authorization,
  compact mesh context, explanations, raw rejected/truncated output, HTTP/network
  errors, timeout and bounded streamed responses.
- Simulated DOM chat: safe text, bubbles, detailed operations, raw JSON, errors,
  forty-turn cap and reset.
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
- Local Apache serves the app and updated modules with HTTP 200 below a project
  subdirectory; the retired PHP API and legacy files are not public.
- An actual user-provided car JSON reproduced a blocked wheel-arch opening:
  tools were grouped with fenders while the full body was ungrouped.
  Explicitly subtracting from body and fenders consumed four tools and preserved
  all four wheels. A ray at the arch met the body 20.33 mm farther inside after the
  cut. Corrected JSON/STL copies were written outside the repository without
  overwriting the original. User files are not included in the publication.
- Unauthenticated official chat POST and balance GET CORS preflights succeeded
  for localhost and the intended HTTPS GitHub Pages origin, returning HTTP 200
  and the matching allowed origin/method/headers. These checks verify CORS only,
  not authentication, credit or model interpretation.
- Deepseek-flash is the official fixed model identifier
  ([DeepSeek documentation](https://api-docs.deepseek.com/)).
- Archived PHP checks were previously run after moving it: 66 assertions and five
  HTTP tests passed. They do not describe the active application's runtime.

## Remaining verification

The integrated browser returned “No browser is available”; connected browser
discovery was empty. Real Firefox/WebGL, layout, selection, touch/pointer capture,
native file dialogs, downloads and API-key controls still need manual verification.
There are no screenshots or claims of verified graphical compatibility.

No authenticated DeepSeek request or real balance read was performed. Mock fetches
and CORS checks cannot replace this. No STL was printed or validated in an external
slicer; volume/raycast checks do not guarantee manifold topology or printability.

GitHub Actions and the public Pages URL must be checked after an authenticated
publication. Local configuration alone does not establish a successful deployment.
