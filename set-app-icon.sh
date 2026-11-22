#!/bin/bash
# Gives the Chrome-installed "Pyramid of Numbers" app the pyramid logo as its Finder/Dock icon.
# Chrome can rebuild its app files after an update, which resets the icon: just run this again.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
icon="$here/logo-1024.png"
app="$(find "$HOME/Applications" -maxdepth 2 -name 'Pyramid of Numbers*.app' -print -quit)"

if [ -z "$app" ]; then
  echo "Couldn't find the installed app in ~/Applications. Install it from Chrome first (the Install button in the address bar)."
  exit 1
fi

osascript -l JavaScript - "$icon" "$app" <<'EOF'
ObjC.import('AppKit');
function run(argv) {
  const img = $.NSImage.alloc.initWithContentsOfFile(argv[0]);
  if (img.isNil()) throw new Error('Could not read ' + argv[0]);
  const ok = $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[1], 0);
  return ok ? 'Icon set on ' + argv[1] : 'macOS refused to set the icon on ' + argv[1];
}
EOF

# Ask Finder and the Dock to pick up the new icon
touch "$app"
killall Dock 2>/dev/null || true
