#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Pin del core MIT; nessun worker o adapter remoto nel runtime.
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/manthrax/THREE-CSGMesh/8bd00fe919ad464500653ad98d8d9a4de2f59015/csg-lib.js \
  -o public/vendor/csg-lib.js
