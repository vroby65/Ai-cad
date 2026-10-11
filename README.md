# DeepCAD

A conversational 3D modeling lab built with HTML5, JavaScript, Three.js and the
official DeepSeek API. Describe a shape, inspect the model and export STL.
Designed for learning geometry, programming and AI, including CoderDojo activities.

[Open DeepCAD](https://vroby65.github.io/deepcad/) ·
[Command format](COMMANDS.md) · [Architecture](ARCHITECTURE.md) ·
[Verification report](docs/VERIFICATION.md)

The active application runs entirely in the browser. No PHP, Python, database,
framework, CDN or npm installation is needed. The interface and AI explanations
are currently in Italian; repository documentation is in English.
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

## DeepSeek key and balance

Enter your own API key beside DeepCAD. **Cancella** clears the field and stored
value, cancels a pending balance request and resets the balance. The toolbar is
directly below this compact header.

The fixed model is **deepseek-flash**, documented by the
[official DeepSeek API](https://api-docs.deepseek.com/). There is no model selector
or demo mode. Natural-language commands require your own API credit.

At the user's request, the key is remembered in this browser's localStorage
under `deepcad.deepseek-key`. Clearing the field also deletes it. If storage is
blocked, the status reports it and the key remains available only in the open page.
Storage is per origin: localhost and GitHub Pages do not share the remembered key.
The key never enters JSON/STL files, project history, repository files or logs.

This is a personal browser client: JavaScript running on the page can access the
key. It is sent only in Authorization headers to the official HTTPS
/chat/completions and /user/balance endpoints. No proxy collects it.
Use a trusted deployment on a browser profile you control.

The balance appears next to the key. It refreshes at startup, after changing the
key and after commands. Zero credit, errors and currencies are kept distinct;
decimal precision is preserved. Stale responses cannot replace a new key's balance.
The .env.example file belongs only to the archived PHP backend.

## Model and navigate

Write in the chat input and press **Invia** or **Ctrl+Enter**. Examples:

- `Disegna un cubo rosso di 100 mm.` — draw a red 100 mm cube.
- `Aggiungi un cilindro sopra il cubo.` — add a cylinder above it.
- `Crea un foro cilindrico passante di diametro 20 mm nel cubo.` — drill a hole.
- `Scava i vani ruota nella carrozzeria e nei parafanghi, conserva le ruote.`
- `Sposta questo oggetto di 50 mm lungo X.` — move the selected object.

Left-drag rotates, the wheel zooms and right-drag pans. Click a solid or use the
collapsible **Oggetti** panel to select it. **Inquadra** fits visible material.
The scene includes a grid and XYZ axes. One unit is one millimeter; Z is vertical.

Shapes: boxes/cubes, spheres, cylinders and cones. Commands can change position,
rotation, dimensions, color and name; duplicate, delete, group and ungroup objects.
Stable IDs preserve object identity.

The AI returns strictly validated JSON operations, never executable code.
Unknown fields, bad types, missing IDs and excessive sizes are rejected.
Each batch is atomic: an error leaves the original project intact.

## Real holes and subtraction

Primitive tools marked `hole:true` are invisible and excluded from STL. Editable
tools remain in the object list.

For drilling, DeepSeek creates tools and uses **subtract**. This cuts explicitly
named solids, saves the resulting mesh vertices and consumes the tools. Solids
keep their IDs, names, colors, groups and orientations. Cuts persist in JSON/STL
without hidden helpers. **Annulla** restores the previous state. A fully consumed
solid is removed; an operation removing no material is rejected.

Subtract supports primitives and closed meshes imported from **JSON or STL**.
Targets and tools can be in different groups. Objects outside the target list
remain intact. For wheel arches, cut all overlapping body panels, including the
body behind a fender, and exclude the wheels. Cutting only a fender can leave the
body visible behind the opening.

For **adjustable holes**, ask to keep editable tools or enable **Forma foro** on
a primitive in the sidebar. Tools cut full objects with the **same group**,
including closed imported meshes. groupId:null affects only ungrouped objects.
Group the body and tools to isolate a part; keep wheels elsewhere.
Moving, rotating or resizing a tool updates the real cut. Disabling or deleting
it restores material. JSON preserves original shapes and tools for recalculation.

Limits: **8 tools**, **32 solid/tool pairs**, **20000 triangles per cut result**.
STL must represent a closed solid, not a plane. Topology is not exhaustively
checked. BSP subtraction uses triangulated surfaces and does not guarantee
manifold output, printability or mechanical precision. Solids are not fused.

## Files, history and chat

- **Salva JSON / Apri JSON** preserve mesh vertices, groups and tools. Maximum **8 MiB**.
- **Importa STL** adds ASCII/binary STL without replacing the scene. Maximum
  **10 MiB / 20000 triangles**. Coordinates are preserved; units are interpreted
  as mm because STL stores no unit metadata. Meshes can be transformed and cut.
- **Esporta STL** downloads the evaluated model, including cuts and transformations,
  without tools, grid, axes or selection outlines.
- **Annulla / Ripristina** retain 40 independent snapshots. An edit after undo
  discards the redo branch. Opening JSON replaces the project and history.

Save before reloading: unsaved models and chat are not persisted. The key remains
remembered on the same origin. Files contain no key, chat, selection or undo history.
A mesh does not retain a parametric primitive history.

The chat shows 40 exchanges with the command, explanation, applied operations and
expandable **Risposta completa · JSON**. Rejected output remains readable but is not
shown as applied. There is no CoderDojo switch. DeepSeek receives the current command,
selection and compact state; vertices and the chat transcript are omitted.

Drag the separator above the chat with mouse or touch to adjust height. Focus it
with Tab and use Up/Down, Home or End. Limits adapt to the window; height is not
persisted. The prompt stays on one compact row and scrolls for long text.

Starter projects: house, robot and car. They open without API calls; natural-language
edits require DeepSeek. The house's doors/windows are decorations and its roof
uses rotated boxes.

## GitHub Pages

The [workflow](.github/workflows/pages.yml) tests the code and publishes **public/**
plus the MIT project license. Enable **GitHub Actions** as the repository's Pages
source. Main-branch deployments follow passing tests; pull requests only run tests.
Actions are pinned to commits; no application keys or build secrets are required.
See [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Relative asset paths support a project subdirectory. DeepSeek must allow CORS
requests from the hosting origin. Chat and balance preflights succeeded for the
intended Pages origin; this does not verify a paid/authenticated request.
Users enter their own keys in the browser.

## Tests and maintenance

Node.js 20.6+, without installing packages or using a real key:

~~~bash
npm test
# Equivalent:
node --import ./tests/register-three.mjs --test tests/*.test.mjs
~~~

The suite uses real Three.js geometries, STL loading/export and CSG. It checks
JSON validation, IDs, atomic operations, meshes, removed volume, raycast through
holes, round trips, undo/redo, chat, key storage, balance, resize events and HTTP.
Fetches and DOM/pointer interactions are simulated; no paid calls occur.
See [verification details](docs/VERIFICATION.md).

Manual Firefox checks:

1. Open an example; test selection, rotate, zoom, pan and fit.
2. Enter a key, send a command and inspect explanation, operations and JSON.
3. Drill body and fenders while keeping wheels; undo/redo.
4. Import a closed STL, drill, export and reopen it.
5. Save/reopen JSON with a mesh and editable tools; check the cuts.
6. Drag the chat separator, use its keyboard controls and resize the window.
7. Reload and check remembered key/balance; clear during a pending request.
8. Try malformed files, a narrow screen and an external STL slicer.

Screenshots will be added to docs/screenshots/ after a real graphical check.
No simulated screenshots are included. Browser/WebGL testing is not yet verified.

Read [AGENTS.md](AGENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md) and
[COMMANDS.md](COMMANDS.md) before contributing. Maintenance commands:
`bash scripts/vendor-three.sh`, `bash scripts/vendor-csg.sh` and
`node scripts/create-examples.mjs`. These are not required for everyday use.

Next steps: real Firefox/DeepSeek verification, robust topology checks, group pivots
and a geometric kernel for precision booleans, constraints, fillets, dimensions
and STEP. No autosave, general union/intersection or STEP is implemented.

[MIT license](LICENSE). Dependency licenses: [THIRD_PARTY.md](THIRD_PARTY.md).
