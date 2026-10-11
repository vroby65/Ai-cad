# Bundled dependencies

Three.js **0.186.1**, OrbitControls, STLLoader and STLExporter are bundled from the
official npm package, under MIT. Complete copyright/license notices are preserved
in public/vendor/THREE-LICENSE.txt. The ES module, core and three required examples
modules are unmodified.

- [Project](https://github.com/mrdoob/three.js)
- [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- [STLExporter](https://threejs.org/docs/pages/STLExporter.html)
- [STLLoader](https://threejs.org/docs/pages/STLLoader.html)
- [Pinned package](https://registry.npmjs.org/three/-/three-0.186.1.tgz)
- Restore: bash scripts/vendor-three.sh

The MIT **THREE-CSGMesh** BSP core is bundled unmodified at commit
8bd00fe919ad464500653ad98d8d9a4de2f59015 in public/vendor/csg-lib.js.
Original author Evan Wallace (2011), Three.js rework by thrax; full attribution
and license are in public/vendor/CSG-LICENSE.txt. The upstream Three.js adapter
and workers are not imported. DeepCAD's local adapter subtracts primitive tools
from primitive or closed imported mesh solids.

- [Project](https://github.com/manthrax/THREE-CSGMesh)
- [Pinned source](https://github.com/manthrax/THREE-CSGMesh/blob/8bd00fe919ad464500653ad98d8d9a4de2f59015/csg-lib.js)
- Restore: bash scripts/vendor-csg.sh

No external fonts, bitmap assets, CDN or UI framework are used.
Project code is covered by the root MIT LICENSE. Pages deployments include that
license and the vendor license files.
