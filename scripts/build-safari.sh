#!/bin/bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
TASK_PACKAGER="$TASK_DEVELOPER_DIR/usr/bin/safari-web-extension-packager"
if [[ ! -x "$TASK_PACKAGER" ]]; then
  TASK_PACKAGER="$TASK_DEVELOPER_DIR/usr/bin/safari-web-extension-converter"
fi
if [[ ! -x "$TASK_PACKAGER" ]]; then
  echo "Xcode가 필요합니다. Safari의 '임시 확장 프로그램 추가'로 extension 폴더를 직접 불러올 수도 있습니다."
  exit 1
fi
node "$TASK_ROOT/scripts/check.cjs"
if [[ ! -d "$TASK_ROOT/macos/Auto PiP/Auto PiP.xcodeproj" ]]; then
  DEVELOPER_DIR="$TASK_DEVELOPER_DIR" "$TASK_PACKAGER" "$TASK_ROOT/extension" \
    --project-location "$TASK_ROOT/macos" --app-name "Auto PiP" \
    --bundle-identifier "local.autopip.safari" --swift --macos-only --no-open --no-prompt
fi
node "$TASK_ROOT/scripts/prepare-native.cjs"
DEVELOPER_DIR="$TASK_DEVELOPER_DIR" "$TASK_DEVELOPER_DIR/usr/bin/xcodebuild" \
  -project "$TASK_ROOT/macos/Auto PiP/Auto PiP.xcodeproj" \
  -scheme "Auto PiP" -configuration Release \
  -derivedDataPath "$TASK_ROOT/build" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO \
  build
echo "앱: $TASK_ROOT/build/Build/Products/Release/Auto PiP.app"
