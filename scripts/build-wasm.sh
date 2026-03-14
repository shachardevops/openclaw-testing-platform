#!/bin/bash
# Build AssemblyScript validators to WASM
# Requires: pnpm add -D assemblyscript

set -e

WASM_SRC="lib/ruflo/wasm"
WASM_OUT="lib/ruflo/wasm/build"

mkdir -p "$WASM_OUT"

echo "Building WASM validators..."

for ts_file in "$WASM_SRC"/*.ts; do
  name=$(basename "$ts_file" .ts)
  echo "  Compiling $name.ts → $name.wasm"
  npx asc "$ts_file" \
    --outFile "$WASM_OUT/$name.wasm" \
    --optimize \
    --runtime stub \
    2>/dev/null || echo "  Warning: $name.ts compilation skipped (assemblyscript may not be installed)"
done

echo "Done. Output in $WASM_OUT/"
