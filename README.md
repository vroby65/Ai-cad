# AIcad

A conversational 3D modeling lab built with HTML5, JavaScript, Three.js and the
a user-configured AI Responses gateway. Describe a shape, inspect the model and export STL.
Designed for learning geometry, programming and AI, including CoderDojo activities.

[Open AIcad](https://vroby65.github.io/deepcad/) ·
[Command format](COMMANDS.md) · [Architecture](ARCHITECTURE.md) ·
[Verification report](docs/VERIFICATION.md)

The active application runs entirely in the browser. No PHP, Python, database,
framework, CDN or npm installation is needed. The interface and AI explanations
are in English, as is the repository documentation.
This is an educational mesh modeler, not a precision mechanical CAD system.

## Run locally

Use Firefox with WebGL and Node.js 20.6+; CI uses Node 24. On Linux Mint, working
graphics drivers and WebGL are needed. An existing PHP 8.x installation can also
serve the static files, without PHP extensions.

On Linux Mint, the optional PHP serving route uses distribution packages:

~~~bash
sudo apt update
sudo apt install php-cli firefox
~~~

~~~bash
git clone https://github.com/vroby65/deepcad.git
cd deepcad
npm start
~~~

Open http://127.0.0.1:8000. The included server binds only to loopback and serves
`public/`, rejecting private paths and non-GET/HEAD methods.

Alternative with PHP:

~~~bash
php -S 127.0.0.1:8000 -t public
~~~

Serve **only public/**, never the repository root. JavaScript modules need HTTP,
not file://. The former PHP backend is preserved in [legacy/](legacy/README.md)
and is not used by the browser application.

## Gateway URL:port and API key

Enter your gateway's address (including its port) and API key beside AIcad.
For example, `http://192.168.1.10:18765`. A bare `address:port` is accepted,
and a trailing `/v1` is normalized. Credentials, queries and fragments are rejected
in URLs. The key is sent only in Authorization headers to the selected gateway.

The adapter uses `GET /v1/models` and `POST /v1/responses`, matching Pi AI Gateway.
The first visible model returned by the account catalog is selected automatically.
The header shows connection errors or the chosen model; no DeepSeek credit API is
called. The gateway handles ChatGPT OAuth and token renewal. Sign in manually on
the gateway before making AI requests; Plus access still depends on granted plan
permission and limits. There is no demo mode or automatic paid retry.

URL and key are saved separately in this browser's localStorage under
`aicad.gateway-url` and `aicad.api-key`. **Clear** forgets only the key and cancels
pending connection checks. Old DeepSeek keys are not reused for the gateway.
Neither value is included in project files, snapshots or prompts; keys are redacted
from logs. Storage is per origin and may be blocked by browser policy.

The published site remains a static browser app. Requests go from your browser
to your gateway, so a LAN gateway remains accessible only while you are on that LAN.
The gateway must allow the hosting origin through CORS. Current Chrome can ask for
local-network permission for an HTTP private IP; allow it when prompted.
Browsers without this support can block HTTP from an HTTPS site: use a trusted
HTTPS gateway or run AIcad locally in that case. Never open router ports for this.
See [Chrome's local-network access guide](https://developer.chrome.com/blog/local-network-access).

Pi AI Gateway must allow `https://vroby65.github.io` and loopback development
origins for `GET`, `POST` and `OPTIONS`, including Authorization and Content-Type.
This changes browser access only, not its LAN bind or public exposure.
The app consumes the gateway's `{model,output_text}` JSON. It validates the model's
CAD JSON before applying any geometry; malformed output leaves the scene intact.

## Model and navigate

Write in the chat input and press **Enter** or **Send**. **Shift+Enter** adds a
line break. Examples:

- `Draw a red 100 mm cube.` — draw a red 100 mm cube.
- `Add a cylinder above the cube.` — add a cylinder above it.
- `Drill a 20 mm through-hole in the cube.` — drill a hole.
- `Cut wheel arches in the body and fenders, preserving the wheels.`
- `Move this object 50 mm along X.` — move the selected object.
- `Create a 120 mm hexagonal tower with a 120-degree twist and tapered top.`
- `Create a curved handle by bending a 10×15×120 mm bar 180 degrees along Z.`
- `Create a turned bottle with rounded shoulders and a narrow neck, then hollow it.`

Left-drag rotates, the wheel zooms and right-drag pans. Click a solid or use the
collapsible **Objects** panel to select it. **Fit view** fits visible material.
The scene includes a grid and XYZ axes. One unit is one millimeter; Z is vertical.

Shapes: boxes/cubes, spheres, cylinders, cones, tori, profile extrusions and solids
of revolution. Commands can change position,
rotation, dimensions, color and name; duplicate, delete, group and ungroup objects.
Stable IDs preserve object identity.

The AI returns strictly validated JSON operations, never executable code.
Unknown fields, bad types, missing IDs and excessive sizes are rejected.
Each batch is atomic: an error leaves the original project intact.
Objects can refer to a group declared later in the same command when that group
explicitly lists them. Undeclared group references remain errors.

## Profiles and deformations

AI can define a simple 2D outline and extrude it into a shaped body, wing or
concave bracket, or revolve a radial profile into a bottle, vase or turned part.
Profiles contain up to 64 reference points in mm; dimensions scale their extents.
Extrusions are centered and run along local Z. Revolution runs around local Z and
closes the ends; a hollow vessel requires additional hole tools and subtraction.
Tori have a main radius and tube radius, with their ring in the local XY plane.

**Twist**, **bend** and **taper** modify the actual mesh, including imported STL.
Up to six ordered modifiers keep the original geometry, ID and editing information.
Deformations run before editable cuts. JSON retains their parameters and source;
STL contains the evaluated surface. Undo/redo includes these changes.
Select the part to edit profile coordinates, deformation axes, angles or taper
factors in **Objects**, then press **Apply**. Ask the chat to add/remove modifiers
or change the number of profile points. `Remove deformations from this object`
restores its base shape; dimensions refer to that base rather than the bent extent.

Bend acts in the planes X→Y, Y→Z or Z→X. Excessively tight bends, self-intersecting
profiles and results over 20000 triangles or 10000 mm per axis are rejected.
Twist supports ±720°, bend ±180°, taper factors 0.05–4. Surfaces are sampled meshes:
compound operations can hit the complexity limit. Freeform NURBS surfaces, lofts,
CAD fillets and geometric constraints are not implemented.

## Real holes and subtraction

Primitive tools marked `hole:true` are invisible and excluded from STL. Editable
tools remain in the object list.

For drilling, AI creates tools and uses **subtract**. This cuts explicitly
named solids while preserving their original shapes and the editable tools.
Solids keep their IDs, types, names, colors, groups and orientations. Select a
**HOLE** in **Objects**, change its center, rotation or dimensions, then press
**Apply**: the old opening fills back in and material is removed at the new
position. You can also ask AI to move or resize that same named hole.
JSON preserves this editing information; STL contains the resulting cut surface.
**Undo / Redo** include hole edits. An initial operation removing no
material is rejected. A completely removed solid can return when its tool moves.

Subtract supports primitives and closed meshes imported from **JSON or STL**.
Targets and tools can be in different groups. Objects outside the target list
remain intact. For wheel arches, cut all overlapping body panels, including the
body behind a fender, and exclude the wheels. Cutting only a fender can leave the
body visible behind the opening.

Adjustable holes are the default. Subtract links each tool to explicit target IDs,
so it keeps cutting only those objects even if groups change; wheels and unrelated
parts remain intact. Old/manual tools without target IDs cut full objects with the
**same group**, including closed imported meshes. groupId:null affects only
ungrouped objects. Group these tools and solids to isolate a part.
Moving, rotating or resizing a tool updates the real cut. Disabling or deleting
it restores material. JSON preserves original shapes and tools for recalculation.
Tools have their own world coordinates: group the solid and its tools when moving
the whole assembly together. A single-object duplicate copies only that object;
linked tools remain separate objects.

Only an explicitly requested finalization uses `bake:true`: it stores a cut mesh
and consumes tools. Old projects already saved as such meshes, and cut STL imports,
do not contain the original tool or missing material. Those old openings cannot be
moved independently: use undo if available or reopen the project before that cut.

Limits: **8 tools**, **32 solid/tool pairs**, **20000 triangles per cut result**.
For explicit subtract, pairs count only its specified targets and tools. Temporary
tools created and linked or consumed in the same atomic command do not count against unrelated
scene objects. The editable-hole pair limit applies to the completed project.
STL must represent a closed solid, not a plane. Topology is not exhaustively
checked. BSP subtraction uses triangulated surfaces and does not guarantee
manifold output, printability or mechanical precision. Solids are not fused.

## Files, history and chat

- **New** starts an empty project, clears selection, chat/context, prompt and
  undo/redo, and resets the view. Confirm before discarding an existing scene,
  conversation, draft or history. The API key and credit remain unchanged.
  This button is disabled during AI requests and file loads.
- **Salva JSON / Apri JSON** preserve mesh vertices, groups and tools. Maximum **8 MiB**.
- **Importa STL** adds ASCII/binary STL without replacing the scene. Maximum
  **10 MiB / 20000 triangles**. Coordinates are preserved; units are interpreted
  as mm because STL stores no unit metadata. Meshes can be transformed and cut.
- **Esporta STL** downloads the evaluated model, including cuts and transformations,
  without tools, grid, axes or selection outlines.
- **Undo / Redo** retain 40 independent snapshots. An edit after undo
  discards the redo branch. Opening JSON replaces the project and history.

Save before reloading: unsaved models and chat are not persisted. The key remains
remembered on the same origin. Files contain no key, chat, selection or undo history.
A mesh does not retain a parametric primitive history.

The chat shows 40 exchanges with the command, explanation, applied operations and
expandable **Risposta completa · JSON**. Rejected output remains readable but is not
shown as applied. There is no CoderDojo switch. AI receives recent conversation
pairs, including your prompts, assistant explanations, affected IDs and whether a
request succeeded. This allows replies such as “yes”, “conical” or “like before”.
Conversation context is limited to 40 exchanges and 128 KiB, retaining recent whole
pairs. It stays in memory and resets when opening a JSON file or starter project.
The current command, selection and compact state are sent last and take priority
after manual edits, undo/redo or STL import. Mesh vertices and rejected raw output
are omitted. The key is never included in this context.
While AI responds, three animated dots replace the waiting text. An accessible
status label remains available; reduced-motion preferences disable the animation.
The indicator disappears on success or error.

Select a part in the scene or object list, open **Objects** if needed, and edit its
name, color, center XYZ or dimensions in the sidebar. **Rotate by · ° (world axes)** accepts additional turns around the fixed scene axes, applied X then Y
then Z with the right-hand sign convention. Press
**Apply** (or Enter in a field) to commit all changed values together, without an
API call. Values are in mm or degrees; dimensions match the selected primitive.
Imported/cut meshes can also be resized; originally planar axes remain locked at
zero. Invalid edits leave the scene unchanged and show an error in the panel.
Updates preserve the ID, refresh the geometry and support **Undo / Redo**.
Rotation fields start at zero and return to zero after applying: entering 30 on X
turns the current part by another 30° about world X. They are not absolute saved
Euler angles. This avoids X/Z controls merging when the existing orientation has
Y at ±90°. Chat `Rotate 90° around Z` uses the same world-axis composition. The stored
JSON retains absolute Euler XYZ orientations for compatibility; its equivalent
numbers can change together after a relative turn. Request an absolute orientation
through chat when needed. Each part rotates about its own center; groups do not
orbit around a shared pivot.
Moving/resizing an editable hole recalculates its cut. Editing is disabled while
an AI request or file load is in progress.

Drag the separator above the chat with mouse or touch to adjust height. Focus it
with Tab and use Up/Down, Home or End. Limits adapt to the window; height is not
persisted. The prompt stays on one compact row and scrolls for long text.

Starter projects: house, robot, car and **Forme complesse** (a hollow profiled vase,
twisted/tapered tower, curved handle, torus and shaped wing).
They open without API calls; natural-language
edits require AI. The house's doors/windows are decorations and its roof
uses rotated boxes.

## GitHub Pages

The [workflow](.github/workflows/pages.yml) tests the code and publishes **public/**
plus the MIT project license. Enable **GitHub Actions** as the repository's Pages
source. Main-branch deployments follow passing tests; pull requests only run tests.
Actions are pinned to commits; no application keys or build secrets are required.
See [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Relative asset paths support a project subdirectory. The configured gateway must
allow CORS from the Pages origin. Browser preflight checks do not prove account
permissions or authenticated model inference. The site publishes only static app
files; the gateway and its OAuth credentials remain private.

## Tests and maintenance

If a command produces nothing, expand **Diagnostics** above the chat. The panel opens
on command errors. **Download log** downloads `aicad-diagnostics.json`; **Clear log**
clears only the diagnostic history. Logs record the command, compact source scene,
request settings, HTTP status, elapsed time, token counts, finish reason, bounded
raw output and the failing validation/geometry phase. Operation errors include their
number and target ID; geometry errors identify the object. Empty and token-truncated
responses have distinct messages, and local JavaScript errors are not labeled as
network failures.

Logs stay in memory in the current tab unless the optional local collector is running.
Download them before reloading when it is unavailable. They include project names, commands and model output;
API keys, Authorization headers, source mesh vertices and reasoning content are
excluded/redacted. The buffer retains at most 100 events within 256 KiB of compact
JSON; oversized records are marked as truncated previews. Log files do not belong
in the public repository. Failed commands leave the editable project unchanged.

For automatic local collection, start a second terminal in the repository:

~~~bash
npm run logs
~~~

This optional Node service binds only to 127.0.0.1:8001. Locally served AIcad sends
redacted snapshots to it and stores `.local/logs/latest.json` plus
`.local/logs/last-failure.json`, outside public and ignored by Git. A new page startup
preserves the last failure; **Clear log** removes it when the collector is available.
Collector errors do not interrupt modeling. GitHub Pages does not send logs to it.

The chat keeps its internal result/ID summaries separate from the provider's output
format: they are sent as plain-text history rather than competing JSON examples.
Clear drawing/revision requests ask the model to produce operations using reasonable
defaults instead of stopping at a proposal. Responses with only message/applied/
objectIds cannot change a model and remain explicitly rejected.

Node.js 20.6+, without installing packages or using a real key:

~~~bash
npm test
# Equivalent:
node --import ./tests/register-three.mjs --test tests/*.test.mjs
~~~

The suite uses real Three.js geometries, STL loading/export and CSG. It checks
JSON validation, IDs, atomic operations, meshes, removed volume, raycast through
holes, round trips, undo/redo, chat, key/URL storage, gateway connection, resize events and HTTP.
Fetches and DOM/pointer interactions are simulated; no paid calls occur.
See [verification details](docs/VERIFICATION.md).

Manual Firefox checks:

1. Open an example; test selection, rotate, zoom, pan and fit.
2. Enter a key, send a command and inspect explanation, operations and JSON.
3. Drill body and fenders while keeping wheels; undo/redo.
4. Import a closed STL, drill, export and reopen it.
5. Save/reopen JSON with a mesh and editable tools; check the cuts.
6. Drag the chat separator, use its keyboard controls and resize the window.
7. Reload and check remembered key/URL and gateway status; clear during a pending request.
8. Try malformed files, a narrow screen and an external STL slicer.
9. Answer a clarification with a short reply; check earlier preferences and IDs.
10. Edit primitive/mesh/hole values, undo/redo, and confirm the next AI command
    uses the manually updated state.
11. Open Forme complesse; edit profiles, modifier axes/angles/factors and the vase
    hole, then save/reopen JSON and export/reimport STL. Deform a simple imported
    closed STL and ask the chat to remove its modifiers.

Screenshots will be added to docs/screenshots/ after a real graphical check.
No simulated screenshots are included. Browser/WebGL testing is not yet verified.

Read [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md) and
[COMMANDS.md](COMMANDS.md) before contributing. Maintenance commands:
`bash scripts/vendor-three.sh`, `bash scripts/vendor-csg.sh` and
`node scripts/create-examples.mjs`. These are not required for everyday use.

Next steps: real Firefox/AI verification, robust topology checks, group pivots
and a geometric kernel for precision booleans, constraints, fillets, dimensions
and STEP. No autosave, general union/intersection or STEP is implemented.

[MIT license](LICENSE). Dependency licenses: [THIRD_PARTY.md](THIRD_PARTY.md).
