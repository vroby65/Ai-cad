#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
three_tmp=$(mktemp -d)
trap 'rm -rf "$three_tmp"' EXIT
curl --fail --silent --show-error --location https://registry.npmjs.org/three/-/three-0.186.1.tgz -o "$three_tmp/three.tgz"
tar -xzf "$three_tmp/three.tgz" -C "$three_tmp"
mkdir -p public/vendor
cp "$three_tmp/package/build/three.module.js" "$three_tmp/package/build/three.core.js" public/vendor/
cp "$three_tmp/package/examples/jsm/controls/OrbitControls.js" public/vendor/
cp "$three_tmp/package/examples/jsm/exporters/STLExporter.js" public/vendor/
cp "$three_tmp/package/examples/jsm/loaders/STLLoader.js" public/vendor/
cp "$three_tmp/package/LICENSE" public/vendor/THREE-LICENSE.txt
