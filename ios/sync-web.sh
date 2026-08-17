#!/bin/bash
# 웹 원본 → 두 Capacitor www/ 단방향 동기화. 앱 빌드 전에 반드시 실행한다.
# 웹(GitHub Pages)과 앱이 갈라지지 않도록, 앱 전용 분기를 만들지 않는 것이 원칙.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sync_one() {   # $1=앱폴더(teacher|student)  $2=진입 HTML  $3=구글폰트 포함 여부(yes|no)
  local dest="$ROOT/ios/$1/www"
  # www를 통째로 비우고 다시 만든다 — 스크린샷용 시드 같은 임시 파일이
  # 제출 빌드에 섞여 들어가는 사고를 원천 차단한다.
  rm -rf "$dest"
  mkdir -p "$dest/vendor/fonts"
  cp "$ROOT/vendor/pretendard.css" "$ROOT/vendor/supabase.js" "$ROOT/vendor/pdf.min.js" "$ROOT/vendor/pdf.worker.min.js" "$dest/vendor/"
  cp "$ROOT"/vendor/fonts/PretendardVariable.*.woff2 "$dest/vendor/fonts/"
  if [ "$3" = "yes" ]; then
    cp "$ROOT/vendor/fonts.css" "$dest/vendor/"
    cp "$ROOT"/vendor/fonts/g_*.woff2 "$dest/vendor/fonts/"
  fi
  cp "$ROOT/$2" "$dest/index.html"    # Capacitor 진입점은 항상 index.html
  cp "$ROOT/icon-$1.png" "$dest/" 2>/dev/null || true
  echo "  $1 ← $2  ($(du -sh "$dest" | cut -f1))"
}

echo "웹 자산 동기화:"
sync_one teacher index.html   yes    # 선생 앱은 구글폰트 6종 사용
sync_one student student.html no     # 학생 앱은 Pretendard만 사용 → 번들 대폭 축소
echo "✅ 완료"
