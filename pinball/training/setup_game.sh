#!/bin/sh
# downloads the (Microsoft-data containing) web build to /tmp/pbgame for LOCAL training only (never commit these files) and serves it on 127.0.0.1:8765
D=${1:-/tmp/pbgame}; mkdir -p $D; cd $D
for f in SpaceCadetPinball.js SpaceCadetPinball.wasm SpaceCadetPinball.data; do [ -s $f ] || curl -sS -O https://pinball.alula.me/$f; done
HERE=$(cd "$(dirname "$0")" && pwd)
ln -sf $HERE/harness.html harness.html; ln -sf $HERE/env.js env.js; ln -sf $HERE/../ai.js ai.js
echo "serve with: cd $D && python3.12 -m http.server 8765 --bind 127.0.0.1"
