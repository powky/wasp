#!/bin/bash
# Patch Baileys to use MACOS platform instead of WEB
# WhatsApp rejects Platform.WEB since Feb 24, 2026
# See: https://github.com/WhiskeySockets/Baileys/pull/2365

BAILEYS_FILE="node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js"

if [ -f "$BAILEYS_FILE" ]; then
  if grep -q "Platform.WEB" "$BAILEYS_FILE"; then
    sed -i 's/Platform\.WEB/Platform.MACOS/' "$BAILEYS_FILE"
    sed -i 's/WebSubPlatform\.WEB_BROWSER/WebSubPlatform.MACOS_BROWSER/' "$BAILEYS_FILE"
    echo "✅ Patched Baileys: Platform.WEB → Platform.MACOS, WEB_BROWSER → MACOS_BROWSER"
  else
    echo "ℹ️  Baileys already patched (Platform.MACOS)"
  fi
else
  echo "⚠️  Baileys validate-connection.js not found"
fi
