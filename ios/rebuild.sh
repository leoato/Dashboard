#!/bin/bash
# 웹 수정이 끝난 뒤 iOS 빌드를 다시 굽는 스크립트.
#   ./ios/rebuild.sh teacher          현재 버전 그대로 다시 굽기
#   ./ios/rebuild.sh teacher --bump   빌드 번호 +1 하고 굽기 (이미 업로드한 번호일 때)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:?사용법: ./ios/rebuild.sh <teacher|student> [--bump]}"
BUMP="${2:-}"

case "$APP" in
  teacher) NAME="오늘선생"; BID="com.leoato.todayteacher"; PROF="Today Teacher AppStore" ;;
  student) NAME="오늘학생"; BID="com.leoato.todaystudent"; PROF="Today Student AppStore" ;;
  *) echo "teacher 또는 student만 가능"; exit 1 ;;
esac

PBX="$ROOT/ios/$APP/ios/App/App.xcodeproj/project.pbxproj"
KC="$HOME/Library/Keychains/farohance-build.keychain-db"

if [ "$BUMP" = "--bump" ]; then
  CUR=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+' "$PBX" | grep -oE '[0-9]+')
  sed -i '' "s/CURRENT_PROJECT_VERSION = $CUR;/CURRENT_PROJECT_VERSION = $((CUR+1));/g" "$PBX"
  echo "▸ 빌드 번호 $CUR → $((CUR+1))"
fi

echo "▸ 현재 버전: $(grep -m1 -oE 'MARKETING_VERSION = [^;]+' "$PBX" | cut -d' ' -f3) (빌드 $(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+' "$PBX" | grep -oE '[0-9]+'))"

echo "▸ 웹 자산 동기화"
"$ROOT/ios/sync-web.sh" > /dev/null

# 제출본 청결 검사 — 스크린샷용 시드나 원격 CDN이 섞이면 여기서 멈춘다
WWW="$ROOT/ios/$APP/www"
if ls "$WWW"/seed-*.js >/dev/null 2>&1; then echo "✖ 시드 파일이 남아 있다"; exit 1; fi
if grep -qE 'cdn\.jsdelivr|cdnjs\.cloudflare|fonts\.googleapis' "$WWW/index.html"; then
  echo "✖ 원격 CDN 참조가 남아 있다 (오프라인 동작 깨짐 = 4.2 리스크)"; exit 1
fi
echo "▸ 청결 검사 통과"

cd "$ROOT/ios/$APP"
npx cap sync ios > /dev/null 2>&1
VER=$(grep -m1 -oE 'MARKETING_VERSION = [^;]+' "$PBX" | cut -d' ' -f3)
ARCH="$HOME/Desktop/$NAME-$VER.xcarchive"
rm -rf "$ARCH"

echo "▸ 아카이브 중… (3~5분)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCH" \
  OTHER_CODE_SIGN_FLAGS="--keychain $KC" archive 2>&1 | grep -E 'ARCHIVE (SUCCEEDED|FAILED)|error:'

PLIST="/tmp/ExportOptions-$APP.plist"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>9RAQ42BTXT</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>$BID</key><string>$PROF</string></dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict></plist>
PLISTEOF

OUT="$HOME/Desktop/앱스토어_업로드"
mkdir -p "$OUT"
rm -rf "$OUT/tmp-$APP"
xcodebuild -exportArchive -archivePath "$ARCH" -exportPath "$OUT/tmp-$APP" \
  -exportOptionsPlist "$PLIST" OTHER_CODE_SIGN_FLAGS="--keychain $KC" 2>&1 | grep -E 'EXPORT (SUCCEEDED|FAILED)|error:'

mv "$OUT/tmp-$APP/App.ipa" "$OUT/$NAME-$VER.ipa"
rm -rf "$OUT/tmp-$APP"

P="$ARCH/Products/Applications/App.app/Info.plist"
echo "▸ 완성: $OUT/$NAME-$VER.ipa"
echo "   $(/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$P") / $(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$P") (빌드 $(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$P"))"
echo "   → Transporter에 드래그해서 전달하면 된다"
