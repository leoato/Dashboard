/* ═══════════════════════════════════════════════════════════════════════════
   annotation.js — study-tutor-v10 필기(주석) 시스템 (v1)
   재원이형 수정본(React AnnotationOverlay/DrawingToolbar)의 로직을 바닐라 JS로 이식
   + 원펜(OnePen) 앱의 연필 도구 / 멀티터치 undo·redo 제스처 / 프리셋 재탭 굵기 팝오버.

   ── 데이터 모델 (유일한 저장 포맷 = 재원이형 포맷) ─────────────────────────
   annotation = {
     id, type:'stroke'|'rect-highlight'|'text',
     tool:'pen'|'highlighter'|'pencil',            // type==='stroke'일 때
     color, widthRatio, opacity, pressureEnabled,
     points:[{x,y,pressure}],                       // 0~1 정규화 (페이지 div 크기 대비)
     x,y,w,h,text,sizeRatio                         // rect-highlight / text 용
   }
   저장 blob = { "페이지번호": [annotation, ...], ... }  → /api/ink/save {filename, inkByPage}

   ── HTML(study-tutor-v10.html) 통합 지점 ──────────────────────────────────
   · renderVisiblePages(): 각 .pdf-page에 Annot.ensureOverlay(w, i, near) 호출
   · renderPdfPage(i) 끝: Annot.ensureOverlay(w, i, true)  (innerHTML 초기화 후 재부착)
   · loadFile()/openLibItem(): Annot.loadInk(키) / 문서 전환 시 Annot.resetDoc()
   · 구식 canvas 잉크(drawInkStrokes/inkByPageWeb)는 제거됨 — 이 파일이 표시 전담

   ── 확장 포인트 (영역선택→AI질문은 HTML 쪽 region-ai 블록이 사용 중) ──────
   · Annot.registerTool(id, {kind:'custom', onDown, onMove, onUp, cursor})
     → onDown(ctx) 의 ctx = {page, pos:{x,y}, event, root, api, state}
   · Annot.addToolbarButton({id, icon, title, onClick, isActive})
   · Annot.setTool(id) / Annot.getPages() / Annot.commitPage(page, list, {snapshot:true})
   · Annot.renderPageToCanvas(page, ctx, w, h) — 필기를 캔버스에 픽셀 합성 (풀이검사)
   · Annot._pure.computeCropRect / computeTargetSize — 영역 크롭 좌표·리사이즈 계산

   ── v3 캔버스 인터랙션 (원펜 이식) ───────────────────────────────────────
   · 올가미(➰, PKLassoTool 근사): §8b — 폴리곤 선택→이동/복사/복제/삭제, undo 지원
   · 여백 롱프레스 → 붙여넣기: §8c — 앱 내부 클립보드(localStorage 영속)
   · 직선 자(PKRuler 근사): S.rulerOn 모디파이어 — 펜/형광펜/연필이 직선
     → v10.5부터 전용 버튼 없이 **펜별 설정(preset.straight)** 으로 켠다
     → v10.10부터 각도 제한 없음(자유 각도). Shift를 누른 동안만 1° 격자 스냅(§1 SNAP_STEP_DEG)
   · PDF 핀치줌은 HTML 쪽(initPdfZoom) — 여기선 touchDownCount≥2 가드로 필기 억제
   · 순수부 추가: pointInPolygon/lassoSelect/clampMoveDelta/translateAnnotation/
     snapAngle/computeRulerEnd/rulerLinePoints/computeZoomAnchor (Node 테스트 대상)
   · v10.1 순수부 추가: duplicateOffset/makeClipboard/pasteClipboard

   ── v10.3 필기감 + 올가미 현대화 ─────────────────────────────────────────
   [A] 스트로크 파이프라인 (저장 포맷 points 배열은 **불변** — 하위호환 100%)
     A-1 오버레이 rect 캐시 + 최소이동 0.5→1.6px  → 리플로우/점 개수 급감
     A-2 좌표 EMA 스무딩 (펜·연필 0.45 / 형광 0.35, 필압 0.25) — §1 emaPoint
     A-3 연필 질감을 세그먼트 인덱스 → **누적 호길이(6px 주기)** 기반으로 (§1 pencilTexture)
     A-4 polyline/line → <path> + 중점 이차 베지어 (§1 strokePathD, 캔버스도 동일 규칙)
     A-5 굵기 8% 양자화 + 같은 굵기 구간 병합 (§1 strokeRuns) → 노드 수 5~15배 감소
     → 렌더 경로 3곳(라이브 증분 / 확정 SVG / 캔버스 합성)이 §1 헬퍼를 공유해 항상 일치
   ── v10.5 툴바 정리 (iPad 실사용 피드백) ────────────────────────────────
   [1] 툴바는 좌측 자료(필기) 패널 #left 안에만 — clampToolbarPos(opts.area) + panelState()
       분할바 드래그/보기모드 전환 시 재클램프(ResizeObserver), "풀해설만" 모드면 숨김(annot-nopanel),
       #left가 없는 페이지(quiz.html 등)는 기존 뷰포트 클램프로 폴백
   [2] 도구 정리: ▭ 네모 형광펜 버튼 제거 / 🧽+✂️ → 지우개 1개(모드 팝오버) /
       📏 직선 자 제거 → 프리셋(펜)별 straight 플래그 / 풀이검사 아이콘 🔍 → 💬(HTML 등록부에서 교체)
   [3] 펜 자동 복귀: 도구 탭 = 1회용(작업 끝나면 직전 펜으로) / 길게(500ms) = 고정 — oneShot·autoReturnPen
   [4] 저장 배지 제거 → 실패했을 때만 토스트 + 재시도 버튼(#annotSaveErr)
   ─────────────────────────────────────────────────────────────────────────
   ── v10.10 직선 각도 자유화 + 재원이형 수정본-2 툴바 4종 재비교 이식 ──────
   [1] 직선 모드 각도: 15° 스냅 강제 → **자유 각도가 기본**. Shift를 누른 동안만 1° 격자 스냅.
       (iPad·갤탭엔 Shift가 없어 구버전은 스냅을 끌 방법이 아예 없었다 — §1 SNAP_STEP_DEG)
   [2] 텍스트 메모: window.prompt → **인라인 편집기**(§8a) — 그 자리 textarea + 하단 크기·색 바.
       메모 상자 크기를 글자 기준으로 실측 저장(§1 measureTextBox) → 지우개·탭 판정이 정확해짐.
   [3] 올가미: **탭 = 그 자리 개체 하나 선택**(§1 pickAnnotationAt) 추가. 둘러 그리기는 그대로.
       메모 하나만 선택했을 땐 선택 메뉴에 [수정] — 바로 인라인 편집기로.
   [4] 스타일러스 옆 버튼(배럴)/지우개 팁 = 그 획만 지우개 (도구는 안 바뀜, §7 effectiveTool)
   [5] 아이콘 이모지(📝 ➰ ⛶) → lucide 형태 인라인 SVG (지우개와 한 세트로)
   ─────────────────────────────────────────────────────────────────────────
   [B] 올가미 현대화: marching ants 선택 박스(SVG) / 선택 획 글로우 / 이동 중 들어올림 /
       아이콘 메뉴(박스 위 중앙 + 화면 클램프, 잘라내기 추가) / 키보드(Del·Esc·Ctrl+C/X/D/V) /
       노드 참조 캐시 + id 해시 (이동 중 querySelector·indexOf 제거)
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ═══ 1. 순수 함수 (Node 단위테스트 대상 — DOM 무의존) ═══════════════════ */

  var clamp = function (n, min, max) {
    if (min === undefined) min = 0;
    if (max === undefined) max = 1;
    return Math.min(max, Math.max(min, n));
  };

  var uid = function () {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'ann-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  };

  // 점 P에서 선분 AB까지의 최단거리 (px)
  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    var abx = bx - ax, aby = by - ay;
    var len2 = abx * abx + aby * aby;
    if (!len2) return Math.hypot(px - ax, py - ay);
    var t = clamp(((px - ax) * abx + (py - ay) * aby) / len2);
    var x = ax + t * abx, y = ay + t * aby;
    return Math.hypot(px - x, py - y);
  }

  // 스트로크가 pos(정규화)에서 radiusPx 안에 걸리는지 (width/height = 오버레이 px 크기)
  function strokeHit(annotation, pos, width, height, radiusPx) {
    var points = annotation.points || [];
    if (points.length === 1) {
      return Math.hypot(pos.x * width - points[0].x * width, pos.y * height - points[0].y * height) <= radiusPx;
    }
    for (var i = 1; i < points.length; i += 1) {
      var a = points[i - 1], b = points[i];
      if (pointSegmentDistance(pos.x * width, pos.y * height, a.x * width, a.y * height, b.x * width, b.y * height) <= radiusPx) return true;
    }
    return false;
  }

  // 부분 지우개: pos 반경 안의 점을 빼고 남은 조각들로 스트로크 분할
  function splitStroke(annotation, pos, width, height, radiusPx) {
    var chunks = [], current = [];
    var points = annotation.points || [];
    for (var i = 0; i < points.length; i += 1) {
      var point = points[i];
      var distance = Math.hypot(point.x * width - pos.x * width, point.y * height - pos.y * height);
      if (distance <= radiusPx) {
        if (current.length > 1) chunks.push(current);
        current = [];
      } else current.push(point);
    }
    if (current.length > 1) chunks.push(current);
    return chunks.map(function (pts) {
      var copy = {};
      for (var k in annotation) if (Object.prototype.hasOwnProperty.call(annotation, k)) copy[k] = annotation[k];
      copy.id = uid();
      copy.points = pts;
      return copy;
    });
  }

  // 텍스트 메모/사각 하이라이트가 pos(정규화)를 포함하는지
  function annotationContains(annotation, pos) {
    if (annotation.type === 'text') {
      return pos.x >= annotation.x && pos.x <= annotation.x + (annotation.w || 0.22)
        && pos.y >= annotation.y && pos.y <= annotation.y + (annotation.h || 0.09);
    }
    if (annotation.type === 'rect-highlight') {
      return pos.x >= annotation.x && pos.x <= annotation.x + annotation.w
        && pos.y >= annotation.y && pos.y <= annotation.y + annotation.h;
    }
    return false;
  }

  /* ── v10.10 텍스트 메모 실측 박스 (재원이형 수정본-2 measureTextBox 이식) ───
     구: 모든 메모가 w=0.25 / h=0.08 **고정** → 글자보다 훨씬 큰 상자가 잡혀
         지우개가 닿지도 않은 메모를 지우고, 탭 선택도 엉뚱한 걸 집었다.
     신: 글자 수·줄 수로 실제 크기를 추정해 저장한다.
       · 한글·한자·가나(코드포인트 > 0x1FFF)는 1em, 그 외(영문·숫자·기호)는 0.56em 폭
       · 세로는 CSS(.annot-text-note)의 line-height 1.45 + 상하 패딩
     폰트 px = sizeRatio × W (기존 렌더 규칙 그대로 — 저장 포맷은 불변). */
  function measureTextBox(text, sizeRatio, W, H) {
    var pw = Math.max(1, W), ph = Math.max(1, H);
    var fontPx = Math.max(10, (sizeRatio || 0.018) * pw);
    var lines = String(text === null || text === undefined ? '' : text).split('\n');
    var longest = 1;
    for (var i = 0; i < lines.length; i += 1) {
      var em = 0;
      for (var k = 0; k < lines[i].length; k += 1) em += lines[i].charCodeAt(k) > 0x1fff ? 1 : 0.56;
      if (em > longest) longest = em;
    }
    return {
      w: clamp((longest * fontPx * 1.06 + 18) / pw, 0.02, 0.96),
      h: clamp((lines.length * fontPx * 1.45 + 12) / ph, 0.02, 0.96)
    };
  }

  /* ── v10.10 탭으로 개체 하나 집기 (재원이형 select 도구의 pickAnnotationAt 이식) ──
     올가미는 "둘러 그려서" 고르는 도구라, 획 하나만 지우거나 옮기고 싶을 때도
     매번 동그라미를 그려야 했다. 이제 탭 한 번이면 그 자리의 개체가 선택된다.
     위에 그린 것이 우선(뒤에서부터 탐색) — 겹친 필기에서 눈에 보이는 것이 잡힌다. */
  function pickAnnotationAt(list, pos, W, H, radiusPx) {
    list = list || [];
    var r = radiusPx === undefined ? 13 : radiusPx;
    for (var i = list.length - 1; i >= 0; i -= 1) {
      var item = list[i];
      if (!item) continue;
      if (item.type === 'stroke') { if (strokeHit(item, pos, W, H, r)) return item; }
      else if (annotationContains(item, pos)) return item;
    }
    return null;
  }

  /* ── 레거시 원펜(OnePen) 포맷 변환 (1회성 — 다음 저장 때 새 포맷으로 덮어써짐)
     구 포맷: {p:[[x,y],...], c:색, w:굵기, t:'pen'|'marker'|'pencil'}
     좌표 = pdf.js scale=1 페이지 포인트 절대값 → baseW/baseH(=getViewport({scale:1}))로 정규화 */
  function isLegacyStroke(item) {
    return !!item && !item.type && Array.isArray(item.p);
  }

  function convertLegacyStroke(s, baseW, baseH) {
    var toolMap = { pen: 'pen', marker: 'highlighter', pencil: 'pencil' };
    var tool = toolMap[s.t] || 'pen';
    var widthMul = s.t === 'marker' ? 1.4 : 1;          // 구 렌더러가 marker에 1.4배 굵기 적용
    var opacity = s.t === 'marker' ? 0.35 : (s.t === 'pencil' ? 0.9 : 1);
    var bw = Math.max(1, baseW), bh = Math.max(1, baseH);
    return {
      id: uid(), type: 'stroke', tool: tool,
      color: s.c || '#222222',
      widthRatio: Math.max(0.0007, ((s.w || 3) * widthMul) / bw),
      opacity: opacity,
      pressureEnabled: false,                            // 구 포맷엔 필압 정보 없음
      points: (s.p || []).map(function (pt) {
        return { x: clamp((pt[0] || 0) / bw), y: clamp((pt[1] || 0) / bh), pressure: 0.5 };
      })
    };
  }

  // 페이지 하나 정규화: 레거시는 변환, 신 포맷은 id 보정 후 그대로
  function normalizeInkPage(items, baseW, baseH) {
    var list = [], legacyCount = 0;
    if (!Array.isArray(items)) return { list: list, legacyCount: 0 };
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it) continue;
      if (isLegacyStroke(it)) {
        var conv = convertLegacyStroke(it, baseW, baseH);
        if (conv.points.length >= 2) { list.push(conv); legacyCount += 1; }
      } else if (it.type === 'stroke' || it.type === 'rect-highlight' || it.type === 'text') {
        if (!it.id) it.id = uid();
        list.push(it);
      }
    }
    return { list: list, legacyCount: legacyCount };
  }

  /* ── 페이지 키 시프트 (v4 빈 페이지 삽입 — 원펜 NoteView.shiftKeys 이식) ──
     pages = { 페이지번호: 값 } 에서 from 이상 키를 delta만큼 이동 (in-place).
     delta>0(삽입)은 큰 번호부터 역순, delta<0(롤백)은 작은 번호부터 — 덮어쓰기 방지.
     이동 후 1 미만이 되는 키는 버림(방어 — 정상 호출에선 발생 안 함). 반환: 이동한 키 수. */
  function shiftPageKeys(pages, from, delta) {
    if (!pages || typeof pages !== 'object' || !isFinite(from) || !delta) return 0;
    var keys = Object.keys(pages).map(Number).filter(function (k) { return isFinite(k) && k >= from; });
    keys.sort(function (a, b) { return delta > 0 ? b - a : a - b; });
    var moved = 0;
    for (var i = 0; i < keys.length; i += 1) {
      var k = keys[i], nk = k + delta;
      var v = pages[k];
      delete pages[k];
      if (nk >= 1) { pages[nk] = v; moved += 1; }
    }
    return moved;
  }

  /* ── 연필 질감 지터: id 기반 결정적 (렌더할 때마다 모양이 흔들리지 않게)
     SVG 렌더(§5)와 캔버스 합성 렌더가 공유 — DOM 무의존이라 여기(순수부)에 둠 */
  function pencilSeed(id) {
    var h = 0, s = String(id || '');
    for (var i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h % 1000) / 1000;
  }
  function jitter(seed, i) {
    var v = Math.sin((seed * 97.13 + i) * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }
  function strokeBaseWidth(item, W) { return Math.max(0.8, (item.widthRatio || 0.0025) * W); }

  /* ═══ v10.3 필기감(스트로크) 파이프라인 ═════════════════════════════════════
     사전 조사 결론: 참조 앱엔 스무딩 기법이 전무한데도 우리보다 부드러웠다.
     원인은 "기법 부족"이 아니라 **과입력**이었음 —
       ① 최소이동 0.5px 필터 + coalesced 이벤트 → 240Hz 펜슬에서 획당 점 400~1200개
       ② 점마다 굵기가 새로 계산돼(연필 지터=세그먼트 인덱스 기반) 굵기가 매 0.5px 튐
       ③ 폴리라인이라 점이 촘촘할수록 미세 각짐이 그대로 보임
     그래서 (a) 입력 단계에서 점을 줄이고(EMA+1.6px), (b) 질감을 호길이 기반으로 바꾸고,
     (c) 렌더를 이차 베지어 경로로 바꾼다. **저장 포맷(points 배열)은 그대로** — 하위호환 100%. */

  /* ── A-2. 좌표 EMA 스무딩 (입력 단계 전용 — 저장/렌더는 이미 스무딩된 점을 그대로 씀)
     alpha = 새 원본 좌표의 반영 비율. 낮을수록 부드럽지만 지연(펜이 늦게 따라옴)이 커진다.
     지연 ≈ (1-alpha)/alpha 샘플 → 0.45면 1.2샘플(240Hz에서 ~5ms), 0.35면 1.9샘플(~8ms).
     0.3 이하는 60Hz 마우스에서 체감 지연이 생겨 금지. 형광펜은 굵어서 미세각짐이
     더 눈에 띄므로 조금 더 강하게(0.35), 펜·연필은 반응성 우선(0.45).
     필압은 좌표보다 훨씬 노이지(펜 팁 접촉면 변화)라 별도 계수(0.25)로 더 강하게 민다. */
  var SMOOTH_ALPHA = { pen: 0.45, pencil: 0.45, highlighter: 0.35 };
  var PRESSURE_ALPHA = 0.25;
  var MIN_STEP_PX = 1.6;          // A-1. 최소 이동거리(px) — 0.5→1.6 (점 개수 약 1/3)

  function smoothAlphaFor(tool) {
    return SMOOTH_ALPHA[tool] === undefined ? 0.45 : SMOOTH_ALPHA[tool];
  }

  /* alpha를 "샘플당"이 아니라 "이동 거리당"으로 환산한다. (실측으로 필요성이 드러난 부분)
     고정 alpha면 지연이 **샘플 수** 로 고정돼, 같은 alpha라도
       240Hz 펜슬(샘플 간격 0.7px) → 지연 0.9px  ← 문제 없음
        60Hz 마우스(샘플 간격 2.7px) → 지연 3.3px ← 곡선 모서리가 잘림(실측 최대 9.5px 벗어남)
     기준 간격(0.7px = 240Hz 필기 속도)에서 alpha가 되도록 지수 보정하면
     지연이 **거리(px)** 로 고정돼 기기·주사율이 달라도 같은 획이 나온다(실측 최대 1.6px).
     · 큰 점프(빠른 플릭)일수록 alpha→1 = 스무딩 약화 (빠른 획은 원래 노이즈가 안 보임)
     · 멈춰 있을 땐 하한(0.05px)을 둬 천천히라도 따라붙게 (멈춤 후 튀는 현상 방지) */
  var EMA_REF_STEP_PX = 0.7;
  function emaAlphaForStep(baseAlpha, stepPx, refPx) {
    var r = refPx > 0 ? refPx : EMA_REF_STEP_PX;
    var a = Math.min(0.999, Math.max(0.001, baseAlpha));
    var k = Math.max(0.05, stepPx > 0 ? stepPx : 0) / r;
    if (k >= 8) return 1;                       // 순간이동급 점프 → 그대로 따라감
    return 1 - Math.pow(1 - a, k);
  }

  // prev(직전 스무딩 결과) + raw(원본) → 새 스무딩 점. prev 없으면 raw를 그대로 시드로.
  function emaPoint(prev, raw, alpha, pAlpha) {
    var rp = (raw.pressure === undefined || raw.pressure === null) ? 0.5 : raw.pressure;
    if (!prev) return { x: raw.x, y: raw.y, pressure: rp };
    var a = (alpha === undefined) ? 0.45 : alpha;
    var pa = (pAlpha === undefined) ? a : pAlpha;
    var pp = (prev.pressure === undefined || prev.pressure === null) ? 0.5 : prev.pressure;
    return {
      x: prev.x + (raw.x - prev.x) * a,
      y: prev.y + (raw.y - prev.y) * a,
      pressure: pp + (rp - pp) * pa
    };
  }

  /* 원본 점열 → (EMA + 최소이동 필터) 적용 결과. 실제 입력 경로와 같은 규칙을 순수 함수로
     재현한 것 — 단위테스트/정량 측정(점 개수·왜곡)에 쓴다.
     minStepPx를 0으로 주면 필터 없이 EMA만 적용(수렴·지연 특성 측정용). */
  function smoothPointStream(rawPoints, opts) {
    opts = opts || {};
    var alpha = opts.alpha === undefined ? 0.45 : opts.alpha;
    var pAlpha = opts.pressureAlpha === undefined ? PRESSURE_ALPHA : opts.pressureAlpha;
    var minStep = opts.minStepPx === undefined ? MIN_STEP_PX : opts.minStepPx;
    var perSample = !!opts.perSampleAlpha;      // true면 거리 보정 없이 고정 alpha (비교용)
    var W = opts.W || 1, H = opts.H || 1;
    var pts = rawPoints || [];
    var out = [], ema = null, prevRaw = null;
    for (var i = 0; i < pts.length; i += 1) {
      var step = prevRaw ? Math.hypot((pts[i].x - prevRaw.x) * W, (pts[i].y - prevRaw.y) * H) : 0;
      var a = perSample ? alpha : emaAlphaForStep(alpha, step, opts.refStepPx);
      var pa = perSample ? pAlpha : emaAlphaForStep(pAlpha, step, opts.refStepPx);
      ema = emaPoint(ema, pts[i], a, pa);
      prevRaw = pts[i];
      if (!out.length) { out.push(ema); continue; }
      var last = out[out.length - 1];
      if (Math.hypot((ema.x - last.x) * W, (ema.y - last.y) * H) < minStep) continue;
      out.push(ema);
    }
    return out;
  }

  /* ── A-3. 연필 질감을 "누적 호길이(px)" 기반으로 ───────────────────────────
     구: jitter(seed, 세그먼트인덱스) → 샘플링 레이트가 오르면 0.5px마다 굵기가 튀어 털뭉치.
     신: 6px(기준 배율)마다 한 번씩 변하도록 호길이를 주기로 나눠 보간 → 기기·주사율 무관.
     주기는 렌더 폭에 비례(6px @ W=820) → 확대해도 "같은 획이 크게 보일 뿐" 질감 밀도 불변.
     smoothstep 보간이라 밴딩 없이 완만하게 굵기가 오르내린다. 반환 = 굵기 배수(0.82~1.18). */
  var PENCIL_TEXTURE_PX = 6;
  var PENCIL_REF_W = 820;
  function pencilPeriodPx(W) { return Math.max(1.5, PENCIL_TEXTURE_PX * (W || PENCIL_REF_W) / PENCIL_REF_W); }
  function pencilTexture(seed, lenPx, periodPx) {
    var period = periodPx > 0 ? periodPx : PENCIL_TEXTURE_PX;
    var t = (lenPx || 0) / period;
    var i = Math.floor(t), f = t - i;
    var a = jitter(seed, i), b = jitter(seed, i + 1);
    var e = f * f * (3 - 2 * f);                    // smoothstep — 구간 경계 굵기 점프 제거
    return 0.82 + 0.36 * (a + (b - a) * e);
  }

  /* ── A-5. 세그먼트 굵기 양자화 + 같은 굵기 구간 병합 ──────────────────────
     필압 펜/연필은 점마다 <line> 1개 → 획 50개면 수만 노드 (스크롤·재렌더 프레임드랍).
     굵기를 base의 8% 단위로 양자화하면 인접 세그먼트 대부분이 같은 값이 되어
     하나의 <path>로 묶인다. 눈으로는 구분이 안 되고(8%=0.24px @ 3px 펜) 노드는 급감. */
  function widthQuantStep(base) { return Math.max(0.12, base * 0.08); }
  function quantizeWidth(w, step) {
    var s = step > 0 ? step : 0.12;
    return Math.max(0.5, Math.round(w / s) * s);
  }

  // 세그먼트 j(= points[j-1]→points[j])의 원(양자화 전) 굵기
  function segmentRawWidth(item, prev, point, base, seed, midLenPx, periodPx) {
    var pressure = item.pressureEnabled
      ? Math.max(0.25, ((prev.pressure || 0.5) + (point.pressure || 0.5)) / 2)
      : 1;
    var texture = item.tool === 'pencil' ? pencilTexture(seed, midLenPx, periodPx) : 1;
    return Math.max(0.5, base * pressure * texture);
  }

  function isSegmentedStroke(item) {
    return item.tool === 'pencil' || (item.tool === 'pen' && !!item.pressureEnabled);
  }

  /* 획 → 렌더 구간 목록 [{width, i0, i1}] (점 i0..i1을 굵기 width 하나로 그린다).
     · 필압/질감 없는 획(형광펜·필압 off 펜) → 구간 1개 = 경로 1개
     · 필압 펜/연필 → 양자화 굵기가 바뀌는 지점에서만 구간 분할 (경계 점은 양쪽이 공유해 틈 없음)
     SVG 렌더 / 캔버스 합성 / 라이브 증분이 **모두 이 규칙 하나**를 쓴다. */
  function strokeRuns(item, W, H) {
    var pts = item.points || [];
    var n = pts.length;
    if (n < 2) return [];
    var base = strokeBaseWidth(item, W);
    if (!isSegmentedStroke(item)) return [{ width: base, i0: 0, i1: n - 1 }];
    var seed = item.tool === 'pencil' ? pencilSeed(item.id) : 0;
    var period = pencilPeriodPx(W);
    var step = widthQuantStep(base);
    var runs = [], cum = 0, curW = null, start = 0;
    for (var j = 1; j < n; j += 1) {
      var a = pts[j - 1], b = pts[j];
      var segLen = Math.hypot((b.x - a.x) * W, (b.y - a.y) * H);
      var w = quantizeWidth(segmentRawWidth(item, a, b, base, seed, cum + segLen / 2, period), step);
      cum += segLen;
      if (curW === null) { curW = w; start = j - 1; }
      else if (w !== curW) { runs.push({ width: curW, i0: start, i1: j - 1 }); curW = w; start = j - 1; }
    }
    runs.push({ width: curW, i0: start, i1: n - 1 });
    return runs;
  }

  /* ── A-4. 중점(midpoint) 이차 베지어 경로 ─────────────────────────────────
     규칙: M p0 · (i=1..n-2) Q p_i mid(p_i,p_{i+1}) · L p_{n-1}
     점 하나가 들어올 때마다 Q 하나를 "확정"할 수 있어(직전 점이 제어점) 증분 append가 가능 —
     지금의 라이브 렌더 구조(획 진행 중 문자열 뒤에 붙이기)에 그대로 맞는다.
     점 2개면 M+L(직선)로 자연 축약되고, 점 1개면 빈 문자열(탭=원은 호출측이 따로 그림). */
  function fmtNum(n) { return Math.round(n * 100) / 100; }
  function pathStart(x, y) { return { d: 'M' + fmtNum(x) + ' ' + fmtNum(y), n: 1, px: x, py: y }; }
  function pathAdd(b, x, y) {
    if (b.n >= 2) {
      b.d += ' Q' + fmtNum(b.px) + ' ' + fmtNum(b.py) + ' ' + fmtNum((b.px + x) / 2) + ' ' + fmtNum((b.py + y) / 2);
    }
    b.px = x; b.py = y; b.n += 1;
    return b;
  }
  function pathTail(b) { return b.n >= 2 ? b.d + ' L' + fmtNum(b.px) + ' ' + fmtNum(b.py) : ''; }

  function strokePathD(points, W, H, i0, i1) {
    points = points || [];
    if (i0 === undefined) i0 = 0;
    if (i1 === undefined) i1 = points.length - 1;
    if (i1 <= i0 || !points[i0]) return '';
    var b = pathStart(points[i0].x * W, points[i0].y * H);
    for (var i = i0 + 1; i <= i1; i += 1) pathAdd(b, points[i].x * W, points[i].y * H);
    return pathTail(b);
  }

  // 캔버스판 — SVG와 완전히 같은 제어점 규칙 (화면과 PDF 내보내기가 어긋나지 않게)
  function traceStrokePath(ctx, points, W, H, i0, i1) {
    ctx.beginPath();
    ctx.moveTo(points[i0].x * W, points[i0].y * H);
    for (var i = i0 + 1; i <= i1 - 1; i += 1) {
      var p = points[i], q = points[i + 1];
      ctx.quadraticCurveTo(p.x * W, p.y * H, (p.x + q.x) / 2 * W, (p.y + q.y) / 2 * H);
    }
    ctx.lineTo(points[i1].x * W, points[i1].y * H);
  }

  /* v10.11.1 윤곽선 잉크 밑층용 폴리라인 — 점을 곡선 없이 그대로 잇는다.
     밑층은 pf 윤곽과 "같은 기하"여야 한다: 중점 베지어는 예각 모서리를 안쪽으로 깎아서
     꼭짓점까지 가는 pf 윤곽과 어긋나고, 그 틈으로 얇은 가시(감김수 상쇄 조각)가 보였다. */
  function strokePolylineD(points, W, H, i0, i1) {
    if (i1 <= i0 || !points[i0]) return '';
    var d = 'M' + fmtNum(points[i0].x * W) + ' ' + fmtNum(points[i0].y * H);
    for (var i = i0 + 1; i <= i1; i += 1) d += ' L' + fmtNum(points[i].x * W) + ' ' + fmtNum(points[i].y * H);
    return d;
  }
  function tracePolyline(ctx, points, W, H, i0, i1) {
    ctx.beginPath();
    ctx.moveTo(points[i0].x * W, points[i0].y * H);
    for (var i = i0 + 1; i <= i1; i += 1) ctx.lineTo(points[i].x * W, points[i].y * H);
  }

  /* ── B-4. 선택 메뉴 위치: 박스 위쪽 중앙 + 보이는 영역 클램프 ──────────────
     box/menu/area = 페이지 오버레이 로컬 px. area = 오버레이 중 화면에 보이는 사각형
     (페이지가 화면 밖으로 절반 걸쳐 있어도 메뉴는 보이는 쪽에 남게).
     위가 좁으면 아래로, 아래도 좁으면 박스 안쪽에 띄운다. */
  function computeSelMenuPos(box, menu, area, gap) {
    gap = gap === undefined ? 10 : gap;
    var m = 4;
    var minL = area.left + m, maxL = area.left + area.w - menu.w - m;
    var left = box.x + box.w / 2 - menu.w / 2;
    left = maxL < minL ? minL : Math.min(maxL, Math.max(minL, left));
    var placed = 'above';
    var top = box.y - menu.h - gap;
    if (top < area.top + m) {
      var below = box.y + box.h + gap;
      if (below + menu.h <= area.top + area.h - m) { top = below; placed = 'below'; }
      else {
        var lo = area.top + m, hi = area.top + area.h - menu.h - m;
        top = hi < lo ? lo : Math.min(hi, Math.max(lo, box.y + box.h / 2 - menu.h / 2));
        placed = 'inside';
      }
    }
    return { left: left, top: top, placed: placed };
  }

  /* ── 영역선택 크롭 좌표: 정규화 사각형 {x,y,w,h} × 캔버스 실픽셀
     (재원이형 PdfViewer.captureRegion과 동일 규칙: floor/ceil + 경계 클램프) */
  function computeCropRect(sel, canvasW, canvasH) {
    var sx = Math.max(0, Math.floor(sel.x * canvasW));
    var sy = Math.max(0, Math.floor(sel.y * canvasH));
    var sw = Math.max(1, Math.min(canvasW - sx, Math.ceil(sel.w * canvasW)));
    var sh = Math.max(1, Math.min(canvasH - sy, Math.ceil(sel.h * canvasH)));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  // 리사이즈 목표 크기: 최대 변이 maxDim을 넘으면 축소 (확대는 안 함)
  function computeTargetSize(sw, sh, maxDim) {
    var scale = Math.min(1, maxDim / Math.max(1, Math.max(sw, sh)));
    return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)), scale: scale };
  }

  /* ── v3 캔버스 인터랙션 순수부 (올가미/직선 자/핀치줌 — Node 단위테스트 대상) ── */

  // ray casting: 점이 폴리곤 내부인가 (좌표 단위는 일관되기만 하면 됨 — 여기선 0~1 정규화)
  function pointInPolygon(pt, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // annotation 정규화 바운딩 박스 (stroke=점 min/max, rect/text=x,y,w,h — text 기본값은 annotationContains와 동일)
  function annotationBounds(item) {
    if (!item) return null;
    if (item.type === 'stroke') {
      var pts = item.points || [];
      if (!pts.length) return null;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < pts.length; i += 1) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
      }
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }
    if (item.type === 'rect-highlight' || item.type === 'text') {
      var w = item.w !== undefined ? item.w : (item.type === 'text' ? 0.22 : 0);
      var h = item.h !== undefined ? item.h : (item.type === 'text' ? 0.09 : 0);
      return { minX: item.x || 0, minY: item.y || 0, maxX: (item.x || 0) + w, maxY: (item.y || 0) + h };
    }
    return null;
  }

  function listBounds(items) {
    var out = null;
    for (var i = 0; i < (items || []).length; i += 1) {
      var b = annotationBounds(items[i]);
      if (!b) continue;
      if (!out) out = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
      else {
        if (b.minX < out.minX) out.minX = b.minX;
        if (b.minY < out.minY) out.minY = b.minY;
        if (b.maxX > out.maxX) out.maxX = b.maxX;
        if (b.maxY > out.maxY) out.maxY = b.maxY;
      }
    }
    return out;
  }

  // 사각 영역(rect-highlight/text 바운즈) × 올가미 폴리곤 겹침 판정:
  //  · 중심·네 모서리 중 하나가 폴리곤 안 (박스가 올가미에 싸인 경우)
  //  · 또는 올가미 궤적 점이 박스 안 (넓은 형광 박스를 일부만 둘러도 선택 — 중심점만 보던 구 규칙은
  //    중심이 올가미 밖이면 놓쳐서 "스트로크만 복제되는" 현상의 원인이었음)
  function rectPolyOverlap(b, poly) {
    if (!b || !poly || poly.length < 3) return false;
    var probes = [
      { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
      { x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }
    ];
    for (var i = 0; i < probes.length; i += 1) if (pointInPolygon(probes[i], poly)) return true;
    for (var j = 0; j < poly.length; j += 1) {
      if (poly[j].x >= b.minX && poly[j].x <= b.maxX && poly[j].y >= b.minY && poly[j].y <= b.maxY) return true;
    }
    return false;
  }

  // 올가미 선택 판정: stroke=점 과반이 폴리곤 내부, rect/text=박스와 올가미 겹침(rectPolyOverlap)
  function lassoSelect(list, poly) {
    var out = [];
    list = list || [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item) continue;
      if (item.type === 'stroke') {
        var pts = item.points || [];
        if (!pts.length) continue;
        var inCnt = 0;
        for (var k = 0; k < pts.length; k += 1) if (pointInPolygon(pts[k], poly)) inCnt += 1;
        if (inCnt * 2 > pts.length) out.push(item);
      } else if (item.type === 'rect-highlight' || item.type === 'text') {
        if (rectPolyOverlap(annotationBounds(item), poly)) out.push(item);
      }
    }
    return out;
  }

  // 이동 델타 클램프: 선택 전체 bbox가 0~1 페이지 밖으로 못 나가게
  function clampMoveDelta(items, dx, dy) {
    var b = listBounds(items);
    if (!b) return { dx: 0, dy: 0 };
    return {
      dx: Math.max(-b.minX, Math.min(1 - b.maxX, dx)),
      dy: Math.max(-b.minY, Math.min(1 - b.maxY, dy))
    };
  }

  // 이동 적용: 복사본 반환 (id 유지 — 이동은 같은 개체, 좌표는 0~1 클램프)
  //  · 얕은 복사 + points 배열만 새로 생성 (나머지 필드는 전부 원시값이라 공유해도 안전).
  //    구 JSON.parse(JSON.stringify()) 딥카피는 점 많은 획 다중 이동에서 눈에 띄게 느렸음.
  function translateAnnotation(item, dx, dy) {
    var copy = {};
    for (var k in item) if (Object.prototype.hasOwnProperty.call(item, k)) copy[k] = item[k];
    if (copy.type === 'stroke') {
      copy.points = (item.points || []).map(function (pt) {
        return { x: clamp(pt.x + dx), y: clamp(pt.y + dy), pressure: pt.pressure };
      });
    } else {
      copy.x = clamp((copy.x || 0) + dx);
      copy.y = clamp((copy.y || 0) + dy);
    }
    return copy;
  }

  /* ── v10.1 복제 오프셋 ────────────────────────────────────────────────────
     구 구현: 정규화 +0.02 고정 → 페이지를 축소해서 보면 화면상 8~10px밖에 안 움직여
     "복제가 됐는지 모르겠다"는 실기기 피드백(반대로 확대 상태면 과하게 튐).
     새 구현: **화면 픽셀 기준 고정 오프셋(32px)** 을 그때의 페이지 픽셀 크기로 나눠
     정규화로 환산 → 줌 배율·페이지 종횡비와 무관하게 항상 화면에서 같은 거리로 보인다.
     32px 근거: ① 기본 배율(페이지 폭 820px)에서 정규화 0.039 — 요구된 0.04 밴드
       ② 손글씨 한 글자~한 줄 높이 정도라 겹쳐 보이지 않고 즉시 "두 벌"로 인식됨
       ③ 선택 박스 패딩(0.006≈5px)·탭 허용오차(~10px)보다 확연히 큼
       ④ 구 동작 대비 가로 16.4px→32px (약 2배)
     페이지 밖으로 나가면 clampMoveDelta가 안쪽으로 물리고, 그래도 밀 공간이 없으면
     (선택이 페이지 우/하단에 딱 붙음) 반대 방향으로 빼서 원본과 겹치지 않게 한다. */
  function duplicateOffset(items, W, H, basePx) {
    basePx = basePx || 32;
    var nx = Math.min(0.12, basePx / Math.max(1, W || 1));
    var ny = Math.min(0.12, basePx / Math.max(1, H || 1));
    var d = clampMoveDelta(items, nx, ny);
    if (Math.abs(d.dx) < nx * 0.5) {                    // 오른쪽에 여유가 없음 → 왼쪽으로
      var bx = clampMoveDelta(items, -nx, 0);
      if (Math.abs(bx.dx) > Math.abs(d.dx)) d.dx = bx.dx;
    }
    if (Math.abs(d.dy) < ny * 0.5) {                    // 아래에 여유가 없음 → 위로
      var by = clampMoveDelta(items, 0, -ny);
      if (Math.abs(by.dy) > Math.abs(d.dy)) d.dy = by.dy;
    }
    return d;
  }

  /* ── v10.1 앱 내부 클립보드 (복사 → 롱프레스 붙여넣기) ───────────────────
     좌표계: 선택 바운딩 박스의 **좌상단(minX,minY) 기준 상대 정규화 좌표**로 저장.
     → 다른 위치·다른 페이지에 붙여넣어도 요소들 사이 상대 배치(형태)가 그대로 보존.
     clip = { v:1, w, h, items:[annotation(상대좌표)] } — localStorage 직렬화 가능. */
  function makeClipboard(items) {
    items = (items || []).filter(Boolean);
    var b = listBounds(items);
    if (!b) return null;
    return {
      v: 1,
      w: b.maxX - b.minX,
      h: b.maxY - b.minY,
      items: items.map(function (it) { return translateAnnotation(it, -b.minX, -b.minY); })
    };
  }

  /* 클립보드 → 붙여넣기: anchor(롱프레스 지점)가 내용의 **좌상단**이 되게 배치.
     (중심 기준이 아니라 좌상단인 이유: 터치 시 손가락/펜이 붙여넣은 내용을 가리지 않음)
     페이지 밖으로 넘치면 안쪽으로 클램프, 각 요소는 새 id 발급. */
  function pasteClipboard(clip, anchor, newId) {
    if (!clip || !clip.items || !clip.items.length || !anchor) return [];
    var ox = clamp(anchor.x, 0, Math.max(0, 1 - (clip.w || 0)));
    var oy = clamp(anchor.y, 0, Math.max(0, 1 - (clip.h || 0)));
    return clip.items.map(function (it) {
      var c = translateAnnotation(it, ox, oy);
      c.id = newId ? newId() : uid();
      return c;
    });
  }

  /* ── v10.10 직선 모드 각도 처리 ────────────────────────────────────────────
     구(v3~v10.9): 직선 모드는 **항상 15° 스냅**, Shift를 눌러야 자유 각도.
       → iPad·갤탭에는 Shift 키가 없다 = 스냅을 끌 방법이 아예 없었다.
         7°/23° 같은 각도를 그으면 0°/15°/30°로 튀어서 "손이 그은 대로"가 안 됐다.
     신: **기본이 자유 각도**(손이 그은 그대로 직선). 스냅은 Shift를 눌렀을 때만,
         그것도 **1° 격자**로만 건다 (수평 0°·수직 90°·45° 같은 정수 각도를 정확히 물리는 용도).
     15°는 이 파일 어디에도 남기지 않는다. */
  var SNAP_STEP_DEG = 1;

  // 직선 자: 델타(px 기준 — 화면에 보이는 각도)를 stepDeg 단위로 스냅, 길이 보존
  function snapAngle(dx, dy, stepDeg) {
    var len = Math.hypot(dx, dy);
    if (!len) return { dx: 0, dy: 0 };
    var deg = Number(stepDeg);
    if (!isFinite(deg) || deg <= 0) deg = SNAP_STEP_DEG;
    var step = deg * Math.PI / 180;
    var ang = Math.round(Math.atan2(dy, dx) / step) * step;
    return { dx: len * Math.cos(ang), dy: len * Math.sin(ang) };
  }

  /* 자 끝점: 시작~현재를 px 공간에서 스냅(종횡비 보정) 후 정규화로 환원, 0~1 클램프
       snapOn  Shift를 누르고 있는 동안만 true (기본 = false = 자유 각도)
       stepDeg 생략하면 SNAP_STEP_DEG(1°) */
  function computeRulerEnd(start, cur, W, H, snapOn, stepDeg) {
    W = Math.max(1, W); H = Math.max(1, H);
    var dxPx = (cur.x - start.x) * W, dyPx = (cur.y - start.y) * H;
    if (snapOn) {
      var s = snapAngle(dxPx, dyPx, stepDeg === undefined ? SNAP_STEP_DEG : stepDeg);
      dxPx = s.dx; dyPx = s.dy;
    }
    return { x: clamp(start.x + dxPx / W), y: clamp(start.y + dyPx / H) };
  }

  // 자 확정 획: 두 끝점 + 중간 보간점 (필압 균일 — 평균값)
  function rulerLinePoints(start, end, pressure, segments) {
    var n = Math.max(1, segments || 8);
    var pts = [];
    for (var i = 0; i <= n; i += 1) {
      var t = i / n;
      pts.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, pressure: pressure });
    }
    return pts;
  }

  /* 플로팅 툴바 위치 클램프 (v10.2 상단바 침범 방지 + v10.5 필기 패널 밖 이탈 방지)
       pos  {x,y}   툴바 좌상단 (뷰포트 좌표)
       size {w,h}   툴바 크기
       vp   {w,h}   뷰포트 크기
       opts {top, obstacles, margin, area}
         · top       상단 경계 = 상단바(#tb) 바닥. 상단바가 숨겨졌거나 없는 페이지면 0
         · obstacles [{left,right,bottom}] — "가로로 겹칠 때만" 그 아래로 밀어내는 사각형
                     (상단바 숨김 시 뜨는 🔽 복원 버튼 #tbMini용 — 다른 x에선 0까지 올라갈 수 있게)
         · margin    좌/우/아래 여백 (기본 4px)
         · area      {left,top,right,bottom} 툴바가 머무를 수 있는 사각형 (v10.5).
                     좌측 자료(필기) 패널 #left 영역을 넣으면 우측 풀해설 패널을 침범하지 않는다.
                     생략하면 뷰포트 전체 = v10.2까지의 동작 그대로(폴백).
     툴바가 영역보다 크면 좌/상단에 붙여 최소한 잡을 수는 있게 한다. */
  function clampToolbarPos(pos, size, vp, opts) {
    opts = opts || {};
    var m = opts.margin === undefined ? 4 : Math.max(0, opts.margin);
    var w = Math.max(0, (size && size.w) || 0);
    var h = Math.max(0, (size && size.h) || 0);
    var VW = Math.max(0, (vp && vp.w) || 0);
    var VH = Math.max(0, (vp && vp.h) || 0);
    var px = Number(pos && pos.x); if (!isFinite(px)) px = 0;
    var py = Number(pos && pos.y); if (!isFinite(py)) py = 0;

    // 허용 영역 — area가 없으면 뷰포트 전체. area는 항상 뷰포트 안으로 다시 물린다
    // (패널이 화면 밖까지 걸쳐 있어도 툴바는 화면 안에 남아야 잡을 수 있음).
    var aL = 0, aT = 0, aR = VW, aB = VH;
    var area = opts.area;
    if (area) {
      var raw = [Number(area.left), Number(area.top), Number(area.right), Number(area.bottom)];
      aL = clamp(isFinite(raw[0]) ? raw[0] : 0, 0, VW);
      aT = clamp(isFinite(raw[1]) ? raw[1] : 0, 0, VH);
      aR = clamp(isFinite(raw[2]) ? raw[2] : VW, 0, VW);
      aB = clamp(isFinite(raw[3]) ? raw[3] : VH, 0, VH);
      if (aR < aL) aR = aL;
      if (aB < aT) aB = aT;
    }

    var x = clamp(px, aL + m, Math.max(aL + m, aR - w - m));
    var top = Number(opts.top); if (!isFinite(top) || top < 0) top = 0;
    if (top < aT) top = aT;                                // 패널 위쪽(상단바 아래)도 경계
    var obstacles = opts.obstacles || [];
    for (var i = 0; i < obstacles.length; i += 1) {
      var o = obstacles[i];
      if (!o) continue;
      var oL = Number(o.left) || 0, oR = Number(o.right) || 0, oB = Number(o.bottom) || 0;
      if (x < oR && x + w > oL) top = Math.max(top, oB);   // 가로로 겹치는 장애물만 회피
    }
    var y = clamp(py, top, Math.max(top, aB - h - m));
    return { x: x, y: y, top: top };
  }

  /* ── v10.6 숫자 입력칸 파서 (팝오버의 굵기·투명도 직접 입력) ──────────────
     슬라이더 옆 숫자칸은 사람이 아무거나 칠 수 있다는 전제로 만든다.
       · 빈 값 / 공백 / 문자 / "5px" / NaN / Infinity → ok:false (아직 반영하지 않음)
       · 범위 밖(0, 음수, 9999)                       → min/max로 클램프
       · step 격자에 안 맞는 값(굵기 5.3)             → 가장 가까운 격자로 스냅
         (짝이 되는 <input type=range>가 step 격자만 표현할 수 있어서,
          스냅하지 않으면 숫자칸과 슬라이더가 서로 다른 값을 가리키게 된다)
     반환 { ok, value, clamped } — clamped = "친 값과 다르게 고쳤다"(확정 시 칸 표시를 정규화하는 신호). */
  function parseNumField(raw, min, max, step) {
    var s = String(raw === null || raw === undefined ? '' : raw).trim();
    var bad = { ok: false, value: null, clamped: false };
    if (!s || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return bad;
    var n = Number(s);
    if (!isFinite(n)) return bad;
    var lo = Number(min), hi = Number(max), st = Number(step);
    if (!isFinite(lo)) lo = -Infinity;
    if (!isFinite(hi)) hi = Infinity;
    if (hi < lo) hi = lo;
    var v = n;
    if (isFinite(st) && st > 0) {
      var base = isFinite(lo) ? lo : 0;
      v = base + Math.round((v - base) / st) * st;
    }
    v = clamp(v, lo, hi);
    v = Math.round(v * 1000) / 1000;   // 0.1+0.2 류 부동소수 찌꺼기 제거
    return { ok: true, value: v, clamped: v !== n };
  }

  // 핀치줌 앵커 보정: 앵커(뷰포트 px) 아래 콘텐츠 지점이 줌 후에도 같은 자리에 오는 새 scroll 값
  //  before/after = 앵커가 속한 페이지 요소의 (뷰포트 기준) 시작좌표·크기 — HTML 줌 모듈과 동일 산식
  function computeZoomAnchor(scroll, anchor, beforeStart, beforeSize, afterStart, afterSize) {
    var f = beforeSize > 0 ? (anchor - beforeStart) / beforeSize : 0;
    return scroll + (afterStart + f * afterSize) - anchor;
  }

  /* ── 캔버스 합성 렌더 (풀이검사용: PDF 원본 캔버스 위에 필기를 픽셀로 굽기)
     SVG 렌더(§5)와 동일 규칙: 정규화 좌표×W/H, 필압/연필 질감별 세그먼트 굵기.
     ctx(2D 컨텍스트 인터페이스)만 있으면 동작 → Node 목(mock) 테스트 가능 */
  function strokeToCanvas(ctx, item, W, H) {
    var points = item.points || [];
    if (!points.length) return;
    var base = strokeBaseWidth(item, W);
    ctx.save();
    ctx.globalAlpha = (item.opacity === undefined || item.opacity === null) ? 1 : item.opacity;
    ctx.strokeStyle = item.color || '#222';
    ctx.fillStyle = item.color || '#222';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (points.length === 1) {              // 탭 한 번 = 점
      ctx.beginPath();
      ctx.arc(points[0].x * W, points[0].y * H, base / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    /* v10.11 윤곽선 잉크 — 화면과 같은 규칙: 밑층 run(감김수 구멍 차단) + 윤곽 면.
       Path2D 가 없는 옛 브라우저에서만 기존 선 렌더로 폴백. */
    if (useOutlineInk(item) && typeof Path2D !== 'undefined') {
      var od = outlinePathD(points, W, H, item, base, false);
      if (od) {
        var cruns = strokeRuns(item, W, H);
        for (var cr = 0; cr < cruns.length; cr += 1) {
          ctx.lineWidth = cruns[cr].width;
          tracePolyline(ctx, points, W, H, cruns[cr].i0, cruns[cr].i1);
          ctx.stroke();
        }
        ctx.fill(new Path2D(od));
        ctx.restore();
        return;
      }
    }
    // SVG 렌더(§5)와 동일한 구간 분할 + 동일한 이차 베지어 제어점 → 화면과 출력이 일치
    var runs = strokeRuns(item, W, H);
    for (var r = 0; r < runs.length; r += 1) {
      ctx.lineWidth = runs[r].width;
      traceStrokePath(ctx, points, W, H, runs[r].i0, runs[r].i1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function textToCanvas(ctx, item, W, H) {
    var x = item.x * W, y = item.y * H;
    var w = (item.w || 0.25) * W, h = (item.h || 0.09) * H;
    var fontPx = Math.max(10, (item.sizeRatio || 0.018) * W);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,252,.92)';           // 메모 배경 (CSS .annot-text-note 근사)
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = item.color || '#176b4d';
    ctx.fillRect(x, y, 3, h);                          // 왼쪽 컬러 보더
    ctx.fillStyle = item.textColor || '#222222';       // v10.10 메모 글자색 (없으면 구버전 기본색)
    ctx.font = fontPx + 'px "Noto Sans KR", sans-serif';
    ctx.textBaseline = 'top';
    var maxW = Math.max(10, w - 14);
    var lineH = fontPx * 1.45;
    var lines = [];
    var paras = String(item.text || '').split('\n');
    for (var pi = 0; pi < paras.length && lines.length < 60; pi += 1) {
      var cur = '';
      for (var ci = 0; ci < paras[pi].length; ci += 1) {
        var next = cur + paras[pi][ci];
        if (cur && ctx.measureText && ctx.measureText(next).width > maxW) { lines.push(cur); cur = paras[pi][ci]; }
        else cur = next;
      }
      lines.push(cur);
    }
    for (var li = 0; li < lines.length; li += 1) {
      var ty = y + 4 + li * lineH;
      if (ty + lineH > y + h) break;                   // 박스 밖은 잘라냄 (overflow:hidden 근사)
      ctx.fillText(lines[li], x + 7, ty);
    }
    ctx.restore();
  }

  function renderAnnotationsToCanvas(ctx, list, W, H) {
    list = list || [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (!item) continue;
      if (item.type === 'stroke') strokeToCanvas(ctx, item, W, H);
      else if (item.type === 'rect-highlight') {
        ctx.save();
        ctx.globalAlpha = item.opacity === undefined ? 0.28 : item.opacity;
        ctx.fillStyle = item.color || '#FFE66D';
        ctx.fillRect(item.x * W, item.y * H, (item.w || 0) * W, (item.h || 0) * H);
        ctx.restore();
      } else if (item.type === 'text') textToCanvas(ctx, item, W, H);
    }
  }

  var PURE = {
    clamp: clamp,
    pointSegmentDistance: pointSegmentDistance,
    strokeHit: strokeHit,
    splitStroke: splitStroke,
    annotationContains: annotationContains,
    measureTextBox: measureTextBox,        // v10.10 텍스트 메모 실측 박스 (재원이형 이식)
    pickAnnotationAt: pickAnnotationAt,    // v10.10 탭으로 개체 하나 집기 (재원이형 이식)
    isLegacyStroke: isLegacyStroke,
    convertLegacyStroke: convertLegacyStroke,
    normalizeInkPage: normalizeInkPage,
    shiftPageKeys: shiftPageKeys,          // v4 빈 페이지 삽입 — 페이지 키 시프트
    // 영역선택/풀이검사용 (v2)
    pencilSeed: pencilSeed,
    pfGetStroke: function (pts, opts) { return PF.getStroke(pts, opts); },   // v10.11.1 윤곽선 폭 검증용 (PF 는 아래에서 정의 — 지연 참조)
    outlinePathD: outlinePathD,
    jitter: jitter,
    strokeBaseWidth: strokeBaseWidth,
    // v10.3 필기감 파이프라인 (EMA 스무딩 / 호길이 질감 / 베지어 경로 / 굵기 병합)
    SMOOTH_ALPHA: SMOOTH_ALPHA,
    PRESSURE_ALPHA: PRESSURE_ALPHA,
    MIN_STEP_PX: MIN_STEP_PX,
    EMA_REF_STEP_PX: EMA_REF_STEP_PX,
    smoothAlphaFor: smoothAlphaFor,
    emaAlphaForStep: emaAlphaForStep,
    emaPoint: emaPoint,
    smoothPointStream: smoothPointStream,
    pencilPeriodPx: pencilPeriodPx,
    pencilTexture: pencilTexture,
    widthQuantStep: widthQuantStep,
    quantizeWidth: quantizeWidth,
    segmentRawWidth: segmentRawWidth,
    isSegmentedStroke: isSegmentedStroke,
    strokeRuns: strokeRuns,
    pathStart: pathStart,
    pathAdd: pathAdd,
    pathTail: pathTail,
    strokePathD: strokePathD,
    traceStrokePath: traceStrokePath,
    computeSelMenuPos: computeSelMenuPos,   // B-4 선택 메뉴 위치 (박스 위 중앙 + 화면 클램프)
    computeCropRect: computeCropRect,
    computeTargetSize: computeTargetSize,
    renderAnnotationsToCanvas: renderAnnotationsToCanvas,
    // v3 캔버스 인터랙션 (올가미 / 직선 자 / 핀치줌 앵커)
    pointInPolygon: pointInPolygon,
    annotationBounds: annotationBounds,
    listBounds: listBounds,
    rectPolyOverlap: rectPolyOverlap,
    lassoSelect: lassoSelect,
    clampMoveDelta: clampMoveDelta,
    translateAnnotation: translateAnnotation,
    duplicateOffset: duplicateOffset,      // v10.1 복제 오프셋 (화면 px 기준 → 정규화)
    makeClipboard: makeClipboard,          // v10.1 복사: 바운딩박스 좌상단 기준 상대좌표
    pasteClipboard: pasteClipboard,        // v10.1 붙여넣기: anchor=좌상단 + 페이지 클램프
    SNAP_STEP_DEG: SNAP_STEP_DEG,          // v10.10 직선 모드 Shift 스냅 격자 (1°)
    snapAngle: snapAngle,
    computeRulerEnd: computeRulerEnd,
    rulerLinePoints: rulerLinePoints,
    computeZoomAnchor: computeZoomAnchor,
    clampToolbarPos: clampToolbarPos,     // v10.2 툴바 드래그 경계 (상단바 침범 방지)
    parseNumField: parseNumField          // v10.6 팝오버 숫자 입력칸 파싱·클램프
  };

  // Node 단위테스트: require('annotation.js') 하면 순수 함수만 노출하고 종료 (DOM 코드 미실행)
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; return; }
  if (typeof document === 'undefined') { return; }

  /* ═══ 2. 상태 ═══════════════════════════════════════════════════════════ */

  var LS = {
    settings: 'annot-settings-v1',
    presets: 'annot-presets-v1',
    pos: 'annot-toolbar-pos-v1',
    collapsed: 'annot-toolbar-collapsed-v1',
    clip: 'annot-clipboard-v1'     // v10.1 올가미 복사 클립보드 (새로고침·다른 문서까지 유지)
  };

  function loadJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return (v === null || v === undefined) ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // straight: v10.5 — 직선(자) 모드는 도구 버튼이 아니라 **펜별 설정**이다 (프리셋 재탭 팝오버에서 토글)
  var DEFAULT_PRESETS = [
    { id: 'pen-black',  tool: 'pen',         color: '#1e2320', width: 3,   opacity: 1,    label: '검정 펜',     straight: false },
    { id: 'pen-red',    tool: 'pen',         color: '#d94c4c', width: 3,   opacity: 1,    label: '빨강 펜',     straight: false },
    { id: 'pen-blue',   tool: 'pen',         color: '#3169d8', width: 3,   opacity: 1,    label: '파랑 펜',     straight: false },
    { id: 'pencil',     tool: 'pencil',      color: '#5b6270', width: 2.5, opacity: 0.85, label: '연필',        straight: false },
    { id: 'high-yellow',tool: 'highlighter', color: '#FFE25B', width: 22,  opacity: 0.32, label: '노랑 형광펜', straight: false },
    { id: 'high-green', tool: 'highlighter', color: '#7DDC9C', width: 22,  opacity: 0.3,  label: '초록 형광펜', straight: false }
  ];

  var savedSettings = loadJSON(LS.settings, {});
  var S = {
    doc: null,                 // 잉크 파일명 키 (cacheKey()와 동일 규칙)
    pages: {},                 // pageNum -> [annotation]
    enabled: false,            // 필기 모드 (off면 오버레이 pointer-events:none — 기존 기능 방해 금지)
    tool: savedSettings.tool || 'pen',
    lastDrawTool: savedSettings.lastDrawTool || 'pen',
    activePresetId: savedSettings.activePresetId || 'pen-black',
    penSettings: savedSettings.penSettings || { color: '#1e2320', width: 3, opacity: 1 },
    fingerDraw: !!savedSettings.fingerDraw,
    pressureEnabled: savedSettings.pressureEnabled !== false,
    inkOutline: savedSettings.inkOutline !== false,   // v10.11 윤곽선 잉크 (기본 켬 · 끄면 예전 렌더)
    rulerOn: !!savedSettings.rulerOn,     // 직선 모드(구 📏 자): 켜면 펜/형광펜/연필이 직선으로 (자유 각도, Shift=1° 스냅)
                                          // v10.5 — 값의 주인은 "현재 프리셋의 straight". 여기엔 그 사본이 산다
    eraserMode: savedSettings.eraserMode === 'eraser-partial' ? 'eraser-partial' : 'eraser-line',  // v10.5 지우개 통합 버튼의 현재 모드
    eraserSticky: !!savedSettings.eraserSticky,   // v10.5 지우개 고정(끄면 1회 지우고 펜 복귀)
    loadSeq: 0
  };
  var presets = loadJSON(LS.presets, null) || DEFAULT_PRESETS.map(function (p) { var c = {}; for (var k in p) c[k] = p[k]; return c; });

  /* v10.5 저장된 상태 이관 (툴바 정리로 사라진 도구가 남아 있을 수 있다)
       · rect-highlight(▭ 네모 형광펜): 버튼이 없어져 켜져 있어도 끌 수가 없다 → 펜으로
       · 지우개: 마지막으로 쓰던 종류를 통합 버튼의 현재 모드로 맞춰 준다
       · 직선 모드: 구버전은 전역 rulerOn만 저장했다 → 지금 프리셋의 straight로 옮겨 심는다 */
  (function migrateSavedState() {
    if (S.tool === 'rect-highlight') S.tool = (S.lastDrawTool && S.lastDrawTool !== 'rect-highlight') ? S.lastDrawTool : 'pen';
    if (S.lastDrawTool === 'rect-highlight') S.lastDrawTool = 'pen';
    if (String(S.tool).indexOf('eraser') === 0) S.eraserMode = S.tool;
    var active = null;
    for (var i = 0; i < presets.length; i += 1) if (presets[i].id === S.activePresetId) active = presets[i];
    if (active) {
      // 구버전(전역 자) → 지금 쓰던 펜의 직선 모드로 1회 이관
      if (active.straight === undefined) active.straight = !!(savedSettings.eraserMode === undefined && S.rulerOn);
      S.rulerOn = !!active.straight;        // 이후로는 항상 "현재 펜의 값"이 진실
    }
  })();

  var overlays = new Map();      // pageNum -> {root, svg, filled, pageDiv}
  var undoStacks = new Map();    // pageNum -> [deepCopy snapshot, ...] (최대 60)
  var redoStacks = new Map();
  var HISTORY_MAX = 60;
  var pageSizeCache = new Map(); // pageNum -> {w,h} (pdf.js scale=1 viewport — 레거시 변환용)
  var lastActivePage = null;     // 마지막으로 필기 입력이 있었던 페이지 (undo/redo 대상)
  var gesture = null;            // 진행 중 입력 제스처
  var touchDownCount = 0;        // #left 위 동시 터치 수 (§9에서 갱신 — 2개↑면 새 필기 시작 금지=핀치 양보)

  function persistSettings() {
    saveJSON(LS.settings, {
      tool: S.tool, lastDrawTool: S.lastDrawTool, activePresetId: S.activePresetId,
      penSettings: S.penSettings, fingerDraw: S.fingerDraw, pressureEnabled: S.pressureEnabled,
      rulerOn: S.rulerOn, eraserMode: S.eraserMode, eraserSticky: S.eraserSticky,
      inkOutline: S.inkOutline
    });
  }
  function persistPresets() { saveJSON(LS.presets, presets); }

  /* v9 전역(let 바인딩은 같은 전역 스코프에서 접근 가능)을 안전하게 읽기 */
  function getCurP() { try { return (typeof curP !== 'undefined' && curP) || 1; } catch (e) { return 1; } }
  function getPdfDoc() { try { return (typeof pdfDoc !== 'undefined') ? pdfDoc : null; } catch (e) { return null; } }
  function getGlobalPageSize() {
    try {
      return {
        w: (typeof globalPdfWidth !== 'undefined' && globalPdfWidth) || 820,
        h: (typeof globalPdfHeight !== 'undefined' && globalPdfHeight) || 1160
      };
    } catch (e) { return { w: 820, h: 1160 }; }
  }
  function toast(msg, sticky) { try { if (typeof showToast === 'function') showToast(msg, sticky); } catch (e) {} }
  function activatePage(p) { try { if (typeof setActivePage === 'function') setActivePage(p); } catch (e) {} }

  /* ═══ 3. 도구 레지스트리 (확장 가능 — 영역선택/올가미가 여기 등록될 예정) ═══ */

  var toolRegistry = {};
  function registerTool(id, def) { toolRegistry[id] = def || {}; }

  registerTool('pen',            { kind: 'draw',  cursor: 'crosshair' });
  registerTool('highlighter',    { kind: 'draw',  cursor: 'crosshair' });
  registerTool('pencil',         { kind: 'draw',  cursor: 'crosshair' });
  registerTool('rect-highlight', { kind: 'rect',  cursor: 'crosshair' });
  registerTool('eraser-line',    { kind: 'erase', cursor: 'cell' });
  registerTool('eraser-partial', { kind: 'erase', cursor: 'cell' });
  registerTool('text',           { kind: 'text',  cursor: 'text' });

  /* ═══ 4. CSS 주입 (v9 테마 변수 사용 — 3종 테마와 자동 조화) ═════════════ */

  (function injectCss() {
    var css = ''
      + '.annot-layer{position:absolute;inset:0;z-index:15;pointer-events:none;}'
      + 'body.annot-on .annot-layer{pointer-events:auto;cursor:crosshair;}'
      + 'body.annot-on[data-annot-tool="eraser-line"] .annot-layer,'
      + 'body.annot-on[data-annot-tool="eraser-partial"] .annot-layer{cursor:cell;}'
      + 'body.annot-on[data-annot-tool="text"] .annot-layer{cursor:text;}'
      + '.annot-layer svg{width:100%;height:100%;display:block;pointer-events:none;}'
      + '.annot-text-note{box-sizing:border-box;width:100%;height:100%;overflow:hidden;background:rgba(255,255,252,.92);'
      +   'border-left:3px solid #176b4d;border-radius:4px;padding:4px 7px;color:#222;line-height:1.45;'
      +   'white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 5px rgba(0,0,0,.14);font-family:"Noto Sans KR",sans-serif;}'
      /* ── 플로팅 툴바 ── */
      /* 재원이형 툴바 이식 — 다크 알약. 밝은 배경 위 어디에 놓여도 도구가 도구로 읽힌다.
         ★ flex-wrap:wrap 을 버렸다. 두 줄로 접히면 자료를 가리는 면적이 배로 늘고
           버튼 위치가 그때그때 달라져 손이 기억을 못 한다. 대신 넘치면 가로로 민다. */
      + '#annotBar{position:fixed;display:flex;align-items:center;gap:1px;background:#242724;border:none;'
      +   'border-radius:14px;box-shadow:0 8px 25px rgba(0,0,0,.27);padding:3px 7px 3px 4px;z-index:9990;'
      +   'user-select:none;-webkit-user-select:none;touch-action:none;max-width:min(96vw,calc(100vw - 18px));'
      +   'flex-wrap:nowrap;color:#ecefec;}'
      /* 한 줄이 기본이지만, 자료 패널이 좁아 못 담을 땐 예전처럼 두 줄로 떨어뜨린다.
         가로 스크롤로 두면 아이패드 세로 분할(패널 ~416px)에서 도구의 3분의 1이 숨어
         "없어진 것"처럼 보였다 — 안 보이는 것보다 두 줄이 낫다. */
      + '#annotBar.annot-wrap{flex-wrap:wrap;row-gap:2px;}'
      + '#annotBar::-webkit-scrollbar{display:none;}'
      /* 전체화면 시트(모달)가 떠 있는 동안 표시만 숨김 — setToolbarHidden() */
      + '#annotBar.annot-hidden{display:none !important;}'
      /* v10.5 필기 영역(#left)이 아예 없는 보기 모드("풀해설만")에서는 툴바를 숨김 */
      + '#annotBar.annot-nopanel{display:none !important;}'
      + '#annotBar .annot-btn{position:relative;min-width:31px;height:31px;padding:0 5px;border-radius:7px;border:none;background:transparent;'
      +   'font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;'
      +   'color:#ecefec;font-family:inherit;flex:none;}'
      + '#annotBar .annot-btn svg{width:16px;height:16px;display:block;pointer-events:none;}'
      /* v10.5 1회용(one-shot) 표식 — 이 도구를 쓰고 나면 자동으로 펜으로 돌아온다 */
      + '#annotBar .annot-btn.annot-oneshot::after{content:"↩";position:absolute;right:1px;top:0;font-size:9px;line-height:1;'
      +   'color:#f5cf44;opacity:.95;pointer-events:none;}'
      + '#annotBar .annot-btn.active.annot-oneshot::after{color:#c07a00;}'
      + '#annotBar .annot-btn:hover{background:#3b403b;}'
      /* 켜진 도구는 흰 알약 — 어두운 바탕에서 가장 확실한 "지금 이것" 신호 */
      + '#annotBar .annot-btn.active{background:#fff;color:#1f3763;box-shadow:none;}'
      + '#annotBar .annot-btn:disabled{opacity:.3;cursor:default;background:transparent;}'
      + '#annotBar .annot-drag{cursor:grab;color:#aeb5ae;width:25px;min-width:25px;touch-action:none;}'
      + '#annotBar .annot-drag:active{cursor:grabbing;}'
      + '#annotBar .annot-sep{width:1px;height:22px;background:#4a504a;margin:0 2px;flex-shrink:0;}'
      /* v10.9 펼침(상세) 상태의 그룹 나누기: 1px 선 → 여백.
         버튼 20개가 1px 선으로만 갈려 있어 "덩어리"가 눈에 안 잡혔다. 선을 지우고 틈을 벌리면
         (근접성) 개수를 안 줄여도 묶음으로 읽힌다. 선을 같이 두면 오히려 요소가 하나 더 느는 셈.
         ★ 접힘(간단) 상태는 손대지 않는다 — 지금 좋다는 피드백. 위 규칙이 그대로 남아 1px 선 유지. */
      /* 다크 알약에서는 1px 선이 오히려 또렷해 묶음이 잘 읽힌다 — 상세에서도 선을 남긴다 */
      + '#annotModeBtn{font-size:12px;font-weight:600;padding:0 10px;border-radius:8px;gap:5px;}'
      + '#annotModeBtn.on{background:#f5cf44;color:#242724;}'
      + '#annotModeBtn.on:hover{background:#ffdc5e;}'
      + '#annotModeBtn svg{width:15px;height:15px;}'
      + '#annotBar.collapsed > *{display:none;}'
      + '#annotBar.collapsed .annot-expand{display:flex;width:36px;height:36px;border-radius:10px;color:#f5cf44;}'
      + '#annotBar.collapsed .annot-expand svg{width:19px;height:19px;}'
      + '#annotBar:not(.collapsed) .annot-expand{display:none;}'
      /* v10.6 접힘(간단) 상태에 남길 것들 — .annot-simple 을 단 자식만 살아남는다.
         (프리셋 묶음은 인라인 display:flex 때문에 우연히 살아 있었다. 이제 규칙으로 명시)
         지우개는 "필기하다 바로 지운다"가 가장 잦은 동작이라 간단 상태에도 반드시 필요.
         대신 간단 상태에선 여백을 조금 줄여(gap/padding) 가로 길이가 덜 늘어나게 한다. */
      + '#annotBar.collapsed{gap:2px;padding:5px 6px;}'
      + '#annotBar.collapsed > .annot-simple{display:flex;}'
      + '#annotBar.collapsed > span.annot-simple.annot-sep{display:block;margin:0 2px;}'
      /* 프리셋 버튼: 펜=원, 연필=점선 원, 형광=넓은 사각 */
      /* 펜촉 모양 프리셋 (재원이형 툴바) — 동그라미보다 "무슨 펜인지"가 먼저 읽힌다.
         색은 --pc, 아래 밴드 두께는 --pw 로 굵기를 눈에 보이게 한다. */
      + '.annot-preset{position:relative;width:24px;height:31px;border:none;background:transparent;border-radius:6px;'
      +   'cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;padding:0;}'
      + '.annot-preset:hover{background:rgba(255,255,255,.14);}'
      + '.annot-preset.active{background:rgba(255,255,255,.22);}'
      + '.annot-preset .dot{position:relative;display:block;width:9px;height:23px;background:var(--pc,#333);'
      +   'clip-path:polygon(20% 0,80% 0,100% 75%,50% 100%,0 75%);'
      +   'box-shadow:inset 0 0 0 1px rgba(255,255,255,.42);}'   /* 검정 펜이 어두운 바탕에 묻히지 않게 */
      + '.annot-preset .dot::after{content:"";position:absolute;left:1px;right:1px;bottom:3px;'
      +   'height:var(--pw,2px);background:rgba(255,255,255,.55);}'
      /* 연필은 심이 가늘고 흐리게, 형광펜은 넓은 사각 촉 */
      + '.annot-preset.k-pencil .dot{width:8px;opacity:.8;}'
      + '.annot-preset.k-highlighter .dot{width:14px;clip-path:polygon(14% 0,86% 0,100% 66%,100% 100%,0 100%,0 66%);}'
      + '.annot-preset.active::after{content:"";position:absolute;left:5px;right:5px;bottom:1px;'
      +   'height:2.5px;border-radius:2px;background:#fff;}'
      /* v10.5 직선 모드가 켜진 펜 표식 (구 📏 자 버튼 대체) */
      + '.annot-preset-add{min-width:24px;width:24px;height:31px;color:#9aa39a;}'
      + '.annot-preset-add:hover{color:#ecefec;background:rgba(255,255,255,.14);}'
      + '.annot-preset-add svg{width:14px;height:14px;}'
      + '.annot-preset.straight::before{content:"";position:absolute;top:2px;right:0;width:10px;height:2px;'
      +   'border-radius:1px;background:#f5cf44;transform:rotate(-38deg);}'
      /* 저장 실패 알림 (v10.5 — 툴바의 상시 저장 배지는 제거, 실패했을 때만 뜨는 재시도 버튼) */
      + '#annotSaveErr{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:9991;display:none;'
      +   'align-items:center;gap:8px;padding:8px 14px;border-radius:10px;border:none;cursor:pointer;'
      +   'background:var(--red,#d94c4c);color:#fff;font-family:inherit;font-size:12px;'
      +   'box-shadow:0 8px 24px rgba(0,0,0,.28);}'
      + '#annotSaveErr.show{display:flex;}'
      + '#annotSaveErr:hover{filter:brightness(1.07);}'
      /* 팝오버 (프리셋 굵기 / 설정) */
      + '.annot-pop{position:fixed;z-index:9992;background:var(--s);border:1px solid var(--bd2);border-radius:11px;'
      +   'box-shadow:0 10px 30px rgba(0,0,0,.22);padding:11px 13px;display:flex;flex-direction:column;gap:9px;'
      +   'min-width:210px;max-width:min(92vw,322px);font-size:12px;color:var(--tx-mid);}'
      /* 폭을 묶지 않으면 슬라이더가 팝오버를 700px 까지 늘려 색칸이 손톱만 한 게 아니라
         손바닥만 해진다. 재원이형 조절판(238px)과 비슷한 자리에 세운다. */
      + '.annot-pop label{display:flex;align-items:center;gap:7px;justify-content:space-between;}'
      /* #5 재원이형 조절판 — 머리줄(색 점·이름·직선·삭제) */
      + '.annot-pop-head{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:2px;}'
      + '.annot-pop-head b{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--tx);font-weight:700;}'
      + '.annot-pop-head b i{width:13px;height:13px;border-radius:4px;border:1px solid var(--bd);display:block;}'
      + '.annot-pop-head .hd-right{display:flex;align-items:center;gap:6px;}'
      + '.annot-pop-del{border:1px solid #edd4d4;background:transparent;color:var(--red,#c0392b);'
      +   'font-size:11px;cursor:pointer;padding:4px 9px;border-radius:6px;font-family:inherit;}'
      + '.annot-pop-del:hover{background:#fbeeee;}'
      /* 펜 / 형광펜 타입 전환 */
      + '.annot-typesw{display:flex;gap:5px;}'
      + '.annot-typesw button{flex:1;padding:7px 0;border-radius:8px;background:var(--s2);color:var(--tx-dim);'
      +   'font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid var(--bd);font-family:inherit;'
      +   'display:flex;align-items:center;justify-content:center;gap:5px;}'
      + '.annot-typesw button svg{width:15px;height:15px;}'
      + '.annot-typesw button.on{background:var(--ac);color:#fff;border-color:var(--ac);}'
      /* 색 팔레트 — 전체 화면 색상 대화상자를 거치지 않고 여기서 고른다 */
      + '.annot-swatches{display:grid;grid-template-columns:repeat(6,26px);gap:6px;justify-content:space-between;}'
      + '.annot-swatches button{width:26px;height:26px;border-radius:7px;border:2px solid rgba(0,0,0,.08);'
      +   'cursor:pointer;padding:0;}'
      + '.annot-swatches button.on{border-color:var(--ac-d);outline:2px solid var(--s);outline-offset:-4px;}'
      + '.annot-swatches .sw-custom{position:relative;overflow:hidden;'
      +   'background:conic-gradient(#f36352,#e8b93c,#57b46a,#3f8ad6,#8a6fd6,#f36352);}'
      + '.annot-swatches .sw-custom input{position:absolute;inset:0;opacity:0;width:100%;height:100%;'
      +   'padding:0;border:0;cursor:pointer;}'
      /* 굵기 −/＋ */
      + '.annot-step{width:22px;height:22px;border-radius:6px;background:var(--s2);border:1px solid var(--bd);'
      +   'color:var(--tx-mid);font-size:13px;line-height:1;cursor:pointer;padding:0;flex:none;font-family:inherit;}'
      + '.annot-step:hover{background:var(--ac-l);color:var(--ac-d);border-color:var(--ac);}'
      + '.annot-pop-sub{font-size:11px;color:var(--tx-dim);font-weight:700;margin-bottom:-3px;}'
      + '.annot-straight-lb{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--tx-mid);}'
      + '.annot-straight-lb svg{width:13px;height:13px;}'
      + '.annot-pop label span.val{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--tx-dim);min-width:34px;text-align:right;}'
      + '.annot-pop input[type=range]{flex:1;min-width:80px;accent-color:var(--ac);}'
      + '.annot-pop label{flex-wrap:wrap;row-gap:4px;}'
      /* v10.6 숫자 직접 입력칸 — 슬라이더로는 iPad에서 "정확히 5px"을 맞추기 어렵다.
         구 <span class="val">5px</span> 자리를 그대로 이어받아(폭·정렬 유지) 편집 가능한 칸으로 바꿨다. */
      + '.annot-pop .annot-num{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;}'
      /* font-size는 16px 고정 — iOS Safari는 16px 미만 입력칸에 포커스가 가면 페이지를 확대해 버린다
         (앱의 viewport meta에 maximum-scale이 없어 CSS로 막을 방법이 이것뿐). 터치 타깃도 같이 커진다. */
      + '.annot-pop .annot-num input{width:56px;min-width:0;text-align:right;padding:2px 5px;'
      +   'font-family:"IBM Plex Mono",monospace;font-size:16px;line-height:1.25;color:var(--tx-mid);'
      +   'background:var(--s2);border:1px solid var(--bd);border-radius:6px;touch-action:manipulation;}'
      + '.annot-pop .annot-num input:focus{outline:none;border-color:var(--ac);background:var(--s);}'
      + '.annot-pop .annot-num u{font-style:normal;text-decoration:none;font-size:10px;color:var(--tx-dim);}'
      + '.annot-pop input[type=color]{width:34px;height:24px;border:1px solid var(--bd);border-radius:5px;padding:0;background:none;cursor:pointer;}'
      + '.annot-pop input[type=checkbox]{accent-color:var(--ac);}'
      + '.annot-pop .toggle{justify-content:flex-start;cursor:pointer;}'
      + '.annot-pop button{border:1px solid var(--bd2);background:transparent;color:var(--ac);border-radius:7px;'
      +   'padding:5px 9px;font-size:11.5px;cursor:pointer;font-family:inherit;}'
      + '.annot-pop button:hover{background:var(--ac-l);}'
      + '.annot-pop .annot-pop-title{font-size:11px;color:var(--tx-dim);font-weight:500;}'
      + '.annot-pop .annot-pop-hint{font-size:10.5px;color:var(--tx-dim);line-height:1.5;}'
      /* v10.9 구 툴바 ＋ 버튼의 새 자리 — 팝오버 맨 아래 가로 꽉 채운 줄 */
      + '.annot-pop .annot-pop-add{width:100%;justify-content:center;margin-top:1px;}'
      /* v10.5 팝오버 안 2지선다 (지우개 종류) — 아이콘+글자, 선택된 쪽 강조 */
      + '.annot-pop .annot-seg{display:flex;gap:5px;}'
      + '.annot-pop .annot-seg button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;'
      +   'padding:7px 6px;font-size:11.5px;color:var(--tx-mid);}'
      + '.annot-pop .annot-seg button.on{background:var(--ac-l);color:var(--ac-d);border-color:var(--ac);}'
      + '.annot-pop .annot-seg button svg{width:15px;height:15px;}'
      /* v10.5 스위치 (직선 모드 / 지우개 고정) */
      + '.annot-pop .annot-switch{width:38px;height:21px;border-radius:11px;border:1px solid var(--bd2);'
      +   'background:var(--s2);position:relative;padding:0;cursor:pointer;flex:0 0 auto;transition:background .15s;}'
      + '.annot-pop .annot-switch i{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;'
      +   'background:var(--tx-dim);transition:transform .15s,background .15s;}'
      + '.annot-pop .annot-switch.on{background:var(--ac);border-color:var(--ac);}'
      + '.annot-pop .annot-switch.on i{transform:translateX(17px);background:#fff;}'
      /* ── 올가미 선택 (v3 → v10.3 현대화) ──
         · marching ants: 점선이 흐르는 애니메이션 (SVG stroke-dashoffset — div 테두리로는 불가)
         · vector-effect:non-scaling-stroke → viewBox를 늘려도 선 굵기·점선 간격이 화면 px 고정
         · prefers-reduced-motion 존중 (멀미·주의분산 접근성) */
      + '@keyframes annot-ants{to{stroke-dashoffset:-14;}}'
      + '@keyframes annot-sel-in{from{opacity:0;transform:scale(.985);}to{opacity:1;transform:scale(1);}}'
      + '.annot-lasso-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:7;overflow:visible;}'
      /* 재원이형 select 도구와 같게 — 채우지 않고 지나온 점선만 남긴다.
         polygon 은 끝점을 시작점으로 자동으로 이어 버려서, 손이 아직 안 지난 곳까지
         면으로 칠해졌다(첫 점이 중심처럼 고정돼 보이던 원인). polyline 은 그리지 않는다. */
      + '.annot-lasso-svg polyline{fill:none;stroke:var(--ac,#3b5fe2);stroke-width:1.8;'
      +   'stroke-dasharray:8 6;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;'
      +   'animation:annot-ants 700ms linear infinite;}'
      /* 선택 박스: 헤일로(굵고 흐린 밑선) + 흐르는 점선 */
      + '.annot-sel-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8;overflow:visible;}'
      + '.annot-sel-halo{fill:rgba(31,55,99,.05);stroke:var(--ac,#3b5fe2);stroke-width:4;stroke-opacity:.14;'
      +   'vector-effect:non-scaling-stroke;}'
      + '.annot-sel-ants{fill:none;stroke:var(--ac,#3b5fe2);stroke-width:1.7;stroke-dasharray:8 6;'
      +   'vector-effect:non-scaling-stroke;animation:annot-ants 700ms linear infinite;}'
      /* 선택된 획 하이라이트 / 이동 중 "들어올림" */
      + '.annot-svg g.annot-sel-on{filter:drop-shadow(0 0 3px var(--ac,#3b5fe2));}'
      + '.annot-svg g.annot-sel-lift{opacity:.72;filter:drop-shadow(2px 5px 7px rgba(0,0,0,.34));}'
      + '@media (prefers-reduced-motion:reduce){.annot-sel-ants,.annot-lasso-svg polyline{animation:none;}'
      +   '.annot-sel-menu{animation:none;}}'
      + 'body.annot-on[data-annot-tool="lasso"] .annot-layer{cursor:crosshair;}'
      /* 선택 메뉴: 아이콘 버튼 + title 툴팁 (구 이모지+텍스트 라벨 대체), 박스 위쪽 중앙 배치 */
      + '.annot-sel-menu{position:absolute;z-index:40;display:flex;align-items:center;gap:1px;background:var(--s);'
      +   'border:1px solid var(--bd2);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.26);'
      +   'padding:4px;pointer-events:auto;white-space:nowrap;animation:annot-sel-in 120ms ease-out;}'
      /* touch-action:manipulation = iOS의 더블탭 확대 대기(=탭 지연)를 없앤다. 오버레이가 touch-action:none이라
         메뉴도 물려받는데, 그러면 탭 판정이 오히려 까다로워져 "눌렀는데 안 먹는" 느낌이 난다. */
      + '.annot-sel-menu button{width:32px;height:32px;padding:0;border:none;background:transparent;color:var(--tx-mid);'
      +   'border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;'
      +   'touch-action:manipulation;-webkit-tap-highlight-color:transparent;}'
      + '.annot-sel-menu button:active{background:var(--ac-l);}'   /* 눌린 순간 피드백 — 먹었는지 눈으로 확인 */
      + '.annot-sel-menu button:hover{background:var(--s2);color:var(--ac-d);}'
      + '.annot-sel-menu button.danger:hover{background:rgba(217,76,76,.15);color:#d94c4c;}'
      + '.annot-sel-menu button svg{display:block;pointer-events:none;}'
      + '.annot-sel-menu .annot-sel-sep{width:1px;height:18px;background:var(--bd);margin:0 3px;flex-shrink:0;}'
      /* v10.9 메모 글자크기 스테퍼 — [−][숫자][＋] */
      + '.annot-sel-menu .annot-sel-size{display:flex;align-items:center;gap:1px;flex-shrink:0;}'
      + '.annot-sel-menu .annot-sel-step{width:26px;height:32px;font-size:15px;line-height:1;color:var(--tx-mid);}'
      /* 입력칸 font-size는 16px 고정 — iOS는 16px 미만 입력칸에 포커스가 가면 페이지를 확대해 버린다 */
      + '.annot-sel-menu .annot-sel-size input{width:44px;height:26px;box-sizing:border-box;text-align:center;'
      +   'border:1px solid var(--bd);border-radius:6px;background:var(--s2);color:var(--tx-mid);'
      +   'font-family:"IBM Plex Mono",monospace;font-size:16px;padding:0 2px;outline:none;'
      +   '-moz-appearance:textfield;touch-action:manipulation;}'
      + '.annot-sel-menu .annot-sel-size input::-webkit-outer-spin-button,'
      + '.annot-sel-menu .annot-sel-size input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}'
      + '.annot-sel-menu .annot-sel-size input:focus{border-color:var(--ac);background:var(--s);}'
      + '.annot-sel-menu .annot-sel-count{font-size:11px;font-family:"IBM Plex Mono",monospace;color:var(--tx-dim);'
      +   'padding:0 7px 0 5px;letter-spacing:.02em;}'
      + '.annot-sel-menu .annot-sel-label{font-size:12px;color:var(--tx-mid);padding:0 9px 0 3px;}'
      /* ── v10.10 인라인 텍스트 메모 편집기 (재원이형 수정본-2 inline-text-editor 이식) ──
         구: window.prompt() — iPad에서 시스템 대화상자가 화면을 덮어 문서가 안 보이고,
             줄바꿈도 못 넣고, 글자 크기·색도 고를 수 없었다.
         신: 탭한 자리에 바로 textarea가 뜨고, 화면 아래 바에서 크기·색을 고른다. */
      + '.annot-text-edit{position:absolute;z-index:42;min-width:130px;max-width:76%;pointer-events:auto;}'
      + '.annot-text-edit textarea{display:block;width:100%;box-sizing:border-box;min-height:2.4em;'
      +   'background:rgba(255,255,252,.97);border:1.5px dashed var(--ac,#3b5fe2);border-radius:6px;'
      +   'padding:4px 7px;line-height:1.45;font-family:"Noto Sans KR",sans-serif;resize:none;overflow:hidden;'
      +   'box-shadow:0 4px 18px rgba(0,0,0,.2);outline:none;}'
      + '#annotTextBar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9993;display:flex;'
      +   'align-items:center;gap:8px;background:var(--s);border:1px solid var(--bd2);border-radius:13px;'
      +   'padding:6px 10px;box-shadow:0 10px 30px rgba(0,0,0,.26);font-size:12px;color:var(--tx-mid);'
      +   'font-family:inherit;max-width:94vw;flex-wrap:wrap;}'
      + '#annotTextBar button{border:1px solid var(--bd2);background:transparent;color:var(--tx-mid);'
      +   'border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit;line-height:1.2;}'
      + '#annotTextBar button:hover{background:var(--s2);}'
      + '#annotTextBar .annot-tb-size{display:flex;align-items:center;gap:4px;}'
      + '#annotTextBar .annot-tb-size b{min-width:40px;text-align:center;font-weight:500;'
      +   'font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--tx-dim);}'
      + '#annotTextBar .annot-tb-swatch{width:28px;height:28px;border-radius:8px;padding:0;}'
      + '#annotTextBar .annot-tb-ok{background:var(--ac);border-color:var(--ac);color:#fff;}'
      + '#annotTextBar .annot-tb-ok:hover{background:var(--ac-d);filter:none;}'
      + '.annot-color-pop{position:fixed;z-index:9994;background:var(--s);border:1px solid var(--bd2);'
      +   'border-radius:11px;box-shadow:0 10px 30px rgba(0,0,0,.24);padding:10px;display:flex;'
      +   'flex-direction:column;gap:7px;font-size:10.5px;color:var(--tx-dim);}'
      + '.annot-color-grid{display:grid;grid-template-columns:repeat(6,22px);gap:5px;}'
      + '.annot-color-grid button{width:22px;height:22px;border-radius:6px;border:1px solid var(--bd2);'
      +   'padding:0;cursor:pointer;}'
      + '.annot-color-grid button.on{box-shadow:0 0 0 2px var(--ac);}'
      + '.annot-color-pop input[type=color]{width:100%;height:26px;border:1px solid var(--bd);border-radius:6px;'
      +   'padding:0;background:none;cursor:pointer;}';
    var style = document.createElement('style');
    style.id = 'annotStyles';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  /* ── perfect-freehand v1.2.2 — 벤더 사본 (MIT License, © Steve Ruiz) ────
     출처: https://github.com/steveruizok/perfect-freehand (tldraw·Excalidraw 가 쓰는 그 코드).
     점열 [x,y,pressure] → 압력 반응 "윤곽선 폴리곤" 을 돌려준다. 렌더는 우리가 한다.
     빌드가 단일 파일(CSP 'self')이라 CDN 대신 dist/esm 원문을 그대로 담았다 —
     export 문을 return 으로 바꾼 것 외에는 무수정. 아래 한 줄이 원문 전체다. 손대지 말 것. */
  var PF = (function () { function $(e,t,u,x=h=>h){return e*x(.5-t*(.5-u))}function se(e){return[-e[0],-e[1]]}function l(e,t){return[e[0]+t[0],e[1]+t[1]]}function a(e,t){return[e[0]-t[0],e[1]-t[1]]}function b(e,t){return[e[0]*t,e[1]*t]}function he(e,t){return[e[0]/t,e[1]/t]}function R(e){return[e[1],-e[0]]}function B(e,t){return e[0]*t[0]+e[1]*t[1]}function ue(e,t){return e[0]===t[0]&&e[1]===t[1]}function ge(e){return Math.hypot(e[0],e[1])}function de(e){return e[0]*e[0]+e[1]*e[1]}function A(e,t){return de(a(e,t))}function G(e){return he(e,ge(e))}function ie(e,t){return Math.hypot(e[1]-t[1],e[0]-t[0])}function L(e,t,u){let x=Math.sin(u),h=Math.cos(u),y=e[0]-t[0],n=e[1]-t[1],f=y*h-n*x,d=y*x+n*h;return[f+t[0],d+t[1]]}function K(e,t,u){return l(e,b(a(t,e),u))}function ee(e,t,u){return l(e,b(t,u))}var{min:C,PI:xe}=Math,pe=.275,V=xe+1e-4;function ce(e,t={}){let{size:u=16,smoothing:x=.5,thinning:h=.5,simulatePressure:y=!0,easing:n=r=>r,start:f={},end:d={},last:D=!1}=t,{cap:S=!0,easing:j=r=>r*(2-r)}=f,{cap:q=!0,easing:c=r=>--r*r*r+1}=d;if(e.length===0||u<=0)return[];let p=e[e.length-1].runningLength,g=f.taper===!1?0:f.taper===!0?Math.max(u,p):f.taper,T=d.taper===!1?0:d.taper===!0?Math.max(u,p):d.taper,te=Math.pow(u*x,2),_=[],M=[],H=e.slice(0,10).reduce((r,i)=>{let o=i.pressure;if(y){let s=C(1,i.distance/u),W=C(1,1-s);o=C(1,r+(W-r)*(s*pe))}return(r+o)/2},e[0].pressure),m=$(u,h,e[e.length-1].pressure,n),U,X=e[0].vector,z=e[0].point,F=z,O=z,E=F,J=!1;for(let r=0;r<e.length;r++){let{pressure:i}=e[r],{point:o,vector:s,distance:W,runningLength:I}=e[r];if(r<e.length-1&&p-I<3)continue;if(h){if(y){let v=C(1,W/u),Z=C(1,1-v);i=C(1,H+(Z-H)*(v*pe))}m=$(u,h,i,n)}else m=u/2;U===void 0&&(U=m);let le=I<g?j(I/g):1,fe=p-I<T?c((p-I)/T):1;m=Math.max(.01,m*Math.min(le,fe));let re=(r<e.length-1?e[r+1]:e[r]).vector,Y=r<e.length-1?B(s,re):1,be=B(s,X)<0&&!J,ne=Y!==null&&Y<0;if(be||ne){let v=b(R(X),m);for(let Z=1/13,w=0;w<=1;w+=Z)O=L(a(o,v),o,V*w),_.push(O),E=L(l(o,v),o,V*-w),M.push(E);z=O,F=E,ne&&(J=!0);continue}if(J=!1,r===e.length-1){let v=b(R(s),m);_.push(a(o,v)),M.push(l(o,v));continue}let oe=b(R(K(re,s,Y)),m);O=a(o,oe),(r<=1||A(z,O)>te)&&(_.push(O),z=O),E=l(o,oe),(r<=1||A(F,E)>te)&&(M.push(E),F=E),H=i,X=s}let P=e[0].point.slice(0,2),k=e.length>1?e[e.length-1].point.slice(0,2):l(e[0].point,[1,1]),Q=[],N=[];if(e.length===1){if(!(g||T)||D){let r=ee(P,G(R(a(P,k))),-(U||m)),i=[];for(let o=1/13,s=o;s<=1;s+=o)i.push(L(r,P,V*2*s));return i}}else{if(!(g||T&&e.length===1))if(S)for(let i=1/13,o=i;o<=1;o+=i){let s=L(M[0],P,V*o);Q.push(s)}else{let i=a(_[0],M[0]),o=b(i,.5),s=b(i,.51);Q.push(a(P,o),a(P,s),l(P,s),l(P,o))}let r=R(se(e[e.length-1].vector));if(T||g&&e.length===1)N.push(k);else if(q){let i=ee(k,r,m);for(let o=1/29,s=o;s<1;s+=o)N.push(L(i,k,V*3*s))}else N.push(l(k,b(r,m)),l(k,b(r,m*.99)),a(k,b(r,m*.99)),a(k,b(r,m)))}return _.concat(N,M.reverse(),Q)}function me(e,t={}){var q;let{streamline:u=.5,size:x=16,last:h=!1}=t;if(e.length===0)return[];let y=.15+(1-u)*.85,n=Array.isArray(e[0])?e:e.map(({x:c,y:p,pressure:g=.5})=>[c,p,g]);if(n.length===2){let c=n[1];n=n.slice(0,-1);for(let p=1;p<5;p++)n.push(K(n[0],c,p/4))}n.length===1&&(n=[...n,[...l(n[0],[1,1]),...n[0].slice(2)]]);let f=[{point:[n[0][0],n[0][1]],pressure:n[0][2]>=0?n[0][2]:.25,vector:[1,1],distance:0,runningLength:0}],d=!1,D=0,S=f[0],j=n.length-1;for(let c=1;c<n.length;c++){let p=h&&c===j?n[c].slice(0,2):K(S.point,n[c],y);if(ue(S.point,p))continue;let g=ie(p,S.point);if(D+=g,c<j&&!d){if(D<x)continue;d=!0}S={point:p,pressure:n[c][2]>=0?n[c][2]:.5,vector:G(a(S.point,p)),distance:g,runningLength:D},f.push(S)}return f[0].vector=((q=f[1])==null?void 0:q.vector)||[0,0],f}function ae(e,t={}){return ce(me(e,t),t)}return{getStroke:ae,getStrokeOutlinePoints:ce,getStrokePoints:me}; })();

  /* ═══ 5. SVG 렌더링 ═════════════════════════════════════════════════════ */

  var SVGNS = 'http://www.w3.org/2000/svg';
  // pencilSeed / jitter / strokeBaseWidth 는 §1 순수부에서 정의 (캔버스 합성 렌더와 공유)

  function setAttrs(node, attrs) { for (var k in attrs) node.setAttribute(k, attrs[k]); }

  // 스트로크를 <g> 안에 그림 (v10.3 — 전부 <path> + 중점 이차 베지어):
  //  highlighter / (pen & !필압) → path 1개
  //  pen & 필압 / pencil → 양자화 굵기가 같은 구간마다 path 1개 (§1 strokeRuns)
  //    · 구: 점마다 <line> 1개 → 획 50개면 수만 노드. 신: 노드 수 5~15배 감소.
  //  skipTapDot=true → 점 1개짜리는 아무것도 안 그림 (진행 중 스트로크 전용).
  //    획을 시작한 순간엔 점이 1개뿐이라 "탭 = 점" 규칙이 그대로 걸려 원이 찍히는데,
  //    첫 move에서 선으로 교체되며 사라져 깜빡이는 잔상으로 보였음(iPad 펜에서 특히 눈에 띔).
  //    확정 렌더(renderPageSvg)는 이 플래그 없이 호출되므로 진짜 탭 = 점은 그대로 남는다.
  /* ── v10.11 윤곽선 잉크 (perfect-freehand) ──────────────────────────
     획을 "선"이 아니라 가변 폭 폴리곤 "면"으로 그린다 — 연속 굵기 + 시작/끝 테이퍼.
     기존 렌더의 8% 양자화 계단·뭉툭한 끝이 여기서 사라진다(조사 문서 격차 B).
     데이터(points)는 그대로 → 옛 필기도 이 렌더로 그려지고, 설정에서 끄면 즉시 복귀.
     펜만 — 형광펜은 균일 폭+투명이 정답(면 폴리곤은 겹침이 얼룩), 연필 질감은 2차. */
  function useOutlineInk(item) {
    return !!S.inkOutline && item.tool === 'pen' && (item.points || []).length > 1;
  }
  /* pf 의 굵기 규칙: 반지름 = size × easing(0.5 − thinning×(0.5 − 압력)).
     기존 렌더(base × 압력, 하한 0.25)와 **정확히 같은 폭**이 되도록 easing 으로 되맵핑한다 —
     폭이 같아야 아래 밑층(run 렌더)이 윤곽 밖으로 삐져나오지 않는다.
     ⚠️ simulatePressure 는 쓰지 않는다(2026-08-17 실기기 신고). 빠른 획 = 성긴 점 = 높은 속도로
        읽혀 중간이 극세선으로 깎였다 — "중간중간 하얗게 끊김"의 주범 중 하나였다. */
  var OUTLINE_THINNING = 0.55;
  function outlinePressEase(u) {
    // u = 0.5 − T(0.5 − p) → p 로 되돌린 뒤 기존 규칙 clamp(p, 0.25, 1) 적용
    var p = (u - 0.5 + OUTLINE_THINNING / 2) / OUTLINE_THINNING;
    return Math.max(0.25, Math.min(1, p));
  }
  function outlineFlatEase() { return 1; }
  function outlineOptions(item, base, live) {
    var pressured = !!item.pressureEnabled;
    return {
      /* 필압 켬: 반지름 = size×ease = (base/2)×압력 → 폭 = base×압력 (기존과 동일).
         필압 끔: pf 가 thinning=0 이면 easing 을 무시하고 반지름 = size/2 를 강제 → size=base 로 폭 = base. */
      size: pressured ? base / 2 : base,
      thinning: pressured ? OUTLINE_THINNING : 0,
      smoothing: 0.5,
      /* streamline 0 필수: 0.12 만 줘도 pf 가 점을 이전 점 쪽으로 끌어당겨 중심선이 밑층
         폴리라인에서 어긋난다(성긴 빠른 획에선 세그먼트의 ~10% = 수 px). 어긋난 만큼
         윤곽 가장자리가 밑층 밖으로 삐져나와 "따로 노는 얇은 선"이 보였다.
         입력은 EMA 가 이미 스무딩하므로 pf 쪽 스무딩은 끈다. */
      streamline: 0,
      simulatePressure: false,
      easing: pressured ? outlinePressEase : outlineFlatEase,
      last: !live,
      /* 테이퍼 0 = 둥근 끝. 2026-08-17 실기기 피드백 — "붓끝처럼 뾰족한 꼬리는 별로" */
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true }
    };
  }
  function outlinePathD(points, W, H, item, base, live, extraPts) {
    var input = [];
    for (var i = 0; i < points.length; i += 1) {
      input.push([points[i].x * W, points[i].y * H,
        (points[i].pressure === undefined || points[i].pressure === null) ? 0.5 : points[i].pressure]);
    }
    if (extraPts) {   // 예측 꼬리 — 본체에 이어 붙여 테이퍼째 자연스럽게
      for (var j = 0; j < extraPts.length; j += 1) {
        input.push([extraPts[j].x * W, extraPts[j].y * H,
          (extraPts[j].pressure === undefined || extraPts[j].pressure === null) ? 0.5 : extraPts[j].pressure]);
      }
    }
    var o = PF.getStroke(input, outlineOptions(item, base, live));
    if (!o || o.length < 3) return '';
    /* README 의 getSvgPathFromStroke — 이웃 평균점을 지나는 Q 루프 + 닫기 */
    var d = 'M' + fmtNum(o[0][0]) + ' ' + fmtNum(o[0][1]);
    for (var k = 0; k < o.length; k += 1) {
      var p1 = o[k], p2 = o[(k + 1) % o.length];
      d += ' Q' + fmtNum(p1[0]) + ' ' + fmtNum(p1[1]) + ' ' + fmtNum((p1[0] + p2[0]) / 2) + ' ' + fmtNum((p1[1] + p2[1]) / 2);
    }
    return d + ' Z';
  }

  function renderStrokeInto(g, item, W, H, skipTapDot) {
    var points = item.points || [];
    var base = strokeBaseWidth(item, W);
    setAttrs(g, {
      stroke: item.color || '#222', fill: 'none',
      'stroke-opacity': (item.opacity === undefined || item.opacity === null) ? 1 : item.opacity,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    if (!points.length) return;
    if (points.length === 1) {  // 탭 한 번 = 점
      if (skipTapDot) return;
      var c = document.createElementNS(SVGNS, 'circle');
      setAttrs(c, { cx: points[0].x * W, cy: points[0].y * H, r: base / 2, fill: item.color || '#222', stroke: 'none', 'fill-opacity': item.opacity === undefined ? 1 : item.opacity });
      g.appendChild(c);
      return;
    }
    if (useOutlineInk(item)) {
      var od = outlinePathD(points, W, H, item, base, false);
      if (od) {
        /* 밑층: 기존 run 렌더 그대로 — 8자·고리처럼 획이 자신을 가로지르면 윤곽 폴리곤의
           감김수가 상쇄돼(+1−1=0) 겹친 속이 하얗게 비는데(2026-08-17 실기기 신고),
           같은 색·같은 폭의 선 렌더를 아래 깔면 그 구멍이 원천적으로 막힌다.
           폭 매핑을 기존과 일치시켜 뒀으므로 밑층은 윤곽에 완전히 가려져 보이지 않는다. */
        var uruns = strokeRuns(item, W, H);
        for (var ur = 0; ur < uruns.length; ur += 1) {
          g.appendChild(makeRunPath(strokePolylineD(points, W, H, uruns[ur].i0, uruns[ur].i1), uruns[ur].width));
        }
        var op = document.createElementNS(SVGNS, 'path');
        setAttrs(op, { d: od, fill: item.color || '#222', stroke: 'none',
          'fill-opacity': (item.opacity === undefined || item.opacity === null) ? 1 : item.opacity });
        g.appendChild(op);
        return;
      }
    }
    var runs = strokeRuns(item, W, H);
    for (var i = 0; i < runs.length; i += 1) {
      g.appendChild(makeRunPath(strokePathD(points, W, H, runs[i].i0, runs[i].i1), runs[i].width));
    }
  }

  function makeRunPath(d, width) {
    var path = document.createElementNS(SVGNS, 'path');
    setAttrs(path, { d: d, 'stroke-width': width });
    return path;
  }

  function renderAnnotationInto(svg, item, W, H) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('data-id', item.id || '');
    if (item.type === 'stroke') {
      renderStrokeInto(g, item, W, H);
    } else if (item.type === 'rect-highlight') {
      var r = document.createElementNS(SVGNS, 'rect');
      setAttrs(r, {
        x: item.x * W, y: item.y * H, width: (item.w || 0) * W, height: (item.h || 0) * H,
        fill: item.color || '#FFE66D', 'fill-opacity': item.opacity === undefined ? 0.28 : item.opacity
      });
      g.appendChild(r);
    } else if (item.type === 'text') {
      var fo = document.createElementNS(SVGNS, 'foreignObject');
      setAttrs(fo, { x: item.x * W, y: item.y * H, width: (item.w || 0.25) * W, height: (item.h || 0.09) * H });
      var div = document.createElement('div');
      div.className = 'annot-text-note';
      div.style.borderColor = item.color || '#176b4d';
      // v10.10 고른 색이 글자에도 실린다 (구버전 메모는 textColor가 없어 CSS 기본 글자색 유지)
      if (item.textColor) div.style.color = item.textColor;
      div.style.fontSize = Math.max(10, (item.sizeRatio || 0.018) * W) + 'px';
      div.textContent = item.text || '';
      fo.appendChild(div);
      g.appendChild(fo);
    }
    svg.appendChild(g);
    return g;
  }

  // 페이지 전체 SVG 재렌더 (viewBox = 현재 픽셀 크기 → 리사이즈 시 비율 유지된 채 자동 스케일)
  function renderPageSvg(p) {
    var ov = overlays.get(p);
    if (!ov || !ov.filled || !ov.root.isConnected) return;
    var W = ov.root.clientWidth, H = ov.root.clientHeight;
    if (!W || !H) { requestAnimationFrame(function () { renderPageSvg(p); }); return; }
    setAttrs(ov.svg, { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' });
    while (ov.svg.firstChild) ov.svg.removeChild(ov.svg.firstChild);
    var list = S.pages[p] || [];
    for (var i = 0; i < list.length; i += 1) renderAnnotationInto(ov.svg, list[i], W, H);
  }

  function refreshAllOverlays() {
    overlays.forEach(function (ov, p) { if (ov.filled) renderPageSvg(p); });
  }

  /* v10.1 부분 렌더: 지정한 id의 <g>만 DOM에서 떼어냄 (페이지 전체 재생성 회피).
     필압 펜/연필은 점 하나당 <line> 1개라 200점×50획 = 1만 노드 — 삭제 때마다 이걸
     통째로 다시 만드는 게 올가미 삭제 렉의 주원인이었음.
     성공하면 true. 오버레이가 없거나(=화면 밖 지연 렌더 페이지) 비어 있으면 false
     → 호출측이 renderPageSvg로 폴백. */
  function removeSvgNodesByIds(p, ids) {
    var ov = overlays.get(p);
    if (!ov || !ov.filled || !ov.root.isConnected || !ids || !ids.length) return false;
    var want = Object.create(null);
    for (var i = 0; i < ids.length; i += 1) want[ids[i]] = 1;
    var kids = ov.svg.childNodes, doomed = [];
    for (var j = 0; j < kids.length; j += 1) {
      var n = kids[j];
      if (n.getAttribute && want[n.getAttribute('data-id')]) doomed.push(n);
    }
    for (var k = 0; k < doomed.length; k += 1) ov.svg.removeChild(doomed[k]);
    return true;
  }

  /* v10.1 부분 렌더: 새 annotation들만 기존 SVG 뒤에 덧붙임 (복제/붙여넣기용) */
  function appendSvgNodes(p, items) {
    var ov = overlays.get(p);
    if (!ov || !ov.filled || !ov.root.isConnected || !items || !items.length) return false;
    var W = ov.root.clientWidth, H = ov.root.clientHeight;
    if (!W || !H) return false;
    for (var i = 0; i < items.length; i += 1) renderAnnotationInto(ov.svg, items[i], W, H);
    return true;
  }

  /* ═══ 6. 오버레이 관리 (HTML의 renderVisiblePages/renderPdfPage가 호출) ═══
     · 데이터는 항상 메모리(S.pages)에 유지.
     · SVG DOM 내용은 뷰포트 근처(fill=true) 페이지만 채우고 먼 페이지는 비움(지연 렌더).
     · renderPdfPage가 w.innerHTML='' 로 페이지를 비워도, 직후 ensureOverlay가 재부착. */

  function ensureOverlay(pageDiv, pageNum, fill) {
    if (!pageDiv || !pageNum) return;
    var ov = overlays.get(pageNum);
    if (!ov || ov.root.parentElement !== pageDiv) {
      var root = document.createElement('div');
      root.className = 'annot-layer';
      root.setAttribute('data-annot-page', pageNum);
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'annot-svg');
      root.appendChild(svg);
      pageDiv.appendChild(root);
      attachOverlayInput(root, pageNum);
      ov = { root: root, svg: svg, filled: false, pageDiv: pageDiv };
      overlays.set(pageNum, ov);
      applyTouchAction(ov);
      invalidateLayout();     // 페이지 DOM이 새로 붙음 → 캐시된 rect는 더 못 믿음
    }
    var want = !!fill;
    if (want && !ov.filled) { ov.filled = true; renderPageSvg(pageNum); }
    else if (!want && ov.filled) {
      ov.filled = false;
      while (ov.svg.firstChild) ov.svg.removeChild(ov.svg.firstChild);
    }
  }

  function applyTouchAction(ov) {
    // 손가락 필기 on → 터치 전부 캡처. off → 손가락 스크롤 허용 (스타일러스는 touchstart에서 별도 차단)
    // 핀치는 브라우저 기본 줌 대신 HTML 쪽 커스텀 PDF 줌이 처리하므로 pinch-zoom은 허용 안 함
    ov.root.style.touchAction = (S.enabled && S.fingerDraw) ? 'none' : 'pan-x pan-y';
  }
  function applyTouchActionAll() { overlays.forEach(applyTouchAction); }

  /* ═══ 7. 데이터 변경 / undo·redo ═══════════════════════════════════════ */

  function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }

  /* v10.1 undo 스냅샷 = **배열만 얕은 복사**(구조적 공유).
     불변 규약: S.pages[p]에 들어간 annotation 객체는 그 자리에서 수정하지 않는다.
       · 이동/복제/붙여넣기 → translateAnnotation이 새 객체 반환
       · 부분지우개 → splitStroke가 새 객체 반환
       · 메모 수정 → deepCopy 후 수정
       · 그리는 중인 획만 points를 in-place로 늘리는데, 그 획은 스냅샷을 찍은 **뒤에**
         리스트에 추가되므로 어떤 스냅샷도 그 객체를 참조하지 않는다.
     배열 자체도 매번 slice/map/filter/concat으로 새로 만들어 교체하므로 공유해도 안전.
     구 JSON 딥카피는 페이지 필기 전체(점 수만 개)를 매 변경마다 직렬화 → 삭제 렉의 두 번째 원인. */
  function snapshotList(list) { return (list || []).slice(); }

  function pushUndoSnapshot(p, snapshot) {
    var stack = undoStacks.get(p) || [];
    stack.push(snapshotList(snapshot));
    if (stack.length > HISTORY_MAX) stack.shift();
    undoStacks.set(p, stack);
    redoStacks.set(p, []);
  }

  /* opts.removeIds / opts.addItems 를 주면 페이지 SVG 전체를 다시 만들지 않고
     해당 <g>만 떼거나 붙인다 (없으면 기존대로 renderPageSvg 전체 재렌더). */
  function commitPage(p, list, opts) {
    if (opts && opts.snapshot) pushUndoSnapshot(p, S.pages[p] || []);
    if (list && list.length) S.pages[p] = list;
    else delete S.pages[p];
    var patched = false;
    if (opts && opts.removeIds) patched = removeSvgNodesByIds(p, opts.removeIds);
    else if (opts && opts.addItems) patched = appendSvgNodes(p, opts.addItems);
    if (!patched) renderPageSvg(p);
    markDirty();
    updateToolbarState();
  }

  function undoPage(p) {
    p = p || lastActivePage || getCurP();
    var stack = undoStacks.get(p) || [];
    if (!stack.length) return false;
    var current = S.pages[p] || [];
    var previous = stack.pop();
    undoStacks.set(p, stack);
    var redo = redoStacks.get(p) || [];
    redo.push(snapshotList(current));
    if (redo.length > HISTORY_MAX) redo.shift();
    redoStacks.set(p, redo);
    if (previous && previous.length) S.pages[p] = previous; else delete S.pages[p];
    lassoClear();               // 되돌리기로 선택 대상이 사라질 수 있음 → 선택 해제
    renderPageSvg(p);
    markDirty();
    updateToolbarState();
    return true;
  }

  function redoPage(p) {
    p = p || lastActivePage || getCurP();
    var stack = redoStacks.get(p) || [];
    if (!stack.length) return false;
    var current = S.pages[p] || [];
    var next = stack.pop();
    redoStacks.set(p, stack);
    var undo = undoStacks.get(p) || [];
    undo.push(snapshotList(current));
    if (undo.length > HISTORY_MAX) undo.shift();
    undoStacks.set(p, undo);
    if (next && next.length) S.pages[p] = next; else delete S.pages[p];
    lassoClear();
    renderPageSvg(p);
    markDirty();
    updateToolbarState();
    return true;
  }

  function canUndo() { var p = lastActivePage || getCurP(); return !!(undoStacks.get(p) || []).length; }
  function canRedo() { var p = lastActivePage || getCurP(); return !!(redoStacks.get(p) || []).length; }

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  document.addEventListener('keydown', function (event) {
    var t = event.target;
    if (t && t.matches && t.matches('input,textarea,select,[contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (event.shiftKey ? redoPage() : undoPage()) event.preventDefault();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      if (redoPage()) event.preventDefault();
    }
  });

  /* ═══ 8. 입력 처리 (Pointer Events + setPointerCapture) ═════════════════ */

  /* ── A-1. 오버레이 rect 캐시 ──────────────────────────────────────────────
     구: 점 하나마다 getBoundingClientRect(). 직전 move에서 SVG를 건드렸기 때문에
     매 호출이 **강제 동기 레이아웃(리플로우)** 을 유발 — 240Hz + coalesced에선 이게
     한 프레임에 수십 번 일어난다(입력 지연·끊김의 큰 축).
     신: 한 번 읽어 캐시하고, 레이아웃이 실제로 바뀔 수 있는 순간에만 무효화한다.
       · 스크롤(캡처 단계라 #left 같은 내부 스크롤러도 잡힘) / 리사이즈 / 화면회전
       · visualViewport 변화(iOS 브라우저 줌·주소창)
       · PDF 커스텀 줌: window.__pdfZoom 값이 바뀌면 자동 무효 (핀치 중엔 매번 재측정)
       · 제스처 시작·종료, 오버레이 새로 생성
     보수적으로: 무효화를 놓치면 좌표가 틀어지므로 "의심스러우면 다시 읽는다" 쪽으로 잡았다. */
  var layoutGen = 0;
  var rcEl = null, rcGen = -1, rcVal = null, rcZoom = null;

  function invalidateLayout() { layoutGen += 1; }

  function pdfZoomNow() {
    try { return window.__pdfZoom; } catch (e) { return null; }
  }
  function pdfPinching() {
    try { return !!window.__pdfPinching; } catch (e) { return false; }
  }

  function rootRect(root) {
    var z = pdfZoomNow();
    if (!pdfPinching() && rcEl === root && rcGen === layoutGen && rcZoom === z && rcVal) return rcVal;
    rcVal = root.getBoundingClientRect();
    rcEl = root; rcGen = layoutGen; rcZoom = z;
    return rcVal;
  }

  (function watchLayoutInvalidate() {
    try {
      document.addEventListener('scroll', invalidateLayout, true);   // 캡처 = 내부 스크롤러 포함
      window.addEventListener('resize', invalidateLayout);
      window.addEventListener('orientationchange', invalidateLayout);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', invalidateLayout);
        window.visualViewport.addEventListener('scroll', invalidateLayout);
      }
    } catch (e) {}
  })();

  function normalizedPoint(root, event) {
    var rect = rootRect(root);
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
      pressure: event.pressure > 0 ? event.pressure : 0.5
    };
  }

  // 펜슬(pointerType='pen')은 항상 필기, 손가락은 기본 스크롤(손가락 필기 토글 시 필기)
  function effectiveTool(event) {
    if (event.pointerType === 'touch' && !S.fingerDraw) return 'touch-scroll';
    /* v10.10 스타일러스 옆 버튼(배럴)/지우개 팁을 누른 채 대면 그 획만 지우개 —
       버튼을 떼면 도구는 원래 펜 그대로다(S.tool을 건드리지 않으므로 복귀가 필요 없다).
       재원이형 AnnotationOverlay.effectiveTool 이식. 기기·브라우저마다 신호가 달라 네 형태를 모두 본다:
         button 5(barrel) · button 2(우클릭 매핑) · buttons&2 · buttons&32(지우개 팁)
       그리기 중일 때만 적용 — 올가미·영역선택·메모 중에 도구가 바뀌면 오히려 놀랍다.
       (오버레이는 contextmenu를 이미 막고 있어 우클릭 메뉴가 뜨지 않는다) */
    if (event.pointerType === 'pen' && toolRegistry[S.tool] && toolRegistry[S.tool].kind === 'draw'
        && (event.button === 5 || event.button === 2 || (event.buttons & 2) || (event.buttons & 32))) {
      return S.eraserMode;
    }
    return S.tool;
  }

  function beginMutationOnce(p) {
    if (gesture && gesture.snapshotTaken) return;
    pushUndoSnapshot(p, S.pages[p] || []);
    if (gesture) gesture.snapshotTaken = true;
  }

  function eraseAt(p, pos, mode, W, H) {
    beginMutationOnce(p);
    var radius = mode === 'eraser-partial' ? 18 : 14;
    var next = [];
    var list = S.pages[p] || [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (item.type === 'stroke') {
        if (mode === 'eraser-line') {
          if (!strokeHit(item, pos, W, H, radius)) next.push(item);
        } else {
          if (strokeHit(item, pos, W, H, radius + 8)) next.push.apply(next, splitStroke(item, pos, W, H, radius));
          else next.push(item);
        }
      } else if (annotationContains(item, pos)) {
        // 텍스트 메모·사각 하이라이트는 어느 지우개든 닿으면 삭제
      } else next.push(item);
    }
    if (next.length) S.pages[p] = next; else delete S.pages[p];
    renderPageSvg(p);
    markDirty();
  }

  /* ── 메모 롱프레스 선택 (v10.9) ──────────────────────────────────────────
     사진과 같은 1초. 손이 MEMO_HOLD_SLOP 이상 움직이면 = 필기 의도 → 취소. */
  var MEMO_HOLD_MS = 1000, MEMO_HOLD_SLOP = 10;
  var memoPress = null;
  function cancelMemoPress() {
    if (memoPress && memoPress.timer) clearTimeout(memoPress.timer);
    memoPress = null;
  }
  function memoPressStart(root, pageNum, event, pos) {
    cancelMemoPress();
    var list = S.pages[pageNum] || [];
    var hit = null;
    for (var i = list.length - 1; i >= 0; i -= 1) {        // 위에 있는 것부터
      if (list[i].type === 'text' && annotationContains(list[i], pos)) { hit = list[i]; break; }
    }
    if (!hit) return;
    var p = { id: hit.id, page: pageNum, root: root, x: event.clientX, y: event.clientY, timer: null };
    memoPress = p;
    p.timer = setTimeout(function () {
      if (memoPress !== p) return;
      memoPress = null;
      abortActiveStroke();            // 누르는 동안 그려지던 획은 없던 일로 (사진 롱프레스와 같은 규칙)
      var cur = null, cl = S.pages[p.page] || [];
      for (var k = 0; k < cl.length; k += 1) if (cl[k].id === p.id) { cur = cl[k]; break; }
      if (!cur) return;
      lassoClear();
      lasso.page = p.page; lasso.root = p.root;
      lassoSetIds([cur.id]);
      lasso.bounds = listBounds([cur]);
      lassoShowSelection();
      toast('📝 메모 선택 — 수정 · 글자크기 · 복사/삭제 (바깥을 누르면 해제)');
    }, MEMO_HOLD_MS);
  }
  function memoPressMove(event) {
    if (!memoPress) return;
    if (Math.hypot(event.clientX - memoPress.x, event.clientY - memoPress.y) > MEMO_HOLD_SLOP) cancelMemoPress();
  }

  function abortActiveStroke() {
    // 멀티터치 제스처 감지 시 진행 중 스트로크 취소 (원펜 방식: 두 손가락 탭이 획으로 남지 않게)
    cancelLongPress();
    if (!gesture || gesture.kind !== 'stroke') return;
    var p = gesture.page;
    var stack = undoStacks.get(p) || [];
    if (gesture.snapshotTaken && stack.length) {
      var previous = stack.pop();
      undoStacks.set(p, stack);
      if (previous && previous.length) S.pages[p] = previous; else delete S.pages[p];
      renderPageSvg(p);
      markDirty();
    }
    gesture = null;
  }

  function attachOverlayInput(root, pageNum) {
    root.addEventListener('pointerdown', function (e) { onOverlayDown(root, pageNum, e); });
    root.addEventListener('pointermove', function (e) { onOverlayMove(root, pageNum, e); });
    root.addEventListener('pointerup', function (e) { finishGesture(root, e); });
    root.addEventListener('pointercancel', function (e) { finishGesture(root, e); });
    root.addEventListener('contextmenu', function (e) { if (S.enabled) e.preventDefault(); });
    // iOS Safari: Apple Pencil 스크롤 차단 (touch-action은 pan 허용 상태라 스타일러스만 선별 차단)
    var stylusGuard = function (e) {
      if (!S.enabled) return;
      /* v10.9 ★ 오버레이 위에 떠 있는 UI(선택 메뉴·팝오버·메모 편집기) 위에서는 건드리지 않는다.
         iOS는 touchstart에 preventDefault()가 걸리면 그 탭의 합성 click을 만들지 않는다 →
         올가미 선택 메뉴의 버튼이 전부 먹통이 됐다. UI 위 터치는 그릴 일이 없으므로 그냥 통과. */
      if (e.target && e.target.closest
          && e.target.closest('.annot-sel-menu, .annot-pop, .annot-text-edit, .pageimg-ui')) return;
      var t = e.changedTouches && e.changedTouches[0];
      if ((t && t.touchType === 'stylus') || S.fingerDraw) e.preventDefault();
    };
    root.addEventListener('touchstart', stylusGuard, { passive: false });
    root.addEventListener('touchmove', stylusGuard, { passive: false });
  }

  function onOverlayDown(root, pageNum, event) {
    if (!S.enabled) return;
    /* v10.10 메모 편집을 닫은 그 탭은 여기서 삼킨다.
       (document 캡처 단계의 textOutsideDown이 먼저 저장·종료 → 같은 탭이 새 메모까지 열면
        "한 번 탭했는데 편집창이 계속 뜬다"가 된다. 재원이형도 같은 규칙: 편집 중 탭 = 닫기만) */
    if (swallowDown === event) { swallowDown = null; return; }
    swallowDown = null;
    // 두 손가락 이상(핀치/undo 제스처) 또는 PDF 핀치줌 진행 중 → 새 입력 시작 금지
    if (event.pointerType === 'touch' && touchDownCount >= 2) return;
    if (typeof window !== 'undefined' && window.__pdfPinching) return;
    invalidateLayout();          // 제스처 시작 — rect를 이번 한 번은 반드시 새로 실측
    lastActivePage = pageNum;
    activatePage(pageNum);
    updateToolbarState();
    var active = effectiveTool(event);
    if (active === 'touch-scroll') return;                    // 손가락 1개 = 스크롤에 양보
    if (gesture) return;                                      // 이미 다른 제스처 진행 중
    /* v10.9 선택한 것을 끌어서 옮기기 — 도구가 펜이어도 된다.
       메모를 꾹 눌러 고른 다음(§memoPressStart) 그대로 끌어 옮기는 흐름을 위해서다.
       선택 안쪽을 누르면 올가미의 이동 로직으로 넘긴다(이동 커밋·undo·메뉴 복귀가 이미 거기 다 있음).
       선택 밖을 누르면 그대로 필기 — 선택 해제는 올가미 onDown이 알아서 한다. */
    if (lasso.mode === 'selected' && lasso.ids.length && lasso.page === pageNum && lasso.bounds
        && insideLassoBounds(normalizedPoint(root, event))) {
      active = 'lasso';
    }
    var def = toolRegistry[active];
    if (!def) return;
    var pos = normalizedPoint(root, event);

    event.preventDefault();
    event.stopPropagation();
    try { root.setPointerCapture(event.pointerId); } catch (e) {}

    /* v10.9 메모 롱프레스 선택 — 사진(PageImg)과 같은 감각으로 "꾹 누르면 잡힌다".
       예전엔 메모를 고치려면 도구를 올가미나 텍스트로 바꿔야 했다. 이제 펜을 쥔 채로 된다.
       그리기 도구일 때만 건다 — 올가미는 이미 탭으로 집히고, 지우개/텍스트는 각자 할 일이 있다. */
    if (def.kind === 'draw') memoPressStart(root, pageNum, event, pos);

    if (def.kind === 'draw') {
      /* ★ 펜 굵기는 "문서 기준"이다 — 줌 배율과 무관하게 같은 굵기로 남아야 한다.
         핀치 줌은 --pdf-zoom으로 .pdf-page의 **폭 자체를 키우는 레이아웃 확대**라
         root.clientWidth가 배율만큼 커진다. 그래서 예전 식(펜폭 / clientWidth)은
         400%에서 굵기 비율을 1/4로 만들었다 — 화면에선 늘 같은 두께로 보이지만(절대 크기)
         배율을 되돌리면 그때 그린 획만 유독 가늘어졌다(iPad 실측, 2026-08-06).
         기준 폭을 배율로 되돌린 뒤(=100%일 때의 페이지 폭) 비율을 잡는다. */
      var W = Math.max(1, root.clientWidth);
      var zNow = pdfZoomNow();
      var zoom = (typeof zNow === 'number' && zNow > 0.05) ? zNow : 1;
      var Wdoc = Math.max(1, W / zoom);
      var stroke = {
        id: uid(), type: 'stroke', tool: active,
        color: S.penSettings.color,
        widthRatio: Math.max(0.0007, S.penSettings.width / Math.max(300, Wdoc)),
        opacity: active === 'highlighter' ? S.penSettings.opacity : Math.max(0.25, S.penSettings.opacity),
        pressureEnabled: (active === 'pen' || active === 'pencil') && S.pressureEnabled,
        points: [pos]
      };
      S.lastDrawTool = active;
      gesture = { kind: 'stroke', page: pageNum, root: root, pointerId: event.pointerId, stroke: stroke, snapshotTaken: false, g: null, lastIdx: 0,
                  ruler: S.rulerOn, rulerStart: pos, pressSum: pos.pressure, pressN: 1,     // 직선 자 모드용
                  // A-2 좌표 EMA: 첫 점이 시드(지연 0). 이후 원본은 ema로만 흘려보낸다.
                  // rawLast를 누른 지점으로 초기화 — 첫 move의 이동거리(=alpha 보정)가 0이 되지 않게.
                  ema: { x: pos.x, y: pos.y, pressure: pos.pressure },
                  alpha: smoothAlphaFor(active), rawLast: { x: pos.x, y: pos.y, pressure: pos.pressure } };
      beginMutationOnce(pageNum);
      var list = (S.pages[pageNum] || []).slice();
      list.push(stroke);
      S.pages[pageNum] = list;
      markDirty();
      startLiveStroke(pageNum);
      maybeStartLongPress(root, pageNum, pos, event);   // v10.1 여백 롱프레스 → 붙여넣기 (§8c)
      return;
    }

    if (def.kind === 'erase') {
      gesture = { kind: active, page: pageNum, root: root, pointerId: event.pointerId, snapshotTaken: false };
      eraseAt(pageNum, pos, active, root.clientWidth, root.clientHeight);
      return;
    }

    if (def.kind === 'rect') {
      gesture = { kind: 'rect', page: pageNum, root: root, pointerId: event.pointerId, start: pos, rectEl: null };
      return;
    }

    if (def.kind === 'text') {
      gesture = null;
      handleTextTool(root, pageNum, pos);
      return;
    }

    if (def.kind === 'custom' && def.onDown) {   // 확장 도구 (영역선택/올가미 예정)
      gesture = { kind: 'custom', page: pageNum, root: root, pointerId: event.pointerId, def: def, state: {} };
      def.onDown({ page: pageNum, pos: pos, event: event, root: root, api: publicApi, state: gesture.state });
      return;
    }
  }

  // 진행 중 스트로크의 <g>를 만들어 두고, move마다 증분 렌더 (전체 재렌더 회피)
  function startLiveStroke(pageNum) {
    var ov = overlays.get(pageNum);
    if (!ov || !ov.filled) return;
    var W = ov.root.clientWidth, H = ov.root.clientHeight;
    if (!W || !H) return;
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('data-id', gesture.stroke.id);
    renderStrokeInto(g, gesture.stroke, W, H, true);   // 시작점 원(잔상) 금지 — 확정 렌더에서만 점을 찍는다
    ov.svg.appendChild(g);
    gesture.g = g;
    gesture.W = W; gesture.H = H;
    gesture.segmented = isSegmentedStroke(gesture.stroke);
    gesture.seed = gesture.stroke.tool === 'pencil' ? pencilSeed(gesture.stroke.id) : 0;
    gesture.base = strokeBaseWidth(gesture.stroke, W);
    gesture.period = pencilPeriodPx(W);      // 연필 질감 주기(호길이 기준) — 확정 렌더와 동일 값
    gesture.qStep = widthQuantStep(gesture.base);
    gesture.cumLen = 0;                      // 누적 호길이(px) — strokeRuns와 같은 순서로 누적
    gesture.run = null;                      // 현재 굵기 구간 {width, builder, el}
    gesture.lastIdx = gesture.stroke.points.length - 1;
    /* v10.11 윤곽선 라이브 — 증분 append 대신 매 move 전체 윤곽 재계산.
       MIN_STEP 1.6px 필터 덕에 일반 획은 점 수백 개 이하라 60fps 가 나온다(tldraw 방식).
       직선 자 모드는 자기 방식(전체 교체 렌더)이 있으므로 제외. */
    gesture.outline = !!S.inkOutline && gesture.stroke.tool === 'pen' && !gesture.ruler;
    if (gesture.outline) {
      gesture.outlineEl = document.createElementNS(SVGNS, 'path');
      setAttrs(gesture.outlineEl, {
        fill: gesture.stroke.color || '#222', stroke: 'none',
        'fill-opacity': (gesture.stroke.opacity === undefined || gesture.stroke.opacity === null) ? 1 : gesture.stroke.opacity
      });
      g.appendChild(gesture.outlineEl);
    }
  }

  function rebuildLiveOutline() {
    if (!gesture || !gesture.outlineEl) return;
    var pts = gesture.stroke.points;
    if (pts.length < 2) return;
    if (pts.length > 1400) return;   // 초장문 획 안전장치 — 라이브만 멈추고 확정 렌더가 마무리
    var d = outlinePathD(pts, gesture.W, gesture.H, gesture.stroke, gesture.base, true, gesture.tailPts);
    if (d) gesture.outlineEl.setAttribute('d', d);
  }

  /* 라이브 증분 렌더 (v10.3): 새 점마다 이차 베지어 Q 한 조각을 현재 구간 경로에 확정하고,
     끝점은 임시 L로 마감한다(다음 점이 오면 Q로 승격). 굵기 구간이 바뀌면 새 <path> 시작.
     확정 렌더(renderStrokeInto)와 **완전히 같은 규칙·같은 문자열**을 만들도록 §1 헬퍼를 공유. */
  function appendLivePoints(fromIdx) {
    var g = gesture.g;
    if (!g) return;
    var pts = gesture.stroke.points;
    var W = gesture.W, H = gesture.H;
    for (var i = Math.max(1, fromIdx + 1); i < pts.length; i += 1) {
      var a = pts[i - 1], b = pts[i];
      var width = gesture.base;
      if (gesture.segmented) {
        var segLen = Math.hypot((b.x - a.x) * W, (b.y - a.y) * H);
        width = quantizeWidth(
          segmentRawWidth(gesture.stroke, a, b, gesture.base, gesture.seed, gesture.cumLen + segLen / 2, gesture.period),
          gesture.qStep);
        gesture.cumLen += segLen;
      }
      var run = gesture.run;
      if (!run || run.width !== width) {
        if (run) run.el.setAttribute('d', pathTail(run.builder));   // 직전 구간 확정
        run = { width: width, builder: pathStart(a.x * W, a.y * H), el: makeRunPath('', width) };
        g.appendChild(run.el);
        gesture.run = run;
      }
      pathAdd(run.builder, b.x * W, b.y * H);
    }
    if (gesture.run) gesture.run.el.setAttribute('d', pathTail(gesture.run.builder));
    if (gesture.outline) {
      /* 윤곽선은 밑층(위 run) 위에 겹친다 — run 이 새로 생겼을 수 있으니 항상 맨 위로 */
      rebuildLiveOutline();
      if (gesture.outlineEl && gesture.outlineEl.nextSibling) g.appendChild(gesture.outlineEl);
    }
  }

  /* ── v10.11 예측 잉크 ────────────────────────────────────────────────
     렌더는 언제나 이벤트 "뒤"라 펜촉과 잉크 사이에 한 프레임의 틈이 보인다 —
     "종이 같지 않다"의 큰 부분. 브라우저가 예측한 다음 궤적(getPredictedEvents,
     Safari 18.2+·Chrome)을 임시 꼬리로 미리 그리고 다음 이벤트에서 실측으로 교체한다.
     ★ 꼬리는 stroke.points 와 분리된 tailPts 로만 존재 — 저장에 절대 안 들어간다.
       손을 떼면 finishGesture 의 renderPageSvg 전체 재렌더가 지운다.
     미지원 브라우저 폴백: 직전 이동 벡터를 한 주기만큼 연장(보수적 외삽). */
  var PREDICT_MAX_POINTS = 3;
  var PREDICT_MAX_PX = 22;          // 급정지 때 꼬리가 길게 튀어 보이는 것 방지
  function computePredictedTail(root, event) {
    var pts = gesture.stroke.points;
    var last = pts[pts.length - 1];
    if (!last) return [];
    var W = gesture.W || 1, H = gesture.H || 1;
    var out = [];
    var predicted = event.getPredictedEvents ? event.getPredictedEvents() : null;
    if (predicted && predicted.length) {
      for (var i = 0; i < predicted.length && out.length < PREDICT_MAX_POINTS; i += 1) {
        out.push(normalizedPoint(root, predicted[i]));
      }
    } else if (gesture.rawLast && gesture.prevRaw) {
      var dx = gesture.rawLast.x - gesture.prevRaw.x, dy = gesture.rawLast.y - gesture.prevRaw.y;
      if (Math.hypot(dx * W, dy * H) > 0.8) out.push({ x: last.x + dx, y: last.y + dy, pressure: last.pressure });
    }
    var total = 0, prev = last, kept = [];
    for (var j = 0; j < out.length; j += 1) {
      var d = Math.hypot((out[j].x - prev.x) * W, (out[j].y - prev.y) * H);
      if (total + d > PREDICT_MAX_PX) break;
      total += d; kept.push(out[j]); prev = out[j];
    }
    return kept;
  }
  function updatePredictedTail(root, event) {
    if (!gesture || !gesture.g || gesture.ruler) return;
    gesture.tailPts = computePredictedTail(root, event);
    if (gesture.outline) { rebuildLiveOutline(); return; }   // 윤곽선 렌더는 꼬리를 본체에 흡수(테이퍼 유지)
    var pts = gesture.stroke.points, last = pts[pts.length - 1];
    if (!gesture.tailPts.length || !last) {
      if (gesture.tailEl && gesture.tailEl.parentNode) gesture.tailEl.parentNode.removeChild(gesture.tailEl);
      gesture.tailEl = null;
      return;
    }
    var W = gesture.W, H = gesture.H;
    if (!gesture.tailEl) { gesture.tailEl = makeRunPath('', gesture.base); gesture.g.appendChild(gesture.tailEl); }
    var b = pathStart(last.x * W, last.y * H);
    for (var i = 0; i < gesture.tailPts.length; i += 1) pathAdd(b, gesture.tailPts[i].x * W, gesture.tailPts[i].y * H);
    gesture.tailEl.setAttribute('d', pathTail(b));
    gesture.tailEl.setAttribute('stroke-width', (gesture.run && gesture.run.width) || gesture.base);
  }

  function onOverlayMove(root, pageNum, event) {
    memoPressMove(event);              // 손이 움직이면 = 필기 의도 → 메모 롱프레스 취소
    if (!gesture || gesture.root !== root) return;
    if (gesture.kind === 'custom') {
      if (gesture.def.onMove) gesture.def.onMove({ page: pageNum, pos: normalizedPoint(root, event), event: event, root: root, api: publicApi, state: gesture.state });
      event.preventDefault();
      return;
    }
    event.preventDefault();

    if (gesture.kind === 'stroke') {
      // v10.1 롱프레스 감시: 임계값 넘게 움직이면 "필기 중"으로 보고 붙여넣기 메뉴 예약 취소
      if (lpTimer && gesture.lpX !== undefined) {
        var lpd = Math.hypot(event.clientX - gesture.lpX, event.clientY - gesture.lpY);
        if (lpd > gesture.lpMoved) gesture.lpMoved = lpd;
        if (lpd > LONGPRESS_SLOP) cancelLongPress();
      }
      // 직선 모드: 시작점~현재점 직선 프리뷰.
      // v10.10 — 기본은 자유 각도(손이 그은 그대로). Shift를 누르고 있는 동안만 1° 격자 스냅.
      if (gesture.ruler) {
        var rpos = normalizedPoint(root, event);
        gesture.pressSum += rpos.pressure; gesture.pressN += 1;
        var Wr = gesture.W || root.clientWidth || 1, Hr = gesture.H || root.clientHeight || 1;
        var rEnd = computeRulerEnd(gesture.rulerStart, rpos, Wr, Hr, !!event.shiftKey);
        gesture.stroke.points = rulerLinePoints(gesture.rulerStart, rEnd, gesture.pressSum / gesture.pressN, 8);
        if (gesture.g) {   // 점 수가 늘지 않고 통째로 교체되므로 증분 아닌 전체 재렌더 (직선 1개 — 저렴)
          while (gesture.g.firstChild) gesture.g.removeChild(gesture.g.firstChild);
          renderStrokeInto(gesture.g, gesture.stroke, Wr, Hr, true);
        }
        return;
      }
      // coalesced 이벤트로 고주사율 펜 입력 보존 (비신뢰/미지원 이벤트는 빈 배열 → 원본으로 폴백)
      var events = event.getCoalescedEvents ? event.getCoalescedEvents() : null;
      if (!events || !events.length) events = [event];
      var pts = gesture.stroke.points;
      var W = gesture.W || root.clientWidth, H = gesture.H || root.clientHeight;
      var before = pts.length - 1;
      for (var i = 0; i < events.length; i += 1) {
        var raw = normalizedPoint(root, events[i]);
        // A-2 EMA는 **버려지는 샘플에도** 적용한다 — 그래야 필터가 원본 궤적을 계속 따라감.
        // alpha는 샘플 간 이동거리로 보정 → 주사율이 달라도 지연이 px로 일정 (§1 emaAlphaForStep)
        var stepPx = gesture.rawLast
          ? Math.hypot((raw.x - gesture.rawLast.x) * W, (raw.y - gesture.rawLast.y) * H) : 0;
        gesture.ema = emaPoint(gesture.ema, raw,
          emaAlphaForStep(gesture.alpha, stepPx), emaAlphaForStep(PRESSURE_ALPHA, stepPx));
        gesture.prevRaw = gesture.rawLast;   // 예측 폴백(속도 외삽)용 직전 원본
        gesture.rawLast = raw;
        var sm = gesture.ema;
        var last = pts[pts.length - 1];
        // A-1 최소 이동거리 1.6px (구 0.5px는 240Hz 펜슬에서 사실상 아무것도 못 걸렀음)
        if (last && Math.hypot((sm.x - last.x) * W, (sm.y - last.y) * H) < MIN_STEP_PX) continue;
        pts.push(sm);                        // emaPoint는 매번 새 객체 → 그대로 저장해도 안전
      }
      if (pts.length - 1 > before) appendLivePoints(before);
      updatePredictedTail(root, event);   // v10.11 예측 잉크 — 새 점이 없어도 매 이벤트 갱신
      return;
    }

    if (gesture.kind === 'eraser-line' || gesture.kind === 'eraser-partial') {
      eraseAt(pageNum, normalizedPoint(root, event), gesture.kind, root.clientWidth, root.clientHeight);
      return;
    }

    if (gesture.kind === 'rect') {
      var pos2 = normalizedPoint(root, event);
      var x = Math.min(gesture.start.x, pos2.x), y = Math.min(gesture.start.y, pos2.y);
      var w = Math.abs(pos2.x - gesture.start.x), h = Math.abs(pos2.y - gesture.start.y);
      gesture.tmp = { x: x, y: y, w: w, h: h };
      var ov = overlays.get(pageNum);
      if (ov && ov.filled) {
        var Wp = ov.root.clientWidth, Hp = ov.root.clientHeight;
        if (!gesture.rectEl) {
          gesture.rectEl = document.createElementNS(SVGNS, 'rect');
          setAttrs(gesture.rectEl, { fill: rectHighlightColor(), 'fill-opacity': 0.28, stroke: 'rgba(0,0,0,.25)', 'stroke-dasharray': '4 3' });
          ov.svg.appendChild(gesture.rectEl);
        }
        setAttrs(gesture.rectEl, { x: x * Wp, y: y * Hp, width: w * Wp, height: h * Hp });
      }
    }
  }

  function rectHighlightColor() {
    // 마지막 필기 도구가 형광펜이면 그 색으로, 아니면 기본 노랑
    return S.lastDrawTool === 'highlighter' ? S.penSettings.color : '#FFE66D';
  }

  function finishGesture(root, event) {
    cancelLongPress();                       // 손을 뗐으면 롱프레스 붙여넣기 예약 해제
    cancelMemoPress();                       // 메모 롱프레스도 (1초 안에 뗐으면 그냥 필기였던 것)
    if (!gesture || gesture.root !== root) return;
    var g = gesture;
    gesture = null;
    invalidateLayout();        // 제스처 종료 — 다음 제스처는 rect를 새로 실측
    try { if (root.hasPointerCapture && root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId); } catch (e) {}

    if (g.kind === 'custom') {
      if (g.def.onUp) g.def.onUp({ page: g.page, pos: normalizedPoint(root, event), event: event, root: root, api: publicApi, state: g.state });
      return;
    }
    if (g.kind === 'stroke') {
      /* A-2 꼬리 보정: EMA는 원본보다 1~2샘플 뒤처지므로 그냥 끝내면 획 끝이 살짝 모자란다.
         펜을 뗀 실제 위치를 마지막 점으로 한 번 더 찍어 "끝이 잘린" 느낌을 없앤다.
         필압은 스무딩값을 유지 — 뗄 때 필압이 0으로 급락해 끝이 얇아지는 아티팩트 방지. */
      if (!g.ruler && g.rawLast && g.stroke && g.stroke.points.length) {
        var fp = g.stroke.points, flast = fp[fp.length - 1];
        var fW = g.W || root.clientWidth || 1, fH = g.H || root.clientHeight || 1;
        if (Math.hypot((g.rawLast.x - flast.x) * fW, (g.rawLast.y - flast.y) * fH) > 0.6) {
          fp.push({ x: g.rawLast.x, y: g.rawLast.y, pressure: flast.pressure });
        }
      }
      renderPageSvg(g.page);   // 증분 렌더 → 최종 정규 렌더로 정리
      markDirty();
      updateToolbarState();
      invalidateLayout();
      return;
    }
    if (g.kind === 'rect') {
      if (g.rectEl && g.rectEl.parentNode) g.rectEl.parentNode.removeChild(g.rectEl);
      var W = root.clientWidth, H = root.clientHeight;
      var t = g.tmp;
      if (t && t.w * W >= 6 && t.h * H >= 6) {
        var list = (S.pages[g.page] || []).slice();
        list.push({ id: uid(), type: 'rect-highlight', x: t.x, y: t.y, w: t.w, h: t.h, color: rectHighlightColor(), opacity: 0.28 });
        commitPage(g.page, list, { snapshot: true });
      }
      return;
    }
    if (g.kind === 'eraser-line' || g.kind === 'eraser-partial') {
      updateToolbarState();
      // v10.5 펜 자동 복귀 — 지우개는 "지우기 제스처 한 번(pointerup)"이 곧 작업 끝
      autoReturnPen(g.kind);
    }
  }

  /* ═══ 8a. 텍스트 메모 — 인라인 편집기 (v10.10, 재원이형 수정본-2 이식) ══════
     구: window.prompt() 두 번(신규/수정). iPad에서 시스템 대화상자가 문서를 통째로 덮고,
         줄바꿈을 넣을 수 없고, 글자 크기·색도 못 골랐다.
     신(재원이형 inline-text-editor + inline-text-bottombar 이식):
       · 탭한 그 자리에 textarea가 뜬다 — 문서를 보면서 쓴다. 줄바꿈 가능, 높이 자동 확장
       · 화면 아래 바에서 글자 크기(8~48px)·색을 고른다 (기본 12색 + 최근 색 + RGB)
       · 밖을 누르면 자동 저장 / Esc = 취소 / Ctrl(⌘)+Enter = 저장
       · 빈 값으로 저장 = 그 메모 삭제 (구 prompt 규칙 유지)
       · 저장한 크기·색은 다음 메모에도 그대로 이어진다(localStorage)
     우리 쪽 유지: v10.5 펜 자동 복귀(편집창이 닫히는 순간이 작업 끝), undo 스냅샷(commitPage). */

  var MEMO_BASE_W = 820;                 // sizePx ↔ sizeRatio 환산 기준 페이지 폭(기본 globalPdfWidth)
  var MEMO_SIZE_MIN = 8, MEMO_SIZE_MAX = 48;
  var MEMO_COLORS = ['#1e2320', '#6b7280', '#d94c4c', '#e8843c', '#c9a227', '#2e8b57',
                     '#1f8d8b', '#3169d8', '#7c5cd6', '#e06c9f', '#b83280', '#8b5a2b'];
  var LS_MEMO = 'annot-memo-style-v1', LS_MEMO_RECENT = 'annot-memo-recent-v1';

  var memoStyle = (function () {
    var s = loadJSON(LS_MEMO, null) || {};
    var px = Number(s.sizePx);
    if (!isFinite(px)) px = Math.round(0.018 * MEMO_BASE_W);      // 구 기본 sizeRatio와 같은 크기
    return { color: s.color || '#1e2320', sizePx: clamp(Math.round(px), MEMO_SIZE_MIN, MEMO_SIZE_MAX) };
  })();
  var memoRecent = loadJSON(LS_MEMO_RECENT, []) || [];

  function persistMemoStyle() { saveJSON(LS_MEMO, memoStyle); }
  function memoSizeRatio() { return memoStyle.sizePx / MEMO_BASE_W; }
  function addRecentMemoColor(color) {
    var next = [color];
    for (var i = 0; i < memoRecent.length && next.length < 12; i += 1) {
      if (memoRecent[i] !== color) next.push(memoRecent[i]);
    }
    memoRecent = next;
    saveJSON(LS_MEMO_RECENT, memoRecent);
  }

  var textEdit = null;        // { page, root, id, x, y, wrap, area }
  var textEditBusy = false;   // setTool ↔ 저장 재귀 방지
  var memoColorPop = null;
  var swallowDown = null;     // "밖을 눌러 닫은" 그 pointerdown은 새 편집을 열지 않는다

  function closeMemoColorPop() {
    if (memoColorPop && memoColorPop.parentNode) memoColorPop.parentNode.removeChild(memoColorPop);
    memoColorPop = null;
  }

  function isTextEditing() { return !!textEdit; }

  function textEditFontPx() {
    var W = (textEdit && textEdit.root && textEdit.root.clientWidth) || getGlobalPageSize().w;
    return Math.max(10, memoSizeRatio() * Math.max(1, W));
  }

  function syncTextEditStyle() {
    if (!textEdit) return;
    textEdit.area.style.fontSize = textEditFontPx() + 'px';
    textEdit.area.style.color = memoStyle.color;
    if (textEdit.swatch) textEdit.swatch.style.background = memoStyle.color;
    if (textEdit.sizeLabel) textEdit.sizeLabel.textContent = memoStyle.sizePx + 'px';
    growTextArea();
  }

  function growTextArea() {
    if (!textEdit) return;
    var a = textEdit.area;
    a.style.height = 'auto';
    a.style.height = Math.max(a.scrollHeight, 24) + 'px';
  }

  function stopBubble(node) {
    ['pointerdown', 'pointermove', 'pointerup', 'click'].forEach(function (type) {
      node.addEventListener(type, function (e) { e.stopPropagation(); });
    });
    node.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
  }

  function buildMemoBar() {
    var bar2 = el('div');
    bar2.id = 'annotTextBar';
    stopBubble(bar2);

    var size = el('span', 'annot-tb-size');
    var minus = el('button', '', '−');
    minus.type = 'button'; minus.title = '글자 작게';
    var label = el('b', '', memoStyle.sizePx + 'px');
    var plus = el('button', '', '＋');
    plus.type = 'button'; plus.title = '글자 크게';
    minus.addEventListener('click', function () {
      memoStyle.sizePx = clamp(memoStyle.sizePx - 1, MEMO_SIZE_MIN, MEMO_SIZE_MAX);
      persistMemoStyle(); syncTextEditStyle();
    });
    plus.addEventListener('click', function () {
      memoStyle.sizePx = clamp(memoStyle.sizePx + 1, MEMO_SIZE_MIN, MEMO_SIZE_MAX);
      persistMemoStyle(); syncTextEditStyle();
    });
    size.appendChild(minus); size.appendChild(label); size.appendChild(plus);
    bar2.appendChild(size);

    var swatch = el('button', 'annot-tb-swatch');
    swatch.type = 'button';
    swatch.title = '글자 색';
    swatch.style.background = memoStyle.color;
    swatch.addEventListener('click', function () { toggleMemoColorPop(swatch); });
    bar2.appendChild(swatch);

    var cancel = el('button', '', '취소');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { finishTextEditor(false); });
    var ok = el('button', 'annot-tb-ok', '완료');
    ok.type = 'button';
    ok.addEventListener('click', function () { finishTextEditor(true); });
    bar2.appendChild(cancel);
    bar2.appendChild(ok);

    document.body.appendChild(bar2);
    return { bar: bar2, swatch: swatch, sizeLabel: label };
  }

  function toggleMemoColorPop(anchor) {
    if (memoColorPop) { closeMemoColorPop(); return; }
    var pop = el('div', 'annot-color-pop');
    stopBubble(pop);
    var addGrid = function (title, colors) {
      if (!colors.length) return;
      pop.appendChild(el('span', '', title));
      var grid = el('div', 'annot-color-grid');
      colors.forEach(function (c) {
        var b = el('button', memoStyle.color === c ? 'on' : '');
        b.type = 'button';
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', function () {
          memoStyle.color = c;
          persistMemoStyle();
          syncTextEditStyle();
          var kids = pop.querySelectorAll('.annot-color-grid button');
          for (var i = 0; i < kids.length; i += 1) kids[i].classList.toggle('on', kids[i] === b);
        });
        grid.appendChild(b);
      });
      pop.appendChild(grid);
    };
    addGrid('기본 색상', MEMO_COLORS);
    addGrid('최근 색상', memoRecent);
    pop.appendChild(el('span', '', '세밀 색상 (RGB)'));
    var picker = document.createElement('input');
    picker.type = 'color';
    picker.value = /^#[0-9a-fA-F]{6}$/.test(memoStyle.color) ? memoStyle.color : '#1e2320';
    picker.addEventListener('input', function () {
      memoStyle.color = picker.value;
      persistMemoStyle();
      syncTextEditStyle();
    });
    pop.appendChild(picker);
    document.body.appendChild(pop);
    memoColorPop = pop;
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = clamp(r.left + r.width / 2 - pw / 2, 6, Math.max(6, window.innerWidth - pw - 6)) + 'px';
    pop.style.top = Math.max(6, r.top - ph - 8) + 'px';
  }

  function textOutsideDown(e) {
    if (!textEdit) return;
    var t = e.target;
    if (t && t.closest && (t.closest('.annot-text-edit') || t.closest('#annotTextBar')
        || t.closest('.annot-color-pop') || t.closest('#annotBar') || t.closest('.annot-pop'))) return;
    swallowDown = e;                 // 이 탭은 "닫기"였다 — 같은 탭으로 새 메모를 열지 않는다
    finishTextEditor(true);          // 재원이형과 동일: 밖을 누르면 자동 저장
  }

  function closeTextEditorUI() {
    closeMemoColorPop();
    if (textEdit) {
      if (textEdit.wrap && textEdit.wrap.parentNode) textEdit.wrap.parentNode.removeChild(textEdit.wrap);
      if (textEdit.bar && textEdit.bar.parentNode) textEdit.bar.parentNode.removeChild(textEdit.bar);
    }
    textEdit = null;
    document.removeEventListener('pointerdown', textOutsideDown, true);
  }

  /* 편집 종료. save=true면 내용 반영(빈 값 = 삭제), false면 아무것도 바꾸지 않는다. */
  function finishTextEditor(save) {
    if (!textEdit || textEditBusy) return;
    textEditBusy = true;
    var ed = textEdit;
    var value = save ? String(ed.area.value || '').trim() : null;
    try {
      closeTextEditorUI();
      if (save) applyTextEdit(ed, value);
    } finally { textEditBusy = false; }
    autoReturnPen('text');           // v10.5 — 편집창이 닫히는 순간이 "메모 작업 끝"
  }

  function applyTextEdit(ed, value) {
    var list = S.pages[ed.page] || [];
    if (!value) {                    // 빈 값 = 삭제(신규였다면 아무 일도 없음)
      if (!ed.id) return;
      commitPage(ed.page, list.filter(function (it) { return it.id !== ed.id; }), { snapshot: true });
      return;
    }
    var W = Math.max(1, (ed.root && ed.root.clientWidth) || getGlobalPageSize().w);
    var H = Math.max(1, (ed.root && ed.root.clientHeight) || getGlobalPageSize().h);
    var ratio = memoSizeRatio();
    var fit = measureTextBox(value, ratio, W, H);
    addRecentMemoColor(memoStyle.color);
    if (ed.id) {
      commitPage(ed.page, list.map(function (it) {
        if (it.id !== ed.id) return it;
        var c = deepCopy(it);
        c.text = value; c.w = fit.w; c.h = fit.h;
        c.sizeRatio = ratio; c.color = memoStyle.color; c.textColor = memoStyle.color;
        return c;
      }), { snapshot: true });
    } else {
      // 새 메모는 실측한 상자가 페이지 안에 들어오도록 시작점을 당긴다
      // (오른쪽·아래 끝에 찍으면 글자가 잘려 나가던 문제 — foreignObject는 overflow:hidden)
      var next = list.slice();
      next.push({
        id: uid(), type: 'text',
        x: clamp(ed.x, 0, Math.max(0, 1 - fit.w)), y: clamp(ed.y, 0, Math.max(0, 1 - fit.h)),
        w: fit.w, h: fit.h, text: value,
        color: memoStyle.color, textColor: memoStyle.color, sizeRatio: ratio
      });
      commitPage(ed.page, next, { snapshot: true });
    }
  }

  /* 편집기 열기. existing이 있으면 그 메모를 수정, 없으면 pos 자리에 새 메모. */
  function openTextEditor(root, pageNum, pos, existing) {
    if (textEdit) {                  // 이미 열려 있던 편집은 저장하고 넘어간다 (펜 복귀는 여기서 하지 않음)
      var prev = textEdit;
      var prevValue = String(prev.area.value || '').trim();
      closeTextEditorUI();
      applyTextEdit(prev, prevValue);
    }
    lassoClear();
    var W = Math.max(1, root.clientWidth), H = Math.max(1, root.clientHeight);
    if (existing) {
      memoStyle.color = existing.textColor || existing.color || memoStyle.color;
      memoStyle.sizePx = clamp(Math.round((existing.sizeRatio || 0.018) * MEMO_BASE_W), MEMO_SIZE_MIN, MEMO_SIZE_MAX);
      persistMemoStyle();
    }
    var x = existing ? existing.x : clamp(pos.x, 0, 0.94);
    var y = existing ? existing.y : clamp(pos.y, 0, 0.95);

    var wrap = el('div', 'annot-text-edit');
    wrap.style.left = (x * 100) + '%';
    wrap.style.top = (y * 100) + '%';
    stopBubble(wrap);
    var area = document.createElement('textarea');
    area.setAttribute('placeholder', '여기에 바로 입력…');
    area.value = existing ? (existing.text || '') : '';
    wrap.appendChild(area);
    root.appendChild(wrap);

    var built = buildMemoBar();
    textEdit = {
      page: pageNum, root: root, id: existing ? existing.id : null, x: x, y: y,
      wrap: wrap, area: area, bar: built.bar, swatch: built.swatch, sizeLabel: built.sizeLabel
    };
    syncTextEditStyle();

    area.addEventListener('input', growTextArea);
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishTextEditor(false); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishTextEditor(true); }
    });
    // 열자마자 포커스 (iPad에서 키보드가 바로 올라오게 — 사용자 탭 제스처 안에서 호출됨)
    try { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } catch (e) {}
    document.addEventListener('pointerdown', textOutsideDown, true);
    // 렌더 직후 실제 높이로 한 번 더 (폰트 로딩·%좌표 확정 후)
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(growTextArea);
  }

  // 텍스트 도구로 페이지를 탭했을 때: 기존 메모 위면 수정, 아니면 새 메모
  function handleTextTool(root, pageNum, pos) {
    var list = S.pages[pageNum] || [];
    var existing = null;
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].type === 'text' && annotationContains(list[i], pos)) { existing = list[i]; break; }
    }
    openTextEditor(root, pageNum, pos, existing);
  }

  /* ═══ 8b. 올가미 선택 (원펜 PKLassoTool의 실용 근사) ══════════════════════
     드래그로 자유곡선 폴리곤(점선) → 놓으면 내부 annotation 선택
       (stroke=점 과반, rect/text=박스 겹침 — §1 lassoSelect/rectPolyOverlap)
     → 바운딩 박스(점선) + 미니 메뉴 [삭제/복사/복제/취소]
     → 박스 안 드래그=이동 (live는 SVG transform, 확정은 commitPage snapshot → undo 가능)
     선택·이동은 같은 페이지 안으로 제한 (clampMoveDelta가 0~1 클램프) */

  function freshLassoState() {
    return { mode: 'idle', page: 0, root: null, svgEl: null, lineEl: null, poly: [],
             ids: [], idMap: null, nodes: null, bounds: null, boxEl: null, boxHalo: null, boxAnts: null,
             menuEl: null, moveFrom: null, applied: null, pxW: 1, pxH: 1 };
  }
  var lasso = freshLassoState();
  var LASSO_TAP_SLOP = 12;   // v10.10 이 px 안에서 끝난 제스처 = 탭(개체 하나 선택) — 재원이형과 같은 값

  /* ── v10.1 앱 내부 클립보드 ────────────────────────────────────────────────
     메모리 변수 + localStorage(LS.clip) 이중 보관 → 새로고침·다른 문서로 넘어가도
     붙여넣기 가능. 시스템 클립보드는 쓰지 않음(이미지 복사는 영역선택 기능 담당).
     용량 가드: 직렬화가 1.5MB를 넘으면 localStorage엔 안 쓰고 메모리로만 유지
     (localStorage 쿼터를 필기 설정·프리셋까지 날려먹지 않게). */
  var DUP_OFFSET_PX = 32;          // 복제 오프셋(화면 px) — duplicateOffset의 기준(근거는 §1 주석)
  var CLIP_LS_MAX = 1500000;
  var clipboard = (function () {
    var c = loadJSON(LS.clip, null);
    return (c && c.items && c.items.length) ? c : null;
  })();

  function setClipboard(clip) {
    if (!clip || !clip.items || !clip.items.length) return false;
    clipboard = clip;
    try {
      var s = JSON.stringify(clip);
      if (s.length <= CLIP_LS_MAX) localStorage.setItem(LS.clip, s);
      else localStorage.removeItem(LS.clip);      // 너무 큼 → 이번 세션 메모리에만
    } catch (e) {}
    return true;
  }
  function clipboardCount() { return (clipboard && clipboard.items && clipboard.items.length) || 0; }

  function lassoClear() {
    closeCtxMenu();             // v10.1 롱프레스 붙여넣기 메뉴도 같이 정리
    lassoSetNodeClass('annot-sel-on', false);
    lassoSetNodeClass('annot-sel-lift', false);
    if (lasso.svgEl && lasso.svgEl.parentNode) lasso.svgEl.parentNode.removeChild(lasso.svgEl);
    if (lasso.boxEl && lasso.boxEl.parentNode) lasso.boxEl.parentNode.removeChild(lasso.boxEl);
    if (lasso.menuEl && lasso.menuEl.parentNode) lasso.menuEl.parentNode.removeChild(lasso.menuEl);
    lasso = freshLassoState();
  }

  function idSet(ids) {
    var s = Object.create(null);
    for (var i = 0; i < (ids || []).length; i += 1) s[ids[i]] = 1;
    return s;
  }

  /* B-6 성능: 선택 id 해시를 캐시 (매 move마다 만들지 않게).
     lassoSetIds()로만 교체 — 그래야 노드 캐시와 함께 확실히 무효화된다. */
  function lassoSetIds(ids) {
    lasso.ids = ids || [];
    lasso.idMap = idSet(lasso.ids);
    lasso.nodes = null;
  }
  function lassoIdMap() {
    if (!lasso.idMap) lasso.idMap = idSet(lasso.ids);
    return lasso.idMap;
  }

  function lassoSelectedItems() {
    var list = S.pages[lasso.page] || [];
    var want = lassoIdMap();                       // indexOf 반복(O(n·m)) 대신 해시 조회
    return list.filter(function (it) { return !!want[it.id]; });
  }

  /* B-6 성능: 선택된 <g> 노드 참조 배열을 1회 수집해 캐시.
     구: 이동 move마다 querySelector를 선택 개수만큼(O(선택수 × DOM탐색)) 호출.
     신: SVG 자식을 한 번만 훑어 배열로 — 이후 move는 순수 setAttribute만.
     페이지 재렌더(renderPageSvg)로 노드가 갈리면 lassoRebindNodes()로 다시 수집한다. */
  function lassoNodes() {
    if (lasso.nodes) return lasso.nodes;
    var out = [];
    var ov = overlays.get(lasso.page);
    if (ov && ov.filled && ov.root.isConnected && lasso.ids.length) {
      var want = lassoIdMap();
      var kids = ov.svg.childNodes;
      for (var i = 0; i < kids.length; i += 1) {
        var n = kids[i];
        if (n.getAttribute && want[n.getAttribute('data-id')]) out.push(n);
      }
    }
    lasso.nodes = out;
    return out;
  }

  /* 글로우(drop-shadow 필터)는 요소 하나당 오프스크린 합성이라, 아주 큰 선택에서는
     비용이 커진다. 그 경우 글로우는 생략하고 marching ants 박스로만 선택을 표시한다
     (박스만으로도 무엇이 잡혔는지 충분히 보임 — 성능이 우선). */
  var SEL_GLOW_MAX = 120;
  function lassoSetNodeClass(cls, on) {
    if (!lasso.nodes && !on) return;              // 캐시가 없는데 끄기 = 할 일 없음
    var nodes = lassoNodes();
    if (on && cls === 'annot-sel-on' && nodes.length > SEL_GLOW_MAX) return;
    for (var i = 0; i < nodes.length; i += 1) {
      try { nodes[i].classList.toggle(cls, !!on); } catch (e) {}
    }
  }

  /* 페이지 SVG가 새로 그려진 뒤(commitPage 등) 선택 장식을 다시 입힌다.
     노드 캐시를 버리고 재수집 → 하이라이트 + 박스 + 메뉴 복원. */
  function lassoRebindNodes() {
    lasso.nodes = null;
    lassoSetNodeClass('annot-sel-on', true);
  }

  function lassoCloseMenu() {
    if (lasso.menuEl && lasso.menuEl.parentNode) lasso.menuEl.parentNode.removeChild(lasso.menuEl);
    lasso.menuEl = null;
  }

  /* B-1/B-2 선택 박스: marching ants (SVG). div 테두리로는 점선 흐름 애니메이션이 불가해
     SVG <rect> 2겹(헤일로 + 흐르는 점선)으로 교체했다.
     viewBox 0~1000 + preserveAspectRatio=none → 좌표를 정규화×1000으로 쓰면 컨테이너
     크기가 바뀌어도 CSS %처럼 알아서 따라간다(리사이즈 재계산 불필요).
     선 굵기·점선 간격은 non-scaling-stroke라 화면 px로 고정. */
  var SEL_VB = 1000;
  function lassoShowBox(dx, dy) {
    var b = lasso.bounds;
    if (!b || !lasso.root) return;
    dx = dx || 0; dy = dy || 0;
    if (!lasso.boxEl) {
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'annot-sel-svg');
      svg.setAttribute('viewBox', '0 0 ' + SEL_VB + ' ' + SEL_VB);
      svg.setAttribute('preserveAspectRatio', 'none');
      var halo = document.createElementNS(SVGNS, 'rect');
      halo.setAttribute('class', 'annot-sel-halo');
      halo.setAttribute('rx', '5');
      var ants = document.createElementNS(SVGNS, 'rect');
      ants.setAttribute('class', 'annot-sel-ants');
      ants.setAttribute('rx', '5');
      svg.appendChild(halo);
      svg.appendChild(ants);
      lasso.root.appendChild(svg);
      lasso.boxEl = svg; lasso.boxHalo = halo; lasso.boxAnts = ants;
    }
    var pad = 0.006;
    var x = (b.minX + dx - pad) * SEL_VB, y = (b.minY + dy - pad) * SEL_VB;
    var w = Math.max(1, (b.maxX - b.minX + pad * 2) * SEL_VB);
    var h = Math.max(1, (b.maxY - b.minY + pad * 2) * SEL_VB);
    setAttrs(lasso.boxHalo, { x: x, y: y, width: w, height: h });
    setAttrs(lasso.boxAnts, { x: x, y: y, width: w, height: h });
  }

  /* B-3 이동 중 "들어올림": 살짝 투명 + 그림자 (종이에서 떼어낸 느낌) */
  function lassoSetLift(on) {
    lassoSetNodeClass('annot-sel-lift', !!on);
    if (lasso.boxEl) lasso.boxEl.style.opacity = on ? '0.85' : '';
  }

  /* ── B-4 선택 메뉴 (아이콘 버튼 + title 툴팁) ─────────────────────────────
     구: 이모지+텍스트 라벨 4개가 항상 박스 **오른쪽**에 → 오른쪽 끝 선택에선 화면 밖으로 잘림.
     신: 박스 **위쪽 중앙** 기본 + 보이는 영역 클램프(위가 좁으면 아래로) — computeSelMenuPos(§1).
     잘라내기 추가. 각 버튼은 title로 단축키까지 알려준다. */
  var SEL_ICONS = {
    copy: '<rect x="4.5" y="4.5" width="11" height="14" rx="2"/><rect x="7.5" y="1.5" width="5" height="3.4" rx="1.2"/>',
    cut: '<circle cx="5" cy="15.2" r="2.3"/><circle cx="15" cy="15.2" r="2.3"/><path d="M6.6 13.5 15.2 2.5M13.4 13.5 4.8 2.5"/>',
    dup: '<rect x="1.8" y="6.2" width="10.5" height="11.5" rx="2"/><path d="M6 6.2V4.3a2 2 0 0 1 2-2h8.2a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-1.9"/>',
    del: '<path d="M3.2 5.4h13.6M7.8 5.4V3.9a1.4 1.4 0 0 1 1.4-1.4h1.6a1.4 1.4 0 0 1 1.4 1.4v1.5"/><path d="M5.2 5.4l.8 10.2a2 2 0 0 0 2 1.9h4a2 2 0 0 0 2-1.9l.8-10.2"/><path d="M8.4 8.6v6M11.6 8.6v6"/>',
    close: '<path d="M5.2 5.2 14.8 14.8M14.8 5.2 5.2 14.8"/>',
    // v10.10 메모 수정 (lucide Type 계열 — 대문자 T + 밑줄)
    edit: '<path d="M10 3.2v13.6M4.4 6.2V3.2h11.2v3M7.6 16.8h4.8"/>',
    paste: '<rect x="4.5" y="4.5" width="11" height="14" rx="2"/><rect x="7.5" y="1.5" width="5" height="3.4" rx="1.2"/><path d="M7.6 11h4.8M10 8.6v4.8"/>'
  };
  function selIcon(name) {
    return '<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" '
      + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (SEL_ICONS[name] || '') + '</svg>';
  }

  function makeIconMenu(className) {
    var menu = document.createElement('div');
    menu.className = className;
    // 메뉴 위 입력이 오버레이(root)의 올가미/필기 핸들러로 새지 않게 차단
    menu.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    menu.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    /* v10.9 iPad에서 이 메뉴의 버튼이 **전부** 안 먹던 문제 (Chrome에선 재현 안 됨 = iOS 전용).
       원인 후보가 둘이었고 어느 쪽인지 실기기 없이 가릴 수 없어 둘 다 막았다:
         ⓐ 이 메뉴는 필기 오버레이(.annot-layer) 안에 있는데, 오버레이의 touchstart 가드가
            스타일러스 터치에 preventDefault()를 건다 → iOS는 그러면 합성 click을 안 만든다
            (→ attachOverlayInput의 stylusGuard에서 UI 위는 건너뛰게 예외 처리)
         ⓑ 합성 click 자체가 어떤 이유로든 안 오는 경우
            (→ 여기: click을 기다리지 않고 pointerup에서 바로 실행)
       pointerup으로 실행하되, 뒤따라오는 click이 같은 동작을 두 번 하지 않게 플래그로 막는다.
       "누른 버튼에서 뗐을 때만" 실행 — 눌렀다가 밖으로 끌고 나가면 취소(일반적인 버튼 감각). */
    menu.addBtn = function (iconName, title, fn, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = selIcon(iconName);
      b.title = title;
      b.setAttribute('aria-label', title);
      if (cls) b.className = cls;
      var armed = false, justFired = 0;
      var run = function () {
        justFired = Date.now();
        fn();
      };
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); armed = true; });
      b.addEventListener('pointerleave', function () { armed = false; });
      b.addEventListener('pointercancel', function () { armed = false; });
      b.addEventListener('pointerup', function (e) {
        e.stopPropagation();
        if (!armed) return;
        armed = false;
        run();
      });
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (Date.now() - justFired < 700) return;   // pointerup이 이미 실행함
        run();
      });
      menu.appendChild(b);
      return b;
    };
    menu.addSep = function () {
      var s = document.createElement('span');
      s.className = 'annot-sel-sep';
      menu.appendChild(s);
    };
    /* v10.9 메모 글자크기 조절 — [−] [숫자칸] [+]. 숫자를 직접 쳐도 되고 화살표로 1px씩도 된다.
       편집 바(#annotTextBar)가 이미 쓰는 px 어휘(memoStyle.sizePx)를 그대로 따른다. */
    menu.addSize = function (getPx, setPx) {
      var wrap = document.createElement('span');
      wrap.className = 'annot-sel-size';
      var mk = function (label, delta) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'annot-sel-step';
        b.textContent = label;
        b.title = '글자크기 ' + (delta > 0 ? '키우기' : '줄이기') + ' (1px)';
        b.setAttribute('aria-label', b.title);
        var armed = false, fired = 0;
        var run = function () { fired = Date.now(); setPx(getPx() + delta); input.value = String(getPx()); };
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); armed = true; });
        b.addEventListener('pointerleave', function () { armed = false; });
        b.addEventListener('pointercancel', function () { armed = false; });
        b.addEventListener('pointerup', function (e) { e.stopPropagation(); if (!armed) return; armed = false; run(); });
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (Date.now() - fired < 700) return;
          run();
        });
        return b;
      };
      var input = document.createElement('input');
      input.type = 'number';
      input.min = String(MEMO_SIZE_MIN);
      input.max = String(MEMO_SIZE_MAX);
      input.step = '1';
      input.value = String(getPx());
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-label', '메모 글자크기(px)');
      input.title = '메모 글자크기 — ' + MEMO_SIZE_MIN + '~' + MEMO_SIZE_MAX + 'px (직접 입력 가능)';
      input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      input.addEventListener('change', function () { setPx(Number(input.value)); input.value = String(getPx()); });
      var dec = mk('−', -1), inc = mk('＋', 1);
      wrap.appendChild(dec);
      wrap.appendChild(input);
      wrap.appendChild(inc);
      menu.appendChild(wrap);
      return wrap;
    };
    menu.addText = function (txt, cls) {
      var s = document.createElement('span');
      s.className = cls || 'annot-sel-count';
      s.textContent = txt;
      menu.appendChild(s);
      return s;
    };
    return menu;
  }

  /* 오버레이(root) 중 **화면에 실제로 보이는** 사각형 (root 로컬 px).
     페이지가 화면 위/아래로 반쯤 걸쳐 있어도 메뉴가 보이는 쪽에 남게 하려는 용도. */
  function rootVisibleArea(root) {
    var full = { left: 0, top: 0, w: root.clientWidth || 1, h: root.clientHeight || 1 };
    var r = null;
    try { r = root.getBoundingClientRect(); } catch (e) { return full; }
    if (!r || !r.width || !r.height) return full;
    var vw = window.innerWidth || r.width, vh = window.innerHeight || r.height;
    var sx = r.width / full.w, sy = r.height / full.h;        // CSS transform(줌) 보정
    var left = Math.max(0, (0 - r.left) / sx);
    var top = Math.max(0, (0 - r.top) / sy);
    var right = Math.min(full.w, (vw - r.left) / sx);
    var bottom = Math.min(full.h, (vh - r.top) / sy);
    if (right - left < 40 || bottom - top < 40) return full;  // 거의 안 보임 → 클램프 포기
    return { left: left, top: top, w: right - left, h: bottom - top };
  }

  // 메뉴를 root에 붙인 뒤 실제 크기를 재서 박스 위쪽 중앙 + 화면 클램프로 배치
  function placeMenuOverBounds(menu, root, b) {
    var W = Math.max(1, root.clientWidth), H = Math.max(1, root.clientHeight);
    var pad = 0.006;
    var box = { x: (b.minX - pad) * W, y: (b.minY - pad) * H,
                w: (b.maxX - b.minX + pad * 2) * W, h: (b.maxY - b.minY + pad * 2) * H };
    var size = { w: menu.offsetWidth || 180, h: menu.offsetHeight || 40 };
    var pos = computeSelMenuPos(box, size, rootVisibleArea(root), 10);
    menu.style.left = pos.left + 'px';
    menu.style.top = pos.top + 'px';
  }

  /* 메모 글자크기 읽기/쓰기 (sizeRatio ↔ px, 기준폭 MEMO_BASE_W — 편집 바와 같은 환산).
     크기를 키우면 글자만 커지고 상자는 그대로라 foreignObject(overflow:hidden)에 잘린다 →
     상자(w,h)도 같은 비율로 늘려 준다. 페이지를 넘어가지 않게 위치까지 당긴다. */
  function memoItemSizePx(item) {
    var r = (item && item.sizeRatio) || 0.018;
    return clamp(Math.round(r * MEMO_BASE_W), MEMO_SIZE_MIN, MEMO_SIZE_MAX);
  }
  function memoSetSizePx(id, px) {
    var page = lasso.page;
    var list = (S.pages[page] || []).slice();
    var idx = -1;
    for (var i = 0; i < list.length; i += 1) if (list[i].id === id) { idx = i; break; }
    if (idx < 0 || list[idx].type !== 'text') return;
    var cur = list[idx];
    var next = clamp(Math.round(px) || MEMO_SIZE_MIN, MEMO_SIZE_MIN, MEMO_SIZE_MAX);
    var oldPx = memoItemSizePx(cur);
    if (next === oldPx) return;
    var k = next / oldPx;
    var w = clamp((cur.w || 0.25) * k, 0.02, 1);
    var h = clamp((cur.h || 0.09) * k, 0.02, 1);
    var copy = deepCopy(cur);
    copy.sizeRatio = next / MEMO_BASE_W;
    copy.w = w; copy.h = h;
    copy.x = clamp(cur.x, 0, Math.max(0, 1 - w));
    copy.y = clamp(cur.y, 0, Math.max(0, 1 - h));
    list[idx] = copy;
    commitPage(page, list, { snapshot: true });
    // 상자가 커졌으니 선택 테두리·메뉴 위치도 다시 잡는다 (메뉴는 새로 그려짐)
    lasso.bounds = listBounds([copy]);
    lassoShowSelection();
  }

  /* 선택 상자 안인가 (약간의 여유 포함) — 올가미 onDown의 이동 판정과 같은 규칙·같은 여유값 */
  var LASSO_HIT_PAD = 0.012;
  function insideLassoBounds(pos) {
    var b = lasso.bounds;
    if (!b || !pos) return false;
    return pos.x >= b.minX - LASSO_HIT_PAD && pos.x <= b.maxX + LASSO_HIT_PAD
        && pos.y >= b.minY - LASSO_HIT_PAD && pos.y <= b.maxY + LASSO_HIT_PAD;
  }

  function lassoOpenMenu() {
    lassoCloseMenu();
    if (!lasso.root || !lasso.bounds) return;
    var menu = makeIconMenu('annot-sel-menu');
    menu.addText(lasso.ids.length + '개');
    /* v10.10 메모 하나만 골랐으면 "수정" — 재원이형 picked-menu의 [T 수정] 이식.
       탭 선택이 생기면서 메모를 집는 일이 잦아졌는데, 고쳐 쓰려면 도구를 텍스트로
       바꿔서 다시 탭해야 했다. 이제 선택한 자리에서 바로 편집기가 열린다. */
    if (lasso.ids.length === 1) {
      var only = lassoSelectedItems()[0];
      if (only && only.type === 'text') {
        menu.addBtn('edit', '메모 수정', function () {
          var page = lasso.page, root = lasso.root;
          lassoClear();
          disarmOneShot();                    // 편집으로 넘어가는 것 = 올가미 작업이 끝난 것
          openTextEditor(root, page, { x: only.x, y: only.y }, only);
        });
        // v10.9 글자크기 — 메모를 고른 자리에서 바로. 도구를 바꿔 다시 열 필요 없이
        menu.addSize(function () { return memoItemSizePx(only); },
                     function (px) { memoSetSizePx(only.id, px); });
        menu.addSep();
      }
    }
    menu.addBtn('copy', '복사 (Ctrl+C)', lassoCopy);
    menu.addBtn('cut', '잘라내기 (Ctrl+X)', lassoCut);
    menu.addBtn('dup', '복제 (Ctrl+D)', lassoDuplicate);
    menu.addSep();
    menu.addBtn('del', '삭제 (Delete)', lassoDelete, 'danger');
    menu.addSep();
    // v10.5 선택 해제 = 올가미 작업 완료 → 펜 복귀 (lassoClear 자체는 setTool 등에서도 불려 여기서만 건다)
    menu.addBtn('close', '선택 해제 (Esc)', function () { lassoClear(); autoReturnPen('lasso'); });
    lasso.root.appendChild(menu);
    lasso.menuEl = menu;
    placeMenuOverBounds(menu, lasso.root, lasso.bounds);
  }

  // 선택 확정 직후 / 재렌더 직후 공통: 하이라이트 + 박스 + 메뉴를 한 번에 세운다
  function lassoShowSelection() {
    lasso.mode = 'selected';
    lassoRebindNodes();
    lassoShowBox(0, 0);
    lassoOpenMenu();
  }

  function lassoDelete() {
    var page = lasso.page, ids = lasso.ids;
    if (!ids.length) return;
    var want = lassoIdMap();
    var next = (S.pages[page] || []).filter(function (it) { return !want[it.id]; });
    lassoClear();
    // removeIds: 지운 <g>만 DOM에서 떼어냄 (페이지 전체 SVG 재생성 회피 — 삭제 렉 해소)
    commitPage(page, next, { snapshot: true, removeIds: ids });
    toast('🗑 선택한 필기 ' + ids.length + '개 삭제 (Ctrl+Z로 복구 가능)');
    autoReturnPen('lasso');   // v10.5 삭제 = 올가미 작업 완료 → 펜 복귀
  }

  // 선택 요소를 앱 내부 클립보드로 복사 (여백 롱프레스 / Ctrl+V → 붙여넣기). 선택은 유지.
  function lassoCopy(quiet) {
    var picked = lassoSelectedItems();
    if (!picked.length) { toast('복사할 선택이 없습니다'); return false; }
    if (!setClipboard(makeClipboard(picked))) { toast('⚠️ 복사 실패 — 선택 범위를 다시 잡아 주세요'); return false; }
    if (!quiet) toast('📋 ' + picked.length + '개 복사됨 — 빈 곳 롱프레스나 Ctrl+V로 붙여넣기');
    return true;
  }

  // B-4 잘라내기 = 복사 + 삭제 (복사가 실패하면 지우지 않는다 — 데이터 유실 방지)
  function lassoCut() {
    var n = lasso.ids.length;
    if (!lassoCopy(true)) return;
    lassoDelete();
    toast('✂️ ' + n + '개 잘라냄 — Ctrl+V나 빈 곳 롱프레스로 붙여넣기 (Ctrl+Z로 복구)');
  }

  function lassoDuplicate() {
    var page = lasso.page;
    var picked = lassoSelectedItems();
    if (!picked.length) { lassoClear(); return; }
    // 화면 px 기준 고정 오프셋(32px) → 줌 배율과 무관하게 "우측 아래로 확실히 어긋나 보임"
    var ov = overlays.get(page);
    var W = (ov && ov.root.clientWidth) || (lasso.root && lasso.root.clientWidth) || 820;
    var H = (ov && ov.root.clientHeight) || (lasso.root && lasso.root.clientHeight) || 1160;
    var d = duplicateOffset(picked, W, H, DUP_OFFSET_PX);
    var copies = picked.map(function (it) {
      var c = translateAnnotation(it, d.dx, d.dy);
      c.id = uid();
      return c;
    });
    lassoSetNodeClass('annot-sel-on', false);                 // 원본 하이라이트 해제
    commitPage(page, (S.pages[page] || []).concat(copies), { snapshot: true, addItems: copies });
    lassoSetIds(copies.map(function (c) { return c.id; }));   // 선택을 복제본으로 이동 → 바로 드래그 가능
    lasso.bounds = listBounds(copies);
    lassoShowSelection();
    toast('⧉ ' + copies.length + '개 복제됨 (우측 아래로 어긋나게) — 박스를 드래그하면 이동');
  }

  // 이동 라이브 프리뷰: 데이터는 그대로 두고 선택된 <g>에 SVG transform만 적용 (매 move 재렌더 회피)
  function lassoApplyLiveTransform(dx, dy) {
    var ov = overlays.get(lasso.page);
    if (!ov || !ov.filled) return;
    var vb = ov.svg.viewBox && ov.svg.viewBox.baseVal;
    var W = (vb && vb.width) || ov.root.clientWidth || 1;
    var H = (vb && vb.height) || ov.root.clientHeight || 1;
    var tf = 'translate(' + (dx * W) + ' ' + (dy * H) + ')';
    var nodes = lassoNodes();                 // B-6: querySelector 반복 대신 캐시된 노드 참조
    for (var i = 0; i < nodes.length; i += 1) nodes[i].setAttribute('transform', tf);
  }

  registerTool('lasso', {
    kind: 'custom', cursor: 'crosshair',
    onDown: function (c) {
      // 선택 상태에서 박스(약간의 여유 포함) 안을 누르면 → 이동 시작
      // (판정은 insideLassoBounds 하나로 통일 — onOverlayDown의 "펜으로도 옮기기"와 규칙이 어긋나면 안 된다)
      if (lasso.mode === 'selected' && c.page === lasso.page && insideLassoBounds(c.pos)) {
        lasso.mode = 'moving';
        lasso.moveFrom = c.pos;
        lasso.applied = { dx: 0, dy: 0 };
        lassoCloseMenu();
        lassoSetLift(true);      // B-3 들어올림 효과 시작
        return;
      }
      // 그 외 → 기존 선택 해제 후 새 올가미 그리기
      lassoClear();
      lasso.mode = 'drawing';
      lasso.page = c.page;
      lasso.root = c.root;
      lasso.poly = [c.pos];
      var W = Math.max(1, c.root.clientWidth), H = Math.max(1, c.root.clientHeight);
      lasso.pxW = W; lasso.pxH = H;
      var svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'annot-lasso-svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('preserveAspectRatio', 'none');
      var line = document.createElementNS(SVGNS, 'polyline');
      line.setAttribute('points', (c.pos.x * W) + ',' + (c.pos.y * H));
      svg.appendChild(line);
      c.root.appendChild(svg);
      lasso.svgEl = svg; lasso.lineEl = line;
    },
    onMove: function (c) {
      if (lasso.mode === 'drawing' && lasso.lineEl) {
        var last = lasso.poly[lasso.poly.length - 1];
        if (last && Math.hypot((c.pos.x - last.x) * lasso.pxW, (c.pos.y - last.y) * lasso.pxH) < 3) return;
        lasso.poly.push(c.pos);
        lasso.lineEl.setAttribute('points',
          (lasso.lineEl.getAttribute('points') || '') + ' ' + (c.pos.x * lasso.pxW) + ',' + (c.pos.y * lasso.pxH));
        return;
      }
      if (lasso.mode === 'moving' && lasso.moveFrom) {
        var d = clampMoveDelta(lassoSelectedItems(), c.pos.x - lasso.moveFrom.x, c.pos.y - lasso.moveFrom.y);
        lasso.applied = d;
        lassoApplyLiveTransform(d.dx, d.dy);
        lassoShowBox(d.dx, d.dy);
      }
    },
    onUp: function (c) {
      if (lasso.mode === 'drawing') {
        var poly = lasso.poly;
        var page = lasso.page, root = lasso.root, pxW = lasso.pxW, pxH = lasso.pxH;
        if (lasso.svgEl && lasso.svgEl.parentNode) lasso.svgEl.parentNode.removeChild(lasso.svgEl);
        lasso.svgEl = null; lasso.lineEl = null;
        /* v10.10 탭 = 개체 하나 선택 (재원이형 select 도구 이식).
           구: 짧은 드래그·탭은 그냥 선택 해제였다 → 획 하나를 옮기거나 지우려 해도
               반드시 동그라미를 그려야 했다(펜 흔들림으로 점이 3개를 넘으면 빈 올가미가 되기도).
           신: 손이 움직인 거리가 TAP_SLOP(12px) 안이면 그 자리의 개체를 집는다. */
        var spanX = 0, spanY = 0;
        for (var t = 1; t < poly.length; t += 1) {
          spanX = Math.max(spanX, Math.abs(poly[t].x - poly[0].x) * pxW);
          spanY = Math.max(spanY, Math.abs(poly[t].y - poly[0].y) * pxH);
        }
        if (poly.length < 3 || (spanX < LASSO_TAP_SLOP && spanY < LASSO_TAP_SLOP)) {
          var hit = pickAnnotationAt(S.pages[page] || [], poly[0], pxW, pxH, 13);
          lassoClear();
          if (!hit) return;                                   // 빈 여백 탭 = 선택 해제
          lasso.page = page; lasso.root = root;
          lassoSetIds([hit.id]);
          lasso.bounds = listBounds([hit]);
          lassoShowSelection();
          return;
        }
        var picked = lassoSelect(S.pages[lasso.page] || [], poly);
        if (!picked.length) { lassoClear(); toast('둘러 그린 안에 선택할 필기가 없습니다'); return; }
        lassoSetIds(picked.map(function (it) { return it.id; }));
        lasso.bounds = listBounds(picked);
        lassoShowSelection();
        return;
      }
      if (lasso.mode === 'moving') {
        var d = lasso.applied || { dx: 0, dy: 0 };
        lasso.moveFrom = null;
        lasso.applied = null;
        lassoSetLift(false);                                        // B-3 들어올림 해제
        if (Math.abs(d.dx) < 0.0005 && Math.abs(d.dy) < 0.0005) {   // 사실상 탭 — 이동 없음
          lassoApplyLiveTransform(0, 0);
          lassoShowSelection();
          return;
        }
        var want = lassoIdMap(), page = lasso.page;                 // B-6: indexOf(O(n·m)) → 해시
        var next = (S.pages[page] || []).map(function (it) {
          return want[it.id] ? translateAnnotation(it, d.dx, d.dy) : it;
        });
        commitPage(page, next, { snapshot: true });   // 재렌더되며 라이브 transform도 사라짐
        lasso.bounds = listBounds(next.filter(function (it) { return !!want[it.id]; }));
        lassoShowSelection();                          // 재렌더로 갈린 노드에 하이라이트 재부착
      }
    }
  });

  /* ═══ 8c. 여백 롱프레스 → 붙여넣기 메뉴 (v10.1) ═════════════════════════
     발동 조건 (기존 필기와 절대 충돌하지 않게 전부 AND):
       ① 그리기 도구(펜/형광펜/연필)로 시작한 제스처일 것
          — 올가미·영역선택·지우개·텍스트 중에는 아예 타이머를 걸지 않음
       ② 클립보드가 비어 있지 않을 것 (비면 메뉴를 띄우지 않음 = 기존 필기 그대로)
       ③ 누른 지점이 **빈 여백**일 것 (근처에 기존 필기가 없음)
          — 필기 위 롱프레스를 제외한 이유: 이미 그린 글씨를 고치려고 펜을 얹고 잠깐
            멈추는 동작이 흔해서 오발동 위험이 큼. 반면 빈 여백에서 500ms를 가만히
            버티는 건 "여기에 뭔가 넣겠다"는 의도로 해석해도 무리가 없음(여백 우선).
       ④ LONGPRESS_MS(520ms) 동안 손가락/펜이 LONGPRESS_SLOP(7px) 이내로 유지
       ⑤ 그 사이 실제로 그려진 게 사실상 없을 것 (점 ≤3개 & 경로 길이 ≤ slop)
     발동하면 진행 중이던 획을 abortActiveStroke로 취소(undo 스냅샷까지 되돌림)하고
     메뉴를 띄운다 → 펜을 대면 바로 획이 시작되는 기존 동작은 그대로 유지된다. */

  var LONGPRESS_MS = 520, LONGPRESS_SLOP = 7;
  var lpTimer = null, ctxMenuEl = null;

  function cancelLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

  function closeCtxMenu() {
    if (ctxMenuEl && ctxMenuEl.parentNode) ctxMenuEl.parentNode.removeChild(ctxMenuEl);
    ctxMenuEl = null;
  }

  /* 누른 지점 근처(≈14px)에 기존 필기가 있는지 — 있으면 롱프레스 발동 안 함(여백 우선).
     펜을 댈 때마다 도는 경로라 바운딩 박스로 먼저 걸러 점 단위 거리계산을 최소화한다. */
  function isBlankSpot(page, pos, W, H, skip) {
    var list = S.pages[page] || [];
    var mx = 14 / Math.max(1, W), my = 14 / Math.max(1, H);
    for (var i = 0; i < list.length; i += 1) {
      var it = list[i];
      if (!it || it === skip) continue;      // skip = 지금 막 시작한 획(자기 자신)
      var b = annotationBounds(it);
      if (!b || pos.x < b.minX - mx || pos.x > b.maxX + mx
             || pos.y < b.minY - my || pos.y > b.maxY + my) continue;    // 박스 밖 → 확실히 여백
      if (it.type === 'stroke') { if (strokeHit(it, pos, W, H, 14)) return false; }
      else return false;                                                 // rect/text는 박스 겹침이면 필기 위
    }
    return true;
  }

  function maybeStartLongPress(root, pageNum, pos, event) {
    cancelLongPress();
    if (!clipboardCount()) return;
    /* 사진 위 롱프레스는 pageimg의 "사진 선택"이 가져간다 — 여긴 잉크가 없어 여백으로 보이지만
       붙여넣기 메뉴를 띄우면 두 동작이 겹쳐 깜빡인다. 사진이 있으면 아예 타이머를 안 건다. */
    try {
      if (global.PageImg && global.PageImg.hasImageAt &&
          global.PageImg.hasImageAt(pageNum, pos.x, pos.y)) return;
    } catch (e) { /* pageimg 미로드 환경(quiz 등)은 그냥 진행 */ }
    var W = Math.max(1, root.clientWidth), H = Math.max(1, root.clientHeight);
    var g0 = gesture;
    // 이 시점엔 방금 시작한 획이 이미 S.pages에 들어가 있으므로 여백 판정에서 자기 자신은 뺀다
    if (!isBlankSpot(pageNum, pos, W, H, g0 && g0.stroke)) return;
    g0.lpX = event.clientX; g0.lpY = event.clientY; g0.lpMoved = 0;
    lpTimer = setTimeout(function () {
      lpTimer = null;
      if (gesture !== g0 || gesture.kind !== 'stroke') return;      // 이미 끝난 제스처
      if (gesture.lpMoved > LONGPRESS_SLOP) return;                  // 움직였음 = 필기 중
      var pts = gesture.stroke.points || [];
      if (pts.length > 3) return;                                    // 점이 쌓였음 = 필기 중
      var len = 0;
      for (var i = 1; i < pts.length; i += 1) len += Math.hypot((pts[i].x - pts[i - 1].x) * W, (pts[i].y - pts[i - 1].y) * H);
      if (len > LONGPRESS_SLOP) return;
      abortActiveStroke();                                           // 진행 중 획 취소(스냅샷 롤백)
      openPasteMenu(root, pageNum, pos);
    }, LONGPRESS_MS);
  }

  function openPasteMenu(root, pageNum, pos) {
    closeCtxMenu();
    if (!clipboardCount()) return;
    var menu = makeIconMenu('annot-sel-menu annot-ctx-menu');
    menu.addBtn('paste', '여기에 붙여넣기 (Ctrl+V)', function () { closeCtxMenu(); pasteAt(root, pageNum, pos); });
    menu.addText(clipboardCount() + '개 붙여넣기', 'annot-sel-label');
    menu.addSep();
    menu.addBtn('close', '취소 (Esc)', closeCtxMenu);
    root.appendChild(menu);
    ctxMenuEl = menu;
    // 누른 지점을 0크기 박스로 보고 그 아래(위가 좁으면 위)에 배치 + 화면 경계 클램프
    placeMenuOverBounds(menu, root, { minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y });
    // 다른 곳을 누르면 닫힘 (한 번만)
    setTimeout(function () {
      document.addEventListener('pointerdown', function once(e) {
        if (menu.contains(e.target)) return;
        document.removeEventListener('pointerdown', once, true);
        if (ctxMenuEl === menu) closeCtxMenu();
      }, true);
    }, 0);
  }

  function pasteAt(root, pageNum, pos) {
    var items = pasteClipboard(clipboard, pos, uid);
    if (!items.length) { toast('붙여넣을 게 없습니다'); return; }
    commitPage(pageNum, (S.pages[pageNum] || []).concat(items), { snapshot: true, addItems: items });
    // 붙여넣은 것들을 올가미 선택 상태로 → 바로 드래그해서 위치 조정 가능
    lassoClear();
    if (S.tool !== 'lasso') setTool('lasso');       // 박스 드래그가 바로 먹히게 도구 전환 (setTool이 lassoClear 호출)
    lasso.page = pageNum;
    lasso.root = root;
    lassoSetIds(items.map(function (it) { return it.id; }));
    lasso.bounds = listBounds(items);
    lassoShowSelection();
    toast('📋 ' + items.length + '개 붙여넣음 — 올가미로 전환됐어, 박스를 드래그하면 이동');
  }

  /* Ctrl+V 붙여넣기 지점: 현재 페이지에서 **화면에 보이는 영역의 중앙**.
     (롱프레스와 달리 좌표 힌트가 없으므로 "지금 보고 있는 곳"이 가장 덜 놀랍다) */
  function pasteAtVisibleCenter() {
    if (!clipboardCount()) return false;
    var p = lastActivePage || getCurP();
    var ov = overlays.get(p);
    if (!ov || !ov.root.isConnected) return false;
    var W = Math.max(1, ov.root.clientWidth), H = Math.max(1, ov.root.clientHeight);
    var a = rootVisibleArea(ov.root);
    var cx = (a.left + a.w / 2) / W, cy = (a.top + a.h / 2) / H;
    pasteAt(ov.root, p, { x: clamp(cx - (clipboard.w || 0) / 2), y: clamp(cy - (clipboard.h || 0) / 2) });
    return true;
  }

  /* ── B-5 키보드 단축키 ─────────────────────────────────────────────────────
     Delete/Backspace=삭제 · Esc=선택 해제 · Ctrl+C/X/D=복사/잘라내기/복제 · Ctrl+V=붙여넣기.
     ⚠️ Ctrl+C/X/V의 preventDefault는 브라우저의 copy/paste 이벤트까지 막으므로
     **올가미 선택이 실제로 있을 때만**(V는 올가미 도구 + 클립보드 있을 때만) 가로챈다.
     그래야 HTML 쪽 이미지·풀해설 붙여넣기 같은 기존 기능과 절대 충돌하지 않는다. */
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('input,textarea,select,[contenteditable="true"]')) return;
    var hasSel = lasso.mode === 'selected' && lasso.ids.length > 0;
    if (e.key === 'Escape') {
      if (hasSel || ctxMenuEl) { e.preventDefault(); lassoClear(); autoReturnPen('lasso'); }
      return;
    }
    var ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl && hasSel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault(); lassoDelete(); return;
    }
    if (!ctrl || e.altKey) return;
    var k = String(e.key || '').toLowerCase();
    if (hasSel && k === 'c') { e.preventDefault(); lassoCopy(); }
    else if (hasSel && k === 'x') { e.preventDefault(); lassoCut(); }
    else if (hasSel && k === 'd') { e.preventDefault(); lassoDuplicate(); }
    else if (k === 'v' && S.enabled && S.tool === 'lasso' && clipboardCount()) {
      if (pasteAtVisibleCenter()) e.preventDefault();
    }
  });

  /* ═══ 9. 원펜 제스처: 2손가락 더블탭=undo, 3손가락 더블탭=redo ═══════════ */

  (function initTapGestures() {
    var left = document.getElementById('left');
    if (!left) return;
    var touches = new Map();   // pointerId -> {x,y}
    var maxCount = 0, startT = 0, moved = false;
    var lastTap = { count: 0, t: 0 };

    /* ★ 유실된 손가락(좀비) 청소 — 2026-08-17 실사용 버그의 근본 원인.
       pointerdown 뒤 pointerup/pointercancel이 끝내 오지 않으면 그 id가 touches에 영영 남고,
       onEnd의 `if (touches.size) return;`에 걸려 **이후 모든 더블탭이 영구히 무시**됐다
       (신고: "10분쯤 쓰면 두 번 탭 되돌리기만 먹통, 터치 자체는 정상").
       up이 유실되는 실제 경로: 핀치 중 암묵 캡처 대상이던 캔버스가 재렌더로 DOM에서 빠질 때,
       손가락을 자료 밖(툴바·우측 패널·화면 가장자리)에서 뗄 때, iOS 시스템 제스처에 터치를 뺏길 때.
       제스처가 새로 시작될 때마다 오래된 엔트리를 버려 스스로 회복한다. */
    var STALE_MS = 4000;                            // 더블탭 판정(480ms)보다 훨씬 길어 정상 제스처는 영향 없음
    var IDLE_RESET_MS = 1200;                       // 이만큼 아무 포인터 이벤트가 없다가 새로 눌리면 = 새 제스처
    var lastPtrActivity = 0;
    function purgeStale(now) {
      /* ① 새 제스처의 첫 손가락이면 묵은 엔트리를 통째로 버린다 — 좀비가 생겨도 **다음 시도에서 즉시** 회복.
            진짜 손가락이 닿아 있는 동안에는 move가 계속 와 lastPtrActivity가 갱신되므로 여기 걸리지 않는다.
            (손가락 하나를 1.2초 넘게 완전히 정지시킨 뒤 두 번째를 대는 경우만 초기화되는데, 그건 더블탭이 아니다.) */
      if (now - lastPtrActivity > IDLE_RESET_MS) touches.clear();
      // ② 그래도 남은 오래된 엔트리 청소 (한 손가락은 살아 움직이고 다른 하나만 유실된 경우)
      touches.forEach(function (v, id) { if (now - (v.t || 0) > STALE_MS) touches.delete(id); });
      touchDownCount = touches.size;
    }

    left.addEventListener('pointerdown', function (e) {
      /* v10.11: 예전엔 필기 모드가 켜져 있을 때만 제스처를 받았다. 그래서 자료를 읽기만 하다
         두 손가락 더블탭을 하면 아무 일도 없어 "기능이 없어진 것"처럼 보였다(실사용 신고).
         되돌릴 필기는 모드와 상관없이 그대로 있으므로 모드와 무관하게 받는다.
         오작동 위험은 낮다 — 14px 이내로 멈춘 채, 320ms 안에, 480ms 안에 두 번이어야 성립한다. */
      if (e.pointerType !== 'touch') return;
      var now = performance.now();
      purgeStale(now);
      lastPtrActivity = now;
      /* ★ 2026-08-24 실사용 신고("빠르게 여러 번 누르면 더블탭이 안 먹는다") 수정:
         연타하면 직전 탭의 손가락이 다 떨어지기 전에 다음 탭이 시작된다. 예전엔 touches 가
         **완전히 빌 때만** 기준점을 다시 잡아서, 남은 손가락 하나가 startT 를 옛 탭에 묶어
         두면 dur 이 320ms 를 영영 넘겨 그 뒤 탭이 전부 무효가 됐다(게다가 lastTap 까지 리셋돼
         짝짓기 리듬이 끊긴다). 이미 탭으로 성립할 수 없을 만큼(320ms) 묵은 그룹이면
         손가락이 남아 있어도 새 그룹으로 시작한다. */
      if (!touches.size || now - startT > 320) { maxCount = 0; startT = now; moved = false; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now });
      touchDownCount = touches.size;                // onOverlayDown의 멀티터치 가드용 (캡처 단계라 먼저 갱신됨)
      maxCount = Math.max(maxCount, touches.size);
      if (touches.size >= 2) abortActiveStroke();   // 두 번째 손가락 → 진행 중 획 취소(제스처로 간주)
    }, true);

    left.addEventListener('pointermove', function (e) {
      var s = touches.get(e.pointerId);
      if (!s) return;
      s.t = lastPtrActivity = performance.now();    // 살아 있는 손가락 표시 (오래 눌러도 좀비로 오해받지 않게)
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 14) moved = true;
    }, true);

    function onEnd(e) {
      if (!touches.has(e.pointerId)) return;
      lastPtrActivity = performance.now();
      touches.delete(e.pointerId);
      touchDownCount = touches.size;
      if (touches.size) return;
      var dur = performance.now() - startT;
      var now = performance.now();
      if (!moved && dur < 320 && maxCount >= 2) {
        /* 짝짓기 창 480 → 600ms (2026-08-24): 연타할수록 두 탭 사이가 고르지 않은데,
           480ms 는 사람이 리듬을 잃는 순간 바로 빠져나갔다. 오작동 위험은 그대로 낮다 —
           14px 이내로 멈춘 채 320ms 안에 끝난 **두 손가락 이상** 탭이 두 번이어야 성립한다. */
        if (lastTap.count === maxCount && (now - lastTap.t) < 600) {   // 더블탭 성립
          if (maxCount === 2) { if (undoPage()) toast('↩️ 실행 취소'); }
          else if (maxCount >= 3) { if (redoPage()) toast('↪️ 다시 실행'); }
          /* 되돌릴 게 없으면 undoPage/redoPage 가 false 를 내고 아무 일도 안 일어난다 */
          lastTap = { count: 0, t: 0 };
        } else {
          lastTap = { count: maxCount, t: now };
        }
      } else if (moved || dur >= 320) {
        lastTap = { count: 0, t: 0 };
      }
      maxCount = 0;
    }
    left.addEventListener('pointerup', onEnd, true);
    left.addEventListener('pointercancel', onEnd, true);
    /* 손가락을 자료 밖(툴바·우측 패널·화면 가장자리)에서 떼면 #left에는 up이 오지 않는다 →
       문서 전체에서도 받아 제때 정리한다. onEnd는 모르는 id면 즉시 반환하므로 중복 호출도 안전하다. */
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('pointercancel', onEnd, true);
  })();

  /* ═══ 10. 저장 파이프라인 ════════════════════════════════════════════════
     변경 → 650ms 디바운스 → POST /api/ink/save {filename, inkByPage(전체 blob)}
     실패 시 500/1500ms 간격 3회 재시도 → 그래도 실패면 배지 '⚠ 저장실패'(누르면 수동 재시도).
     페이지 이탈 시: server.js가 Content-Type 무관 JSON.parse 하므로 sendBeacon 사용 가능.
     단, 플랫폼판(platform_shim.js)은 window.fetch만 가로채므로 fetch가 네이티브가 아니면
     keepalive fetch로 대체(→ IndexedDB 경유 저장 유지). */

  var dirtyRev = 0, savedRev = 0, saveTimer = null, saving = false;

  function markDirty() {
    if (!S.doc) return;
    dirtyRev += 1;
    setSaveState('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; saveNow(); }, 650);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function saveNow() {
    if (saving) return Promise.resolve(false);
    if (!S.doc) return Promise.resolve(true);
    if (window.__pdfPinching) {
      // 핀치 제스처 중에는 문서 전체 잉크 직렬화(JSON.stringify)를 미룬다 — "필기 직후 핀치"에서
      // 650ms 디바운스가 제스처 한복판에 발화해 프레임을 떨구던 경로 (2026-08-24 감사).
      // ★ false를 바로 돌려주면 안 된다 — flush()가 이 반환값을 저장 성패로 해석해
      //   빈 페이지 삽입 등이 "필기 저장 실패"로 롤백된다(리뷰에서 검출). 끝난 뒤 저장하고 그 결과를 전달.
      return sleep(250).then(saveNow);
    }
    saving = true;
    setSaveState('saving');
    var run = (async function () {
      try {
        while (savedRev < dirtyRev) {
          var target = dirtyRev;
          var doc = S.doc;
          var body = JSON.stringify({ filename: doc, inkByPage: S.pages });
          var ok = false, lastErr = null;
          for (var attempt = 0; attempt < 3; attempt += 1) {
            try {
              var r = await fetch('/api/ink/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              ok = true;
              break;
            } catch (e) {
              lastErr = e;
              if (attempt < 2) await sleep([500, 1500][attempt]);
            }
          }
          if (!ok) {
            setSaveState('error', lastErr && lastErr.message);
            return false;
          }
          if (S.doc !== doc) return true;   // 저장 도중 문서 전환 — 새 문서 쪽에서 다시 관리
          savedRev = Math.max(savedRev, target);
        }
        setSaveState('saved');
        return true;
      } finally { saving = false; }
    })();
    return run;
  }

  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (savedRev >= dirtyRev) return true;
    // 진행 중 저장이 있으면 끝날 때까지 대기 후 재확인
    while (saving) await sleep(80);
    if (savedRev >= dirtyRev) return true;
    return saveNow();
  }

  function isFetchNative() {
    try { return /\[native code\]/.test(String(window.fetch)); } catch (e) { return true; }
  }

  function beaconFlush() {
    if (!S.doc || savedRev >= dirtyRev) return;
    var body = JSON.stringify({ filename: S.doc, inkByPage: S.pages });
    var sent = false;
    if (isFetchNative() && navigator.sendBeacon) {
      try { sent = navigator.sendBeacon('/api/ink/save', new Blob([body], { type: 'application/json' })); } catch (e) {}
    }
    if (!sent) {
      try { fetch('/api/ink/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {}); sent = true; } catch (e) {}
    }
    if (sent) savedRev = dirtyRev;
  }
  window.addEventListener('pagehide', beaconFlush);
  window.addEventListener('beforeunload', beaconFlush);

  /* ═══ 11. 로드 / 문서 전환 ══════════════════════════════════════════════ */

  async function getPageBaseSize(p) {
    if (pageSizeCache.has(p)) return pageSizeCache.get(p);
    var size = null;
    var doc = getPdfDoc();
    if (doc) {
      try {
        var pg = await doc.getPage(p);
        var vp = pg.getViewport({ scale: 1 });
        size = { w: vp.width, h: vp.height };
      } catch (e) {}
    }
    if (!size) size = getGlobalPageSize();
    pageSizeCache.set(p, size);
    return size;
  }

  async function normalizeInkData(raw) {
    var pages = {}, legacy = 0;
    var keys = Object.keys(raw || {});
    for (var i = 0; i < keys.length; i += 1) {
      var pn = parseInt(keys[i], 10);
      if (!pn || pn < 1) continue;
      var items = raw[keys[i]];
      if (!Array.isArray(items) || !items.length) continue;
      var hasLegacy = items.some(isLegacyStroke);
      var baseW = 820, baseH = 1160;
      if (hasLegacy) {   // 레거시 좌표는 pdf.js scale=1 절대값 → 페이지 기준 크기 필요
        var s = await getPageBaseSize(pn);
        baseW = s.w; baseH = s.h;
      }
      var res = normalizeInkPage(items, baseW, baseH);
      legacy += res.legacyCount;
      if (res.list.length) pages[pn] = res.list;
    }
    return { pages: pages, legacyCount: legacy };
  }

  async function loadInk(name) {
    if (!name) return;
    // 이전 문서의 미저장분은 즉시 전송 시도 (keepalive — 응답은 기다리지 않음)
    if (S.doc && S.doc !== name && savedRev < dirtyRev) {
      try {
        var prevBody = JSON.stringify({ filename: S.doc, inkByPage: S.pages });
        fetch('/api/ink/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: prevBody, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    S.doc = name;
    dirtyRev = 0; savedRev = 0;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    setSaveState('idle');
    var seq = ++S.loadSeq;
    var raw = {};
    try {
      var r = await fetch('/api/ink/load?filename=' + encodeURIComponent(name));
      raw = r.ok ? await r.json() : {};
    } catch (e) { raw = {}; }
    if (seq !== S.loadSeq) return;                 // 로드 중 다른 문서로 전환됨
    var result = await normalizeInkData(raw);
    if (seq !== S.loadSeq) return;
    S.pages = result.pages;
    undoStacks.clear(); redoStacks.clear();
    lastActivePage = null;
    refreshAllOverlays();
    updateToolbarState();
    var n = Object.keys(result.pages).length;
    if (n) {
      toast('🖊️ 필기 ' + n + '페이지 표시' + (result.legacyCount ? ' (원펜 필기 ' + result.legacyCount + '개 변환됨)' : ''));
      if (result.legacyCount) markDirty();          // 변환분을 새 포맷으로 저장해 두기
    }
  }

  function resetDoc() {
    // v10.10 문서를 바꾸기 전에 편집 중이던 메모부터 저장 — 아래 저장 요청에 함께 실린다
    if (textEdit && !textEditBusy) finishTextEditor(true);
    if (S.doc && savedRev < dirtyRev) {
      try {
        var body = JSON.stringify({ filename: S.doc, inkByPage: S.pages });
        fetch('/api/ink/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
    S.doc = null;
    S.pages = {};
    S.loadSeq += 1;
    dirtyRev = 0; savedRev = 0;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    undoStacks.clear(); redoStacks.clear();
    pageSizeCache.clear();
    overlays.clear();          // 페이지 div 자체가 새로 만들어짐 — 다음 ensureOverlay가 재생성
    lassoClear();              // 선택 UI도 페이지 div와 함께 사라짐 — 상태만 정리
    lastActivePage = null;
    gesture = null;
    photoReturnStop();         // v10.5 사진 배치 감시도 문서와 함께 정리
    disarmOneShot();
    setSaveState('idle');
    updateToolbarState();
  }

  /* ── v4 빈 페이지 삽입 지원: from 이상 페이지의 필기를 delta만큼 이동 ──
     undo/redo·페이지 크기 캐시는 페이지 번호 기준이라 시프트 후 무효 → 비움.
     markDirty로 저장 예약 — 호출측(HTML insertBlankPageWeb)이 flush()로 확정. */
  function shiftPages(from, delta) {
    if (!S.doc) return 0;
    var moved = shiftPageKeys(S.pages, from, delta);
    if (!moved) return 0;
    undoStacks.clear(); redoStacks.clear();
    pageSizeCache.clear();
    lassoClear();
    refreshAllOverlays();
    updateToolbarState();
    markDirty();
    return moved;
  }

  /* ═══ 12. 툴바 UI ═══════════════════════════════════════════════════════ */

  var bar = null, presetsWrap = null, popEl = null;
  var toolButtons = {};          // toolId -> button
  var extraButtons = [];         // addToolbarButton 등록분
  var undoBtn = null, redoBtn = null, modeBtn = null;
  var extrasEnd = null;   // v10.9 확장 도구 묶음의 끝(구분자) — addToolbarButton이 이 앞에 넣는다
  var barPos = loadJSON(LS.pos, { centered: true, y: 64 });
  var collapsed = loadJSON(LS.collapsed, true);

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function mkBtn(icon, title, onClick, cls) {
    var b = el('button', 'annot-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.innerHTML = icon;
    b.title = title;
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function sep() { return el('span', 'annot-sep'); }

  /* 가운데 정렬(centered)의 기준이 되는 영역. v10.5부터 "뷰포트 가운데"가 아니라
     "필기 패널 가운데"다 — 뷰포트 가운데는 분할 화면에서 우측 풀해설 위였다.
     reclampBarPos()가 실측해 채워 넣고, applyBarPos는 이 캐시만 읽는다(드래그 중 리플로우 방지). */
  var barAreaCache = null;

  function applyBarPos() {
    if (!bar) return;
    if (barPos.centered) {
      var a = barAreaCache;
      if (a && a.right - a.left > 0) {
        var w = bar.offsetWidth || 0;
        bar.style.left = Math.max(a.left + BAR_MARGIN, a.left + (a.right - a.left - w) / 2) + 'px';
        bar.style.transform = 'none';
      } else {
        bar.style.left = '50%';
        bar.style.transform = 'translateX(-50%)';
      }
      bar.style.top = (barPos.y === undefined ? 64 : barPos.y) + 'px';
    } else {
      bar.style.left = barPos.x + 'px';
      bar.style.top = barPos.y + 'px';
      bar.style.transform = 'none';
    }
  }

  /* ── 툴바 이동 경계 (v10.2) ─────────────────────────────────────────────
     상단 설정바(#tb, position:fixed)를 침범하지 못하게 막는다.
     · 경계는 매번 실측 — safe-area·화면 폭·폰트에 따라 상단바 높이가 달라지므로 고정값 금지
     · 상단바 숨김(body.tb-hidden → #tb{display:none})이면 경계 0.
       대신 그때 뜨는 🔽 복원 버튼(#tbMini)은 "가로로 겹칠 때만" 피한다(= 다른 x에선 맨 위까지 가능)
     · 상단바가 아예 없는 페이지(dist 플랫폼판·quiz.html 등)면 #tb가 없으므로 경계 0으로 폴백 */
  var BAR_GAP = 4;              // 상단바/복원버튼과 띄울 간격
  var BAR_MARGIN = 4;           // 좌·우·아래 뷰포트 여백 (기존 드래그 클램프와 동일)

  function visibleRect(id) {
    var node = null;
    try { node = document.getElementById(id); } catch (e) { return null; }
    if (!node) return null;
    var r = null;
    try { r = node.getBoundingClientRect(); } catch (e) { return null; }
    if (!r || r.width <= 0 || r.height <= 0) return null;   // display:none → 0×0 → 없는 것으로 취급
    return r;
  }

  /* ── v10.5 필기 패널(#left) 경계 ────────────────────────────────────────
     iPad 실사용 피드백: 툴바가 뷰포트 기준으로 움직여 우측 풀해설 패널까지 넘어갔다.
     이제 좌측 자료(필기) 패널 안에만 머문다.
       · #left가 있고 보이면 → 그 사각형이 허용 영역 (분할바 드래그·보기모드 변경 시 재클램프)
       · #left가 있는데 안 보이면("풀해설만 보기" = display:none) → 필기할 곳이 없음 → 툴바 숨김
       · #left 자체가 없는 페이지(quiz.html·플랫폼판 등) → 영역 없음 = 기존 뷰포트 클램프 폴백 */
  function panelState() {
    var node = null;
    try { node = document.getElementById('left'); } catch (e) { return { exists: false, rect: null }; }
    if (!node) return { exists: false, rect: null };
    var r = null;
    try { r = node.getBoundingClientRect(); } catch (e) { return { exists: true, rect: null }; }
    if (!r || r.width <= 1 || r.height <= 1) return { exists: true, rect: null };   // display:none → 0×0
    return { exists: true, rect: r };
  }

  function barLimits() {
    var top = 0, obstacles = [];
    var tbHidden = false;
    try { tbHidden = !!(document.body && document.body.classList.contains('tb-hidden')); } catch (e) {}
    var tb = tbHidden ? null : visibleRect('tb');
    if (tb) top = Math.max(0, tb.bottom + BAR_GAP);
    var mini = visibleRect('tbMini');                        // 상단바 숨김 상태의 복원 버튼
    if (mini) obstacles.push({ left: mini.left - BAR_GAP, right: mini.right + BAR_GAP, bottom: mini.bottom + BAR_GAP });
    var lim = { top: top, obstacles: obstacles, margin: BAR_MARGIN };
    var panel = panelState();
    if (panel.rect) {
      lim.area = { left: panel.rect.left, top: panel.rect.top, right: panel.rect.right, bottom: panel.rect.bottom };
    }
    return lim;
  }

  // 필기 영역이 없는 보기 모드에서 툴바 숨김 (표시만 — 도구/모드 상태는 그대로)
  var barNoPanel = false;
  function syncBarPanelVisibility() {
    var panel = panelState();
    var hide = panel.exists && !panel.rect;
    if (hide !== barNoPanel) {
      barNoPanel = hide;
      if (bar) bar.classList.toggle('annot-nopanel', hide);
      if (hide) closePop();
    }
    return hide;
  }

  /* 현재/저장된 위치를 지금 경계로 다시 물림.
     호출 시점: 툴바 생성 직후, 창 리사이즈·회전, 접기/펼치기, 상단바 숨김/복원, 시트 닫힘.
     이미 상단바를 침범한 채 저장돼 있던 위치도 여기서 교정되고 다시 저장된다. */
  function reclampBarPos() {
    if (!bar) return;
    if (syncBarPanelVisibility()) return;                    // 필기 영역이 없는 보기 모드 — 숨김 (위치 계산 무의미)
    var lim = barLimits();
    barAreaCache = lim.area || null;
    // 툴바가 패널보다 넓으면 그 안에서 두 줄로 접히게 폭 상한을 패널에 맞춘다 → 우측 패널 침범 원천 차단
    bar.style.maxWidth = lim.area
      ? Math.max(120, (lim.area.right - lim.area.left) - BAR_MARGIN * 2) + 'px'
      : '';
    /* 한 줄이 기본. 폭이 모자라면 그때만 두 줄을 허용한다 —
       먼저 한 줄로 되돌려 실제 필요 폭을 재고, 넘칠 때만 wrap 을 건다. */
    bar.classList.remove('annot-wrap');
    if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add('annot-wrap');
    var r = null;
    try { r = bar.getBoundingClientRect(); } catch (e) { return; }
    if (!r || (r.width <= 0 && r.height <= 0)) return;       // 숨김 상태 — 크기를 못 재니 보류
    var vp = { w: window.innerWidth || 0, h: window.innerHeight || 0 };
    var centered = !!barPos.centered;
    var curY = barPos.y === undefined ? 64 : barPos.y;
    // 가운데 정렬은 x가 파생값 — 실측 위치(=패널 가운데)를 그대로 넣어 y만 교정한다
    var curX = centered ? r.left : barPos.x;
    var res = clampToolbarPos({ x: curX, y: curY }, { w: r.width, h: r.height }, vp, lim);
    var changed = res.y !== curY || (!centered && res.x !== barPos.x);
    barPos = centered ? { centered: true, y: res.y } : { centered: false, x: res.x, y: res.y };
    applyBarPos();
    if (changed) saveJSON(LS.pos, barPos);
  }

  /* 분할바 드래그처럼 연속으로 들어오는 변화는 한 틱으로 합친다.
     requestAnimationFrame이 아니라 setTimeout인 이유: 배경 탭·숨은 창에서는 rAF가 멈춰
     보기 모드/분할비가 바뀐 채로 재클램프가 밀린다(돌아왔을 때 툴바가 패널 밖에 있음). */
  var reclampTimer = 0;
  function scheduleReclamp() {
    if (reclampTimer) return;
    reclampTimer = setTimeout(function () {
      reclampTimer = 0;
      try { reclampBarPos(); } catch (e) {}
    }, 16);
  }

  var barDragMoved = false;   // 임계값을 넘겨 실제 드래그가 일어남 → 직후 도착하는 click(탭)은 무시

  // slopPx=0(기본): 즉시 드래그 시작 (⠿ 핸들 전용).
  // slopPx>0: 그만큼 움직인 뒤부터 드래그 — 접힘(간단) 상태처럼 버튼 위에서 시작해도
  //           탭과 충돌하지 않음 (펜슬·손가락·마우스 공통, 임계값 전 탭은 그대로 동작).
  function beginBarDrag(event, slopPx) {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    slopPx = slopPx || 0;
    var rect = bar.getBoundingClientRect();
    var sx = event.clientX, sy = event.clientY;
    var dx = sx - rect.left, dy = sy - rect.top;
    var dragging = !slopPx;
    if (dragging) event.preventDefault();
    // 경계·크기는 드래그 시작 시 1회 실측 — 드래그 중엔 변하지 않으므로
    // 포인터무브마다 레이아웃을 다시 읽지 않아 부드럽게 따라온다(경계는 실시간으로 걸림).
    var size = { w: rect.width, h: rect.height };
    var lim = barLimits();
    var move = function (e) {
      if (!dragging) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < slopPx) return;
        dragging = true;
        barDragMoved = true;
      }
      if (e.cancelable) e.preventDefault();
      var p = clampToolbarPos(
        { x: e.clientX - dx, y: e.clientY - dy }, size,
        { w: window.innerWidth, h: window.innerHeight }, lim
      );
      barPos = { centered: false, x: p.x, y: p.y };
      applyBarPos();
    };
    var up = function () {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      // 툴바는 flex-wrap이라 위치가 바뀌면 줄바꿈으로 크기가 달라질 수 있음 →
      // 끝난 뒤 실제 크기로 한 번 더 물리고 저장 (드래그 중엔 캐시 크기로 부드럽게)
      if (dragging) { reclampBarPos(); saveJSON(LS.pos, barPos); }
      setTimeout(function () { barDragMoved = false; }, 300);   // click은 pointerup 직후 도착
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function setCollapsed(v) {
    collapsed = !!v;
    if (bar) bar.classList.toggle('collapsed', collapsed);
    saveJSON(LS.collapsed, collapsed);
    closePop();
    reclampBarPos();   // 펼치면 커져서 화면 밖/상단바로 넘칠 수 있음 → 즉시 다시 물림
  }

  // 전체화면 시트(과목·자료실 등 모달)가 떠 있는 동안 툴바 "표시만" 숨김.
  // 필기 모드(S.enabled)·도구 상태는 건드리지 않음 — 시트가 닫히면 그대로 복원.
  var toolbarHidden = false;
  function setToolbarHidden(v) {
    v = !!v;
    if (v === toolbarHidden) return;
    toolbarHidden = v;
    if (bar) bar.classList.toggle('annot-hidden', v);
    // v10.10 전체화면 시트가 열리면 메모 편집기·하단 바도 함께 정리 (문서 위에 떠 있으면 안 됨)
    if (v && textEdit && !textEditBusy) finishTextEditor(true);
    if (v) closePop();
    else reclampBarPos();   // 시트가 닫혀 다시 보일 때 — 숨은 동안 바뀐 경계(회전 등) 반영
  }

  function setEnabled(v) {
    S.enabled = !!v;
    document.body.classList.toggle('annot-on', S.enabled);
    applyTouchActionAll();
    updateToolbarState();
    if (!S.enabled) {
      closePop();
      if (textEdit && !textEditBusy) finishTextEditor(true);   // v10.10 필기 모드를 끄면 쓰던 메모는 저장하고 닫기
      lassoClear();
      photoReturnStart();   // 사진 삽입 직후 pageimg가 끈 경우 — 배치가 끝나면 되돌리려고 감시 시작
    } else {
      photoReturnStop();    // 사용자가 직접 다시 켰으면 자동 복귀는 필요 없음
    }
  }

  function setTool(id) {
    if (!toolRegistry[id]) return;
    /* v10.10 편집 중 **다른** 도구로 넘어가면 쓰던 메모는 저장하고 닫는다 (내용이 조용히 사라지지 않게).
       같은 텍스트 도구를 다시 고르는 건 편집을 끊을 이유가 없다 — 그대로 이어 쓴다. */
    if (textEdit && !textEditBusy && id !== 'text') finishTextEditor(true);
    if (id !== 'lasso') lassoClear();   // 다른 도구로 바꾸면 올가미 선택 해제
    S.tool = id;
    // 펜(그리기 도구)으로 바뀌면 = 사용자가 명시적으로 고른 새 기본 → 1회용 예약은 사라진다
    if (toolRegistry[id].kind === 'draw') { S.lastDrawTool = id; disarmOneShot(); }
    if (!S.enabled) setEnabled(true);
    document.body.setAttribute('data-annot-tool', id);
    persistSettings();
    updateToolbarState();
  }

  function applyPreset(preset) {
    S.activePresetId = preset.id;
    S.penSettings = { color: preset.color, width: preset.width, opacity: preset.opacity };
    S.rulerOn = !!preset.straight;      // v10.5 직선 모드는 펜별 설정 — 프리셋을 고르면 그 펜의 값이 실린다
    setTool(preset.tool);
  }

  function findPreset(id) {
    for (var i = 0; i < presets.length; i += 1) if (presets[i].id === id) return presets[i];
    return null;
  }

  function presetKindClass(tool) {
    return tool === 'highlighter' ? 'k-highlighter' : (tool === 'pencil' ? 'k-pencil' : 'k-pen');
  }

  /* ── v10.5 펜 자동 복귀 ─────────────────────────────────────────────────
     iPad 실사용 피드백: 필기하다 지우개를 쓰면 매번 손으로 펜을 다시 고르는 게 번거롭다.
       · 도구 버튼을 **한 번 탭** = 1회용 → 그 작업 한 번이 끝나면 직전 펜으로 자동 복귀
       · **길게 누르기(500ms)** = 고정 → 수동으로 바꿀 때까지 유지 (여러 번 연속 지우기 등)
         (더블탭을 안 쓰는 이유: 이 툴바는 이미 "선택된 버튼 재탭 = 팝오버/해제"를 쓰고 있어 충돌한다.
          지우개는 팝오버 안에 '고정' 스위치도 둬서 롱프레스를 몰라도 발견할 수 있게 했다.)
       · 사용자가 명시적으로 다른 펜(프리셋)을 고르면 그게 새 기본 — 예약은 사라진다
     "작업이 끝났다"의 판정은 도구마다 다르다 → autoReturnPen()을 부르는 지점이 곧 그 정의다. */
  var ONESHOT_HOLD_MS = 500;
  var oneShot = null;          // { tool, snap } — 1회용으로 켜진 도구와 돌아갈 펜
  var autoReturning = false;   // setTool → lassoClear → 복귀 재귀 방지

  function snapshotPen() {
    return {
      presetId: S.activePresetId,
      tool: (toolRegistry[S.lastDrawTool] && toolRegistry[S.lastDrawTool].kind === 'draw') ? S.lastDrawTool : 'pen',
      pen: { color: S.penSettings.color, width: S.penSettings.width, opacity: S.penSettings.opacity },
      rulerOn: S.rulerOn,
      enabled: S.enabled
    };
  }

  // 도구 버튼을 1회용으로 켠다 (sticky=true면 고정 — 예약 없음)
  function armOneShot(toolId, sticky) {
    var snap = oneShot ? oneShot.snap : snapshotPen();   // 지우개→올가미처럼 갈아타도 원래 펜을 기억
    oneShot = sticky ? null : { tool: toolId, snap: snap };
    return oneShot;
  }
  function disarmOneShot() { oneShot = null; }

  /* 도구 사용이 끝난 시점에 호출 — 예약된 도구와 일치하면 직전 펜으로 되돌린다. */
  function autoReturnPen(toolId) {
    if (!oneShot || autoReturning) return false;
    if (toolId && oneShot.tool !== toolId) return false;
    var snap = oneShot.snap;
    oneShot = null;
    autoReturning = true;
    try { restorePen(snap); } finally { autoReturning = false; }
    return true;
  }

  /* 도구 버튼에 "탭=1회용 / 길게=고정"을 붙인다.
     activate(sticky)는 도구를 실제로 켜는 콜백 — 길게 눌러 켠 경우 sticky=true. */
  function bindOneShotButton(btn, activate) {
    var timer = null, held = false, startX = 0, startY = 0;
    var clear = function () { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', function (e) {
      held = false;
      startX = e.clientX; startY = e.clientY;
      clear();
      timer = setTimeout(function () {
        timer = null;
        held = true;
        activate(true);
        toast('📌 고정됨 — 다른 도구를 고를 때까지 유지 (짧게 탭하면 한 번 쓰고 펜으로 복귀)');
      }, ONESHOT_HOLD_MS);
    });
    btn.addEventListener('pointermove', function (e) {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) clear();   // 툴바 드래그 등
    });
    btn.addEventListener('pointerup', clear);
    btn.addEventListener('pointercancel', function () { clear(); held = false; });
    btn.addEventListener('click', function (e) {
      if (held) { held = false; e.preventDefault(); e.stopPropagation(); return; }   // 길게 눌러 이미 처리됨
      activate(false);
    });
    return btn;
  }

  /* ── 사진(🖼️ pageimg.js)만 예외 처리 ─────────────────────────────────────
     사진 삽입은 도구가 아니라 **모드**를 바꾼다: pageimg가 삽입 직후 필기 모드를 꺼서
     (사진을 바로 옮기고 크기 조절하라고) 손이 자유로워진다.
     그래서 "삽입 완료 = 복귀"로 잡으면 배치를 못 한다 → 배치가 끝나는 순간,
     즉 **사진 밖을 처음 탭할 때** 필기 모드와 직전 펜을 되살린다.
     (pageimg.js·HTML은 다른 작업 중이라 수정 금지 — DOM 신호만 읽는 방식으로 붙였다) */
  var photoReturn = null, photoWatching = false;
  var PHOTO_ARM_TTL = 180000;   // 파일 선택창을 열어둔 채 딴짓할 수 있으니 3분이 지나면 예약 폐기

  // 버튼을 누른 시점(=아직 필기 모드일 때)에 돌아갈 펜을 찍어 둔다
  function armPhotoReturn() { photoReturn = S.enabled ? { snap: snapshotPen(), at: Date.now() } : null; }

  function restorePen(snap) {
    var preset = findPreset(snap.presetId);
    if (preset) applyPreset(preset);
    else {
      S.penSettings = snap.pen;
      S.rulerOn = !!snap.rulerOn;
      setTool(snap.tool);
    }
    if (!S.enabled) setEnabled(true);
    updateToolbarState();
  }

  function photoOutsideTap(e) {
    var t = e.target;
    // .pageimg-ui = 사진 선택 프레임/모서리 핸들/✂🗑 버튼 (pageimg.js) — 아직 배치 중이므로 복귀 금지.
    // 이게 빠져 있어서 모서리 핸들을 잡는 순간 "배치 끝"으로 보고 필기 모드를 되살렸다.
    if (t && t.closest && (t.closest('.pageimg-item') || t.closest('.pageimg-ui') ||
        t.closest('#annotBar') || t.closest('.annot-pop'))) return;
    var pending = photoReturn;
    photoReturnStop();
    if (!pending) return;
    restorePen(pending.snap);
    toast('✍️ 사진 배치 끝 — 쓰던 펜으로 돌아왔어');
  }
  function photoReturnStart() {
    if (photoWatching || !photoReturn) return;
    if (Date.now() - photoReturn.at > PHOTO_ARM_TTL) { photoReturn = null; return; }
    photoWatching = true;
    document.addEventListener('pointerdown', photoOutsideTap, true);
  }
  function photoReturnStop() {
    photoReturn = null;
    if (!photoWatching) return;
    photoWatching = false;
    document.removeEventListener('pointerdown', photoOutsideTap, true);
  }

  function renderPresets() {
    if (!presetsWrap) return;
    presetsWrap.innerHTML = '';
    presets.forEach(function (preset) {
      var b = el('button', 'annot-preset ' + presetKindClass(preset.tool) + (preset.straight ? ' straight' : ''));
      b.type = 'button';
      b.title = preset.label + ' · 다시 탭하면 굵기/색/직선 모드 조절' + (preset.straight ? ' (직선 모드 켜짐)' : '');
      b.style.setProperty('--pc', preset.color);
      /* 촉 아래 밴드 두께 = 펜 굵기. 2~8px 로 눌러 담아 굵은 형광펜도 칩을 안 뭉갠다 */
      b.style.setProperty('--pw', Math.min(8, Math.max(2, (preset.width || 3) / 4)) + 'px');
      b.appendChild(el('span', 'dot'));
      b.addEventListener('click', function () {
        var isActive = S.activePresetId === preset.id && S.tool === preset.tool && S.enabled;
        if (isActive) togglePresetPop(b, preset);   // 원펜 방식: 선택된 프리셋 재탭 → 굵기 팝오버
        else { closePop(); applyPreset(preset); }
      });
      b.setAttribute('data-preset-id', preset.id);
      presetsWrap.appendChild(b);
    });
    /* ＋ 프리셋 추가 — v10.9에 뺐다가 되살렸다(재원이형 툴바에 있는 자리).
       펜촉 칩보다 작고 흐리게 둬서 "매번 쓰는 펜" 사이에서 튀지 않게 한다.
       조절 팝오버 안의 추가 경로도 그대로 남는다 — 같은 addCurrentPreset()이다. */
    var add = el('button', 'annot-btn annot-preset-add');
    add.type = 'button';
    add.title = '지금 펜 설정을 프리셋으로 추가';
    add.innerHTML = ICON_PLUS;
    add.addEventListener('click', function () { closePop(); addCurrentPreset(); });
    presetsWrap.appendChild(add);
  }

  // 지금 펜 설정을 새 프리셋으로 추가 (구 툴바 ＋ 버튼 → 프리셋 조절 팝오버로 이사)
  function addCurrentPreset() {
    var next = {
      id: 'custom-' + Date.now(), tool: S.lastDrawTool || 'pen',
      color: S.penSettings.color, width: S.penSettings.width, opacity: S.penSettings.opacity,
      label: '사용자 펜', straight: !!S.rulerOn
    };
    presets = presets.slice(-9);
    presets.push(next);
    persistPresets();
    renderPresets();
    updateToolbarState();
    return next;
  }

  function closePop() {
    if (popEl && popEl.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null;
  }

  function openPop(anchor, build) {
    closePop();
    popEl = el('div', 'annot-pop');
    build(popEl);
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect();
    var pw = popEl.offsetWidth, ph = popEl.offsetHeight;
    var x = clamp(r.left + r.width / 2 - pw / 2, 6, Math.max(6, window.innerWidth - pw - 6));
    var y = r.bottom + 8;
    if (y + ph > window.innerHeight - 6) y = Math.max(6, r.top - ph - 8);
    popEl.style.left = x + 'px';
    popEl.style.top = y + 'px';
  }

  document.addEventListener('pointerdown', function (e) {
    if (!popEl) return;
    if (popEl.contains(e.target)) return;
    if (bar && bar.contains(e.target)) return;   // 툴바 클릭은 각 버튼이 처리
    closePop();
  }, true);

  /* ── v10.6 슬라이더 + 숫자 직접 입력 한 쌍 ────────────────────────────────
     iPad 피드백: 슬라이더만으로는 "정확히 5px"을 맞추기 어렵다 → 값 표시(5px)를 편집 가능한 칸으로.
     반영 시점(터치 환경 기준 판단):
       · 입력 중(input) — 친 값이 그대로 유효할 때만 **즉시** 반영. 슬라이더와 같은 즉시 피드백.
       · 타이핑 도중의 미완성/범위 밖 값("", "1"→"12", "150")은 흘려보낸다.
         입력 중에 강제로 클램프해 칸의 글자를 되돌리면 iOS에서 커서가 튀어 입력이 사실상 불가능해진다.
       · 확정(change/blur/Enter)에서만 클램프하고 칸 표시까지 정규화한다.
         Enter는 blur까지 해서 iPad 숫자 키패드를 닫아 준다.
     opts: { unit, min, max, step, label, get, apply } → { wrap, input, set } */
  function makeNumField(opts) {
    var wrap = el('span', 'annot-num');
    var input = document.createElement('input');
    input.type = 'number';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    // iPad에서 숫자 키패드가 뜨게 (소수 단위면 소수점이 있는 키패드)
    input.setAttribute('inputmode', opts.step < 1 ? 'decimal' : 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', opts.label || '');
    input.title = (opts.label || '') + ' — ' + opts.min + ' ~ ' + opts.max + ' 범위, 벗어나면 자동으로 맞춰짐';
    var set = function (v) { input.value = String(v); };
    set(opts.get());
    wrap.appendChild(input);
    if (opts.unit) wrap.appendChild(el('u', '', opts.unit));

    input.addEventListener('input', function () {
      var r = parseNumField(input.value, opts.min, opts.max, opts.step);
      if (r.ok && !r.clamped) opts.apply(r.value);   // 완성된 유효값만 즉시 반영
    });
    var commit = function () {
      var r = parseNumField(input.value, opts.min, opts.max, opts.step);
      if (!r.ok) { set(opts.get()); return; }        // 빈 값·문자 → 직전 값으로 되돌림
      set(r.value);
      opts.apply(r.value);
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
    });
    // 툴바 드래그(툴바 pointerdown → beginBarDrag)와 팝오버 바깥 탭 감지에 삼켜지지 않게
    input.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    return { wrap: wrap, input: input, set: set };
  }

  /* 재원이형 COLOR_PALETTE 그대로 — 펜에 흔히 쓰는 어두운 6 + 형광펜용 밝은 6 */
  var SWATCHES = [
    '#1e2320', '#6b7280', '#d94c4c', '#e8843c', '#c9a227', '#2e8b57',
    '#3169d8', '#7c5cd6', '#e06c9f', '#FFE25B', '#7DDC9C', '#FF8FB7'
  ];

  function togglePresetPop(anchor, preset) {
    if (popEl && popEl.getAttribute('data-for') === preset.id) { closePop(); return; }
    openPop(anchor, function (pop) {
      pop.setAttribute('data-for', preset.id);

      /* #5 머리줄 — 어느 펜을 만지는 중인지(색 점 + 이름), 직선 스위치, 삭제를 한 줄에 */
      var head = el('div', 'annot-pop-head');
      var headName = document.createElement('b');
      var headDot = document.createElement('i');
      headDot.style.background = preset.color;
      headName.appendChild(headDot);
      headName.appendChild(document.createTextNode(preset.label));
      head.appendChild(headName);
      var headRight = el('span', 'hd-right');
      head.appendChild(headRight);
      pop.appendChild(head);

      /* 펜 ↔ 형광펜 — 같은 자리에서 성격을 바꾼다.
         형광펜으로 넘길 땐 굵기·투명도를 형광펜다운 값으로 끌어올린다(재원이형과 같은 규칙).
         연필 프리셋도 펜 쪽으로 묶어 표시한다 — 두 갈래 전환이라 세 번째 칸을 만들지 않는다. */
      var typeSw = el('div', 'annot-typesw');
      var penTypeBtn = el('button', ''); penTypeBtn.type = 'button';
      penTypeBtn.innerHTML = ICON_PEN + '<span>펜</span>';
      var hiTypeBtn = el('button', ''); hiTypeBtn.type = 'button';
      hiTypeBtn.innerHTML = ICON_HIGHLIGHTER + '<span>형광펜</span>';
      typeSw.appendChild(penTypeBtn);
      typeSw.appendChild(hiTypeBtn);
      pop.appendChild(typeSw);
      var paintType = function () {
        var isHi = preset.tool === 'highlighter';
        hiTypeBtn.classList.toggle('on', isHi);
        penTypeBtn.classList.toggle('on', !isHi);
      };
      paintType();

      /* 굵기·투명도 모두 [숫자칸] + [슬라이더] 한 쌍 (양방향 동기화).
         투명도까지 같이 바꾼 이유: 같은 팝오버 같은 줄 모양이라 한쪽만 편집 가능하면
         나머지도 눌러 보게 된다(발견성이 어긋남). 대신 슬라이더 step을 5 → 1로 낮췄다 —
         숫자로 33%를 쳤는데 슬라이더가 35%로 스냅되면 두 칸이 서로 다른 값을 가리키게 된다. */
      var wLab = el('label', '', '굵기');
      var wIn = document.createElement('input');
      wIn.type = 'range'; wIn.min = '1'; wIn.max = '42'; wIn.step = '0.5'; wIn.value = preset.width;
      var wNum = makeNumField({
        unit: 'px', min: 1, max: 42, step: 0.5, label: preset.label + ' 굵기(px)',
        get: function () { return preset.width; },
        apply: function (v) { preset.width = v; wIn.value = String(v); sync(); }
      });
      /* #5 −/＋ — 슬라이더로 1px 을 맞추기는 손가락으로 어렵다 */
      var wMinus = el('button', 'annot-step', '−'); wMinus.type = 'button'; wMinus.title = '굵기 1px 줄이기';
      var wPlus = el('button', 'annot-step', '＋'); wPlus.type = 'button'; wPlus.title = '굵기 1px 늘리기';
      var stepWidth = function (d) {
        preset.width = Math.min(42, Math.max(1, Math.round((preset.width + d) * 2) / 2));
        wIn.value = String(preset.width); wNum.set(preset.width); sync();
      };
      wMinus.addEventListener('click', function () { stepWidth(-1); });
      wPlus.addEventListener('click', function () { stepWidth(1); });
      wLab.appendChild(wMinus);
      wLab.appendChild(wNum.wrap);
      wLab.appendChild(wPlus);
      wLab.appendChild(wIn);
      pop.appendChild(wLab);

      var oLab = el('label', '', '투명도');
      var oIn = document.createElement('input');
      oIn.type = 'range'; oIn.min = '5'; oIn.max = '100'; oIn.step = '1'; oIn.value = Math.round(preset.opacity * 100);
      var oNum = makeNumField({
        unit: '%', min: 5, max: 100, step: 1, label: preset.label + ' 투명도(%)',
        get: function () { return Math.round(preset.opacity * 100); },
        apply: function (v) { preset.opacity = v / 100; oIn.value = String(v); sync(); }
      });
      oLab.appendChild(oNum.wrap);
      oLab.appendChild(oIn);
      pop.appendChild(oLab);

      /* #5 색 팔레트 — 마지막 칸은 자유 색상(RGB). 색상 피커는 전체 화면 대화상자가 떠서
         고르는 동안 팝오버가 가려지고 흐름이 끊긴다. 자주 쓰는 12색을 먼저 보여 준다. */
      pop.appendChild(el('div', 'annot-pop-sub', '색상'));
      var swWrap = el('div', 'annot-swatches');
      var swBtns = [];
      SWATCHES.forEach(function (hex) {
        var b = el('button', ''); b.type = 'button';
        b.style.background = hex;
        b.title = hex;
        b.setAttribute('data-hex', hex.toLowerCase());
        b.addEventListener('click', function () { preset.color = hex; paintColor(); sync(); });
        swWrap.appendChild(b);
        swBtns.push(b);
      });
      var cWrap = el('button', 'sw-custom'); cWrap.type = 'button';
      cWrap.title = '자유 색상 고르기';
      var cIn = document.createElement('input');
      cIn.type = 'color';
      cIn.value = /^#[0-9a-fA-F]{6}$/.test(preset.color) ? preset.color : '#333333';
      cWrap.appendChild(cIn);
      swWrap.appendChild(cWrap);
      pop.appendChild(swWrap);
      var paintColor = function () {
        var cur = String(preset.color || '').toLowerCase();
        swBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-hex') === cur); });
        headDot.style.background = preset.color;
        if (/^#[0-9a-fA-F]{6}$/.test(preset.color)) cIn.value = preset.color;
      };
      paintColor();

      /* v10.5 직선 모드 — 구 📏 자 버튼을 여기로 흡수.
         "자"는 전역 모디파이어라 어떤 펜에 걸려 있는지 알기 어려웠다.
         이제 펜마다 따로 기억한다(예: 검정 펜은 자유곡선, 빨강 펜은 항상 직선). */
      /* 직선 스위치는 머리줄로 올린다(#5와 같은 자리) — 값 슬라이더들과 성격이 달라
         아래에 섞여 있으면 "굵기·투명도 다음의 또 하나"처럼 읽혔다. */
      var sWrap = el('span', 'annot-straight-lb');
      sWrap.innerHTML = ICON_RULER + '<span>직선</span>';
      var sBtn = el('button', 'annot-switch' + (preset.straight ? ' on' : ''));
      sBtn.type = 'button';
      sBtn.setAttribute('role', 'switch');
      sBtn.setAttribute('aria-checked', preset.straight ? 'true' : 'false');
      sBtn.title = '켜면 이 펜으로 그은 획이 직선이 됨 — 각도 제한 없이 손이 그은 그대로'
        + ' (Shift를 누르고 그으면 1° 격자로 맞춰짐: 수평 0°·수직 90°·45° 정확히)';
      sBtn.appendChild(document.createElement('i'));
      headRight.appendChild(sWrap);
      headRight.appendChild(sBtn);

      /* 삭제 — 지금은 프리셋을 지울 자리가 아예 없었다 */
      var delBtn = el('button', 'annot-pop-del', '삭제'); delBtn.type = 'button';
      delBtn.title = '이 펜을 프리셋에서 지웁니다 (이미 그린 필기는 그대로)';
      delBtn.addEventListener('click', function () {
        if (presets.length <= 1) { toast('⚠️ 펜이 최소 하나는 있어야 합니다'); return; }
        confirmPresetDelete(delBtn, preset);
      });
      headRight.appendChild(delBtn);
      pop.appendChild(el('div', 'annot-pop-hint',
        '직선 모드는 펜마다 따로 저장됩니다. 각도 제한은 없고, Shift를 누르고 그으면 1° 격자로 맞춰집니다.'));

      /* v10.9 구 툴바 ＋ 버튼이 여기로 이사. 지금 설정을 그대로 새 펜으로 복제한다 —
         이 팝오버는 "쓰고 있는 펜"에서 열리므로, 색만 바꿔 한 자루 더 만드는 흐름이 자연스럽다. */
      var addBtn = el('button', 'annot-pop-add');
      addBtn.type = 'button';
      addBtn.textContent = '＋ 이 설정으로 펜 추가';
      addBtn.title = '지금 굵기·색·투명도·직선 모드 그대로 새 프리셋을 만든다 (최대 10개, 오래된 것부터 밀림)';
      addBtn.addEventListener('click', function () {
        addCurrentPreset();
        closePop();
        toast('＋ 펜 추가됨 — 다시 탭하면 색·굵기를 바꿀 수 있습니다');
      });
      pop.appendChild(addBtn);

      var sync = function () {
        persistPresets();
        var btn = presetsWrap && presetsWrap.querySelector('[data-preset-id="' + preset.id + '"]');
        if (btn) {
          btn.style.setProperty('--pc', preset.color);
          btn.classList.toggle('straight', !!preset.straight);
          btn.title = preset.label + ' · 다시 탭하면 굵기/색/직선 모드 조절' + (preset.straight ? ' (직선 모드 켜짐)' : '');
        }
        if (S.activePresetId === preset.id) {
          S.penSettings = { color: preset.color, width: preset.width, opacity: preset.opacity };
          S.rulerOn = !!preset.straight;
          persistSettings();
        }
      };
      sBtn.addEventListener('click', function () {
        preset.straight = !preset.straight;
        sBtn.classList.toggle('on', !!preset.straight);
        sBtn.setAttribute('aria-checked', preset.straight ? 'true' : 'false');
        sync();
      });
      wIn.addEventListener('input', function () {
        preset.width = Number(wIn.value);
        wNum.set(preset.width);          // 슬라이더 → 숫자칸 (반대 방향은 makeNumField의 apply)
        sync();
      });
      oIn.addEventListener('input', function () {
        preset.opacity = Number(oIn.value) / 100;
        oNum.set(Math.round(preset.opacity * 100));
        sync();
      });
      cIn.addEventListener('input', function () {
        preset.color = cIn.value;
        paintColor();
        sync();
      });

      /* 펜 ↔ 형광펜 — 형광펜은 굵고 반투명해야 형광펜답다. 되돌아올 때도 마찬가지. */
      penTypeBtn.addEventListener('click', function () {
        if (preset.tool !== 'highlighter') return;
        preset.tool = 'pen';
        preset.opacity = 1; oIn.value = '100'; oNum.set(100);
        preset.width = Math.min(preset.width, 6); wIn.value = String(preset.width); wNum.set(preset.width);
        paintType(); syncKind();
      });
      hiTypeBtn.addEventListener('click', function () {
        if (preset.tool === 'highlighter') return;
        preset.tool = 'highlighter';
        preset.opacity = 0.32; oIn.value = '32'; oNum.set(32);
        preset.width = Math.max(preset.width, 16); wIn.value = String(preset.width); wNum.set(preset.width);
        paintType(); syncKind();
      });
      /* 종류가 바뀌면 칩 모양(펜촉/사각촉)까지 다시 그려야 한다 — renderPresets 로 통째 갱신 */
      function syncKind() {
        sync();
        if (S.activePresetId === preset.id) { S.lastDrawTool = preset.tool; setTool(preset.tool); }
        renderPresets();
        updateToolbarState();
      }
    });
  }

  /* 프리셋 삭제 — 되돌릴 수 없어 팝오버로 한 번 더 묻는다 (C-9 confirmPop 과 같은 결) */
  function confirmPresetDelete(anchor, preset) {
    var run = function () {
      var i = presets.indexOf(preset);
      if (i < 0) return;
      presets.splice(i, 1);
      if (S.activePresetId === preset.id) applyPreset(presets[Math.max(0, i - 1)] || presets[0]);
      persistPresets();
      renderPresets();
      updateToolbarState();
      closePop();
      toast('🗑 "' + preset.label + '" 펜을 지웠습니다');
    };
    if (window.confirmPop) {
      confirmPop(anchor, { text: '"' + preset.label + '" 펜을 프리셋에서 지울까요?\n이미 그린 필기는 그대로 남습니다.',
                           yes: '🗑 삭제', onYes: run });
      return;
    }
    if (confirm('"' + preset.label + '" 펜을 프리셋에서 지울까요?')) run();
  }

  function toggleSettingsPop(anchor) {
    if (popEl && popEl.getAttribute('data-for') === 'settings') { closePop(); return; }
    openPop(anchor, function (pop) {
      pop.setAttribute('data-for', 'settings');
      pop.appendChild(el('div', 'annot-pop-title', '필기 설정'));

      var press = el('label', 'toggle');
      var pIn = document.createElement('input');
      pIn.type = 'checkbox'; pIn.checked = S.pressureEnabled;
      press.appendChild(pIn);
      press.appendChild(document.createTextNode(' 태블릿 펜 필압 반영'));
      pIn.addEventListener('change', function () { S.pressureEnabled = pIn.checked; persistSettings(); });
      pop.appendChild(press);

      var finger = el('label', 'toggle');
      var fIn = document.createElement('input');
      fIn.type = 'checkbox'; fIn.checked = S.fingerDraw;
      finger.appendChild(fIn);
      finger.appendChild(document.createTextNode(' 손가락으로도 필기 (끄면 손가락=스크롤)'));
      fIn.addEventListener('change', function () {
        S.fingerDraw = fIn.checked;
        persistSettings();
        applyTouchActionAll();
      });
      pop.appendChild(finger);

      /* v10.11 잉크 스타일 — 데이터는 안 바뀌므로 끄고 켜는 즉시 전체 재렌더로 오간다 */
      var ink = el('label', 'toggle');
      var iIn = document.createElement('input');
      iIn.type = 'checkbox'; iIn.checked = S.inkOutline;
      ink.appendChild(iIn);
      ink.appendChild(document.createTextNode(' 부드러운 잉크 — 펜 끝이 붓처럼 빠지는 새 렌더'));
      iIn.addEventListener('change', function () {
        S.inkOutline = iIn.checked;
        persistSettings();
        refreshAllOverlays();
      });
      pop.appendChild(ink);

      var center = el('button', '', '툴바 가운데로');
      center.type = 'button';
      center.addEventListener('click', function () {
        barPos = { centered: true, y: 64 };
        saveJSON(LS.pos, barPos);
        applyBarPos();
        reclampBarPos();   // 상단바가 64px보다 두꺼우면(safe-area 등) 그 아래로 밀어냄
        closePop();
      });
      pop.appendChild(center);
    });
  }

  /* ── v10.5 지우개 통합 (구 🧽 선 지우개 + ✂️ 부분 지우개 → 버튼 1개 + 모드 선택) ──
     재원이형 수정본-2 DrawingToolbar.jsx 방식을 그대로 따랐다:
       · 버튼 아이콘이 곧 현재 모드(획=지우개 / 부분=원+사선)
       · 선택된 상태에서 다시 탭하면 종류 선택 팝오버 (프리셋 재탭 = 굵기 팝오버와 같은 규칙)
       · 고른 종류는 저장돼 다음에도 그 모드로 켜진다
     아이콘은 이모지 대신 lucide 형태의 인라인 SVG — 두 모드가 한눈에 구분되고 테마색(currentColor)을 탄다. */
  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var ICON_ERASER_LINE = svgIcon('<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>'
    + '<path d="M22 21H7"/><path d="m5 11 9 9"/>');
  var ICON_ERASER_PARTIAL = svgIcon('<line x1="2" y1="2" x2="22" y2="22"/>'
    + '<path d="M8.35 2.69A10 10 0 0 1 21.3 15.65"/><path d="M19.08 19.08A10 10 0 1 1 4.92 4.92"/>');

  /* ── v10.10 도구 아이콘 이모지 → 인라인 SVG (재원이형 lucide 세트와 같은 형태) ──
     이모지(📝 ➰ ⛶)는 OS·폰트마다 색과 크기가 제각각이라 지우개(SVG)와 나란히 두면
     한 세트로 안 보였고, 테마색(currentColor)도 못 탔다. 지우개가 이미 간 길을 나머지도 따라간다.
       Type / LassoSelect / BoxSelect — 재원이형 DrawingToolbar.jsx가 쓰는 lucide 아이콘 그대로. */
  var ICON_TEXT = svgIcon('<path d="M12 4v16"/><path d="M4 7V4h16v3"/><path d="M9 20h6"/>');
  var ICON_LASSO = svgIcon('<path d="M7 22a5 5 0 0 1-2-4"/>'
    + '<path d="M7 16.93c.96.43 1.96.74 2.99.91"/>'
    + '<path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2"/>'
    + '<path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'
    + '<path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z"/>');
  var ICON_BOX_SELECT = svgIcon('<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/>'
    + '<path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/>'
    + '<path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/>'
    + '<path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>');

  /* 재원이형 툴바가 쓰는 나머지 lucide 아이콘 — 이모지로 남아 있던 자리를 채운다.
     이모지는 OS·폰트마다 색과 크기가 제각각이라 SVG 아이콘 옆에 두면 한 세트로 안 보인다. */
  var ICON_GRIP = svgIcon('<circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="9" r="1"/>'
    + '<circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/><circle cx="5" cy="15" r="1"/>');
  var ICON_PEN = svgIcon('<path d="M12 20h9"/>'
    + '<path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>');
  var ICON_HIGHLIGHTER = svgIcon('<path d="m9 11-6 6v3h9l3-3"/>'
    + '<path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>');
  var ICON_PLUS = svgIcon('<path d="M5 12h14"/><path d="M12 5v14"/>');
  var ICON_UNDO = svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>');
  var ICON_REDO = svgIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>');
  var ICON_SLIDERS = svgIcon('<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/>'
    + '<line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/>'
    + '<line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/>'
    + '<line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>');
  var ICON_CHEVRON_UP = svgIcon('<path d="m18 15-6-6-6 6"/>');
  var ICON_IMAGE = svgIcon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>'
    + '<circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
  var ICON_ASK = svgIcon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>'
    + '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>');
  var ICON_RULER = svgIcon('<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4"/>'
    + '<path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/>');

  /* 확장 버튼(addToolbarButton) 아이콘 덮어쓰기 — 등록부가 HTML 쪽에 있는 도구용.
     study-tutor-v10.html은 다른 작업 중이라 수정할 수 없어서, 여기서 id로 갈아 끼운다.
     (등록 쪽이 SVG를 직접 넘기면 그게 우선이 되도록, 이모지일 때만 바꾼다) */
  var EXT_ICON_OVERRIDES = {
    'region-select': ICON_BOX_SELECT,
    'page-image': ICON_IMAGE,   /* pageimg.js 가 🖼️ 로 등록 */
    /* #1: 이 버튼이 하는 일은 "영역을 네모로 고르는 것"이다. 말풍선은 챗을 연상시켜
       무엇이 시작되는지 어긋났다 — 재원이형처럼 점선 네모로 바꾼다. */
    'ai-ask': ICON_BOX_SELECT
  };

  var eraserBtn = null;

  function isEraserTool(id) { return String(id || '').indexOf('eraser') === 0; }
  function eraserLabel(mode) { return mode === 'eraser-partial' ? '부분 지우개' : '획 지우개'; }
  function syncEraserBtn() {
    if (!eraserBtn) return;
    eraserBtn.innerHTML = S.eraserMode === 'eraser-partial' ? ICON_ERASER_PARTIAL : ICON_ERASER_LINE;
    eraserBtn.title = '지우개 (' + eraserLabel(S.eraserMode) + ')'
      + ' · 탭 = 한 번 지우고 펜으로 복귀 / 길게 = 고정'
      + ' · 켜진 상태에서 다시 탭 = 종류 선택';
  }
  function activateEraser(sticky) {
    closePop();
    armOneShot(S.eraserMode, !!sticky || S.eraserSticky);
    setTool(S.eraserMode);
  }
  function chooseEraserMode(mode) {
    S.eraserMode = mode === 'eraser-partial' ? 'eraser-partial' : 'eraser-line';
    persistSettings();
    syncEraserBtn();
    if (oneShot && isEraserTool(oneShot.tool)) oneShot.tool = S.eraserMode;
    setTool(S.eraserMode);
  }

  function toggleEraserPop(anchor) {
    if (popEl && popEl.getAttribute('data-for') === 'eraser') { closePop(); return; }
    openPop(anchor, function (pop) {
      pop.setAttribute('data-for', 'eraser');
      pop.appendChild(el('div', 'annot-pop-title', '지우개 종류'));

      var seg = el('div', 'annot-seg');
      var mk = function (mode, label, icon) {
        var b = el('button', S.eraserMode === mode ? 'on' : '');
        b.type = 'button';
        b.innerHTML = icon + '<span>' + label + '</span>';
        b.addEventListener('click', function () {
          chooseEraserMode(mode);
          var kids = seg.querySelectorAll('button');
          for (var i = 0; i < kids.length; i += 1) kids[i].classList.toggle('on', kids[i] === b);
        });
        return b;
      };
      seg.appendChild(mk('eraser-line', '획 전체', ICON_ERASER_LINE));
      seg.appendChild(mk('eraser-partial', '부분', ICON_ERASER_PARTIAL));
      pop.appendChild(seg);
      pop.appendChild(el('div', 'annot-pop-hint', '획 전체: 닿은 선을 통째로 삭제 · 부분: 문지른 부분만 잘라냄'));

      // 롱프레스를 모르는 사람도 찾을 수 있게 "고정"을 눈에 보이는 스위치로도 둔다
      var sLab = el('label', '', '📌 지우개 고정');
      var sBtn = el('button', 'annot-switch' + (S.eraserSticky ? ' on' : ''));
      sBtn.type = 'button';
      sBtn.setAttribute('role', 'switch');
      sBtn.setAttribute('aria-checked', S.eraserSticky ? 'true' : 'false');
      sBtn.title = '켜면 지우개가 계속 유지됨 · 끄면 한 번 지우고 직전 펜으로 자동 복귀';
      sBtn.appendChild(document.createElement('i'));
      sBtn.addEventListener('click', function () {
        S.eraserSticky = !S.eraserSticky;
        persistSettings();
        sBtn.classList.toggle('on', S.eraserSticky);
        sBtn.setAttribute('aria-checked', S.eraserSticky ? 'true' : 'false');
        if (S.eraserSticky) disarmOneShot();
        else if (isEraserTool(S.tool)) armOneShot(S.tool, false);
        updateToolbarState();
      });
      sLab.appendChild(sBtn);
      pop.appendChild(sLab);
      pop.appendChild(el('div', 'annot-pop-hint', '끄면 한 번 지운 뒤 직전 펜으로 바로 돌아옵니다.'));
    });
  }

  /* ── v10.5 저장 상태 표시 ────────────────────────────────────────────────
     툴바의 상시 배지("● 저장중 / ✓ 저장됨")는 제거했다 — iPad에서 자리만 먹고,
     정상 동작을 계속 알려줄 이유가 없다. **실패했을 때만** 알린다:
       · 토스트 1회 (실패로 처음 넘어갈 때)
       · 화면 아래 재시도 버튼(#annotSaveErr) — 구 배지의 "누르면 다시 저장" 경로를 그대로 유지
     저장에 성공하거나 문서를 바꾸면 버튼은 사라진다. */
  var saveState = 'idle';
  var saveErrEl = null;

  function ensureSaveErrEl() {
    if (saveErrEl && saveErrEl.isConnected) return saveErrEl;
    saveErrEl = el('button');
    saveErrEl.id = 'annotSaveErr';
    saveErrEl.type = 'button';
    saveErrEl.addEventListener('click', function () {
      saveErrEl.classList.remove('show');
      toast('↻ 필기 저장 다시 시도 중…');
      saveNow();
    });
    document.body.appendChild(saveErrEl);
    return saveErrEl;
  }

  function setSaveState(state, message) {
    var prev = saveState;
    saveState = state;
    if (state === 'error') {
      var node = ensureSaveErrEl();
      node.textContent = '⚠️ 필기 저장 실패 — 눌러서 다시 저장';
      node.title = '저장 실패' + (message ? ' (' + message + ')' : '') + ' — 누르면 다시 시도';
      node.classList.add('show');
      // 토스트는 잠깐만(재시도 버튼이 계속 남아 있으므로 sticky로 화면을 점유하지 않는다)
      if (prev !== 'error') toast('⚠️ 필기 저장 실패 — 화면 아래 버튼을 눌러 다시 시도해 주세요');
    } else if (saveErrEl) {
      saveErrEl.classList.remove('show');
    }
  }

  function buildToolbar() {
    bar = el('div');
    bar.id = 'annotBar';

    // 접힘(간단) 상태: 드래그 핸들이 숨어 있으므로 어디를 잡아도 이동 가능하게 (임계값 7px 전 탭은 그대로 동작)
    // 펼침 상태에서도 빈 영역(툴바 배경·구분선·프리셋 틈)을 잡으면 이동
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('.annot-drag')) return;   // ⠿ 핸들은 자체 리스너가 즉시 드래그
      var onEmpty = e.target === bar || e.target === presetsWrap
        || (e.target.classList && e.target.classList.contains('annot-sep'));
      if (collapsed || onEmpty) beginBarDrag(e, 7);
    });
    // 드래그로 끝난 포인터 시퀀스의 click(탭)은 삼킴 — 이동 중 버튼이 눌리는 것 방지
    bar.addEventListener('click', function (e) {
      if (barDragMoved) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    // 접힘 상태 전용: 펼치기 버튼
    var expand = mkBtn(ICON_PEN, '필기 도구 펼치기', function () { setCollapsed(false); }, 'annot-expand');
    bar.appendChild(expand);

    var drag = mkBtn(ICON_GRIP, '드래그로 툴바 이동', null, 'annot-drag');
    drag.addEventListener('pointerdown', beginBarDrag);
    bar.appendChild(drag);

    modeBtn = mkBtn(ICON_PEN + '<span>필기</span>', '필기 모드 켜기/끄기 (꺼짐 = 기존 클릭/스크롤 그대로)', function () {
      photoReturnStop();   // 사용자가 직접 끈 것 — 사진 배치 자동 복귀 예약과 헷갈리지 않게 취소
      setEnabled(!S.enabled);
      toast(S.enabled ? '✍️ 필기 모드 — 문서 위에 그릴 수 있습니다' : '필기 모드 해제');
    });
    modeBtn.id = 'annotModeBtn';
    bar.appendChild(modeBtn);

    bar.appendChild(sep());
    // .annot-simple = 접힘(간단) 상태에서도 남는 것 — 프리셋 묶음 / 구분선 / 지우개
    presetsWrap = el('span', 'annot-simple');
    presetsWrap.style.cssText = 'display:flex;align-items:center;gap:2px;';
    bar.appendChild(presetsWrap);
    renderPresets();

    var eraserSep = sep();
    eraserSep.classList.add('annot-simple');   // 간단 상태에서 "펜 묶음 | 지우개"를 눈으로 갈라 준다
    bar.appendChild(eraserSep);
    /* v10.5 도구 정리
         · ▭ 네모(사각) 형광펜 버튼 제거 — 프리셋의 형광펜으로 충분 (도구 자체는 남아 있어 기존 필기 표시는 그대로)
         · 🧽 + ✂️ → 지우개 버튼 하나 + 모드 선택 팝오버
         · 📏 직선 자 버튼 제거 → 프리셋(펜)별 "직선 모드"로 흡수 */
    /* v10.6 지우개는 접힘(간단) 상태에도 남긴다 (.annot-simple) — 버튼 실체가 하나뿐이라
       탭=1회용 / 길게=고정 / 재탭=모드 팝오버, 활성·1회용 표식까지 두 상태가 저절로 같다. */
    eraserBtn = mkBtn('', '', null, 'annot-simple');
    syncEraserBtn();
    bindOneShotButton(eraserBtn, function (sticky) {
      // 이미 지우개가 켜져 있는데 그냥 탭 → 종류 선택 팝오버 (프리셋 재탭 규칙과 동일)
      if (!sticky && S.enabled && isEraserTool(S.tool)) { toggleEraserPop(eraserBtn); return; }
      activateEraser(sticky);
    });
    bar.appendChild(eraserBtn);

    toolButtons['text'] = mkBtn(ICON_TEXT,
      '텍스트 메모 · 탭한 자리에서 바로 입력(기존 메모 탭=수정) · 밖을 누르면 저장, Esc=취소'
      + ' · 탭=메모 하나 쓰고 펜 복귀 / 길게=고정', null);
    bindOneShotButton(toolButtons['text'], function (sticky) {
      closePop();
      armOneShot('text', sticky);
      setTool('text');
    });
    bar.appendChild(toolButtons['text']);

    /* 여기부터 확장 도구 묶음 (올가미 · 사진 · AI에게 묻기) — addToolbarButton이 채운다 */
    bar.appendChild(sep());
    /* v10.9 확장 도구 묶음의 "끝" 표시. 예전엔 addToolbarButton이 undoBtn 바로 앞에 넣어서
       확장 도구와 되돌리기가 구분 없이 붙어 버렸다(마지막 묶음이 9개짜리 덩어리가 된 원인).
       이제 확장 도구는 이 표시 앞에 들어가고, 되돌리기는 표시 뒤라 둘이 갈린다. */
    extrasEnd = sep();
    bar.appendChild(extrasEnd);

    undoBtn = mkBtn(ICON_UNDO, '실행 취소 (Ctrl+Z · 두 손가락 더블탭)', function () { undoPage(); });
    redoBtn = mkBtn(ICON_REDO, '다시 실행 (Ctrl+Y · 세 손가락 더블탭)', function () { redoPage(); });
    bar.appendChild(undoBtn);
    bar.appendChild(redoBtn);

    // v10.9 자주 안 쓰는 것(설정·접기)은 되돌리기와 한 번 더 갈라 둔다
    bar.appendChild(sep());
    var settings = mkBtn(ICON_SLIDERS, '필기 설정 (필압/손가락 필기)', function (e) { toggleSettingsPop(e.currentTarget); });
    bar.appendChild(settings);

    bar.appendChild(mkBtn(ICON_CHEVRON_UP, '툴바 접기 (간단 모드)', function () { setCollapsed(true); }));

    bar.classList.toggle('collapsed', collapsed);
    document.body.appendChild(bar);
    applyBarPos();
    setSaveState('idle');
    updateToolbarState();
  }

  function updateToolbarState() {
    if (!bar) return;
    modeBtn.classList.toggle('on', S.enabled);
    document.body.setAttribute('data-annot-tool', S.tool);
    Object.keys(toolButtons).forEach(function (id) {
      toolButtons[id].classList.toggle('active', S.enabled && S.tool === id);
      // v10.5: 1회용으로 켜진 도구는 ↩ 표식 — "쓰고 나면 펜으로 돌아옴"을 눈으로 알 수 있게
      toolButtons[id].classList.toggle('annot-oneshot', !!(oneShot && oneShot.tool === id));
    });
    if (eraserBtn) {
      eraserBtn.classList.toggle('active', S.enabled && isEraserTool(S.tool));
      eraserBtn.classList.toggle('annot-oneshot', !!(oneShot && isEraserTool(oneShot.tool)));
    }
    if (presetsWrap) {
      var btns = presetsWrap.querySelectorAll('.annot-preset');
      for (var i = 0; i < btns.length; i += 1) {
        var pid = btns[i].getAttribute('data-preset-id');
        var preset = null;
        for (var j = 0; j < presets.length; j += 1) if (presets[j].id === pid) { preset = presets[j]; break; }
        btns[i].classList.toggle('active', !!(S.enabled && preset && S.activePresetId === pid && S.tool === preset.tool));
      }
    }
    undoBtn.disabled = !canUndo();
    redoBtn.disabled = !canRedo();
    extraButtons.forEach(function (entry) {
      if (entry.def.isActive) entry.btn.classList.toggle('active', !!entry.def.isActive());
      if (entry.def.oneShot) entry.btn.classList.toggle('annot-oneshot', !!(oneShot && oneShot.tool === entry.def.oneShot));
    });
  }

  function addToolbarButton(def) {
    // 확장 도구용: {id, icon, title, onClick, isActive, oneShot} — 구분선 앞(undo 왼쪽)에 삽입
    //   oneShot: 이 버튼이 켜는 도구 id (있으면 탭=1회용 / 길게=고정 규칙이 붙는다)
    if (!bar || !def) return null;
    var run = function (sticky) {
      closePop();
      var before = S.tool;
      // 사진은 "삽입+배치까지" 끝나야 복귀 — 아직 필기 모드일 때(=클릭 직전) 돌아갈 펜을 찍어 둔다
      if (def.id === 'page-image') armPhotoReturn();
      if (def.onClick) def.onClick(sticky);
      /* 도구를 뺏지 않는 "동작 버튼"(AI 질문·녹음 등)은 실행 직후가 곧 작업 끝.
         지우개 같은 1회용 도구가 켜진 채였다면 여기서 직전 펜으로 되돌린다. */
      if (!def.oneShot && S.tool === before) autoReturnPen(S.tool);
    };
    var rawIcon = def.icon || '❖';
    // v10.10 이모지로 등록된 내장 도구는 SVG 아이콘으로 교체 (SVG를 직접 넘겼으면 그대로 존중)
    var icon = (def.id && EXT_ICON_OVERRIDES[def.id] && String(rawIcon).indexOf('<svg') !== 0)
      ? EXT_ICON_OVERRIDES[def.id] : rawIcon;
    var b = mkBtn(icon, def.title || def.id || '', def.oneShot ? null : function () { run(false); });
    if (def.oneShot) bindOneShotButton(b, run);
    if (def.id) b.setAttribute('data-annot-ext', def.id);
    bar.insertBefore(b, extrasEnd || undoBtn);   // v10.9 확장 도구 묶음 안쪽에 (되돌리기와 갈라 둠)
    extraButtons.push({ btn: b, def: def });
    updateToolbarState();
    return b;
  }

  buildToolbar();

  /* ── 툴바 경계 재적용 감시 (v10.2) ──────────────────────────────────────
     저장된 위치가 상단바를 침범한 상태일 수 있고, 경계 자체도 상황에 따라 변한다.
     아래 시점마다 현재 경계로 다시 물린다(변했으면 localStorage에도 교정 저장). */
  (function watchBarClamp() {
    var run = function () { try { reclampBarPos(); } catch (e) {} };
    run();                                   // 로드 즉시 (저장된 침범 위치 교정)
    // 폰트·safe-area·상단바 실측이 늦게 확정되는 환경 대비 보정 버스트 (HTML의 syncTopbarHeight와 동일 타이밍)
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    [120, 400, 1200].forEach(function (t) { setTimeout(run, t); });
    window.addEventListener('resize', run);
    window.addEventListener('orientationchange', function () { setTimeout(run, 150); setTimeout(run, 450); });
    try {
      // 상단바 높이 변화 + 숨김/복원(display:none → 0×0) 모두 여기서 잡힘
      var tb = document.getElementById('tb');
      if (tb && window.ResizeObserver) new ResizeObserver(run).observe(tb);
      // body.tb-hidden 토글(툴바 숨기기/복원)은 #tb 크기 변화가 늦게 보고될 수 있어 클래스도 감시
      if (document.body && window.MutationObserver) {
        new MutationObserver(run).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
      /* v10.5 필기 패널(#left) 경계 감시
         · ResizeObserver: 분할바 드래그(인라인 flex 변경)·보기모드 전환·창 크기 변화 → 프레임당 1회로 합쳐 재클램프
         · MutationObserver(#main class): view-left/right/both 전환은 #left가 display:none이 되는 순간을 확실히 잡기 위해 */
      var leftPane = document.getElementById('left');
      if (leftPane && window.ResizeObserver) new ResizeObserver(scheduleReclamp).observe(leftPane);
      var mainEl = document.getElementById('main');
      if (mainEl && window.MutationObserver) {
        new MutationObserver(scheduleReclamp).observe(mainEl, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      if (leftPane && window.MutationObserver) {
        new MutationObserver(scheduleReclamp).observe(leftPane, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    } catch (e) {}
  })();

  /* ── v3 내장 확장 버튼: 올가미 (외부 확장과 같은 addToolbarButton 경로) ──
     v10.5: 📏 직선 자 버튼은 제거 — 프리셋(펜)별 "직선 모드"로 흡수됐다(프리셋 재탭 팝오버). */
  addToolbarButton({
    id: 'lasso', icon: ICON_LASSO,
    title: '올가미 선택 · 둘러 그리면 여러 개, 그냥 탭하면 그 자리 개체 하나 선택'
      + ' → 드래그 이동 / 복사 / 잘라내기 / 복제 / 삭제'
      + ' · 툴바 버튼 탭 = 한 번 쓰고 펜으로 복귀 / 길게 = 고정',
    oneShot: 'lasso',
    onClick: function (sticky) {
      if (S.enabled && S.tool === 'lasso' && !sticky) {          // 재탭 = 해제
        if (!autoReturnPen('lasso')) setTool(S.lastDrawTool || 'pen');
        return;
      }
      armOneShot('lasso', sticky);
      setTool('lasso');
    },
    isActive: function () { return S.enabled && S.tool === 'lasso'; }
  });

  // 페이지 스크롤로 현재 페이지가 바뀌면 undo/redo 활성 상태 갱신
  (function watchScroll() {
    var left = document.getElementById('left');
    if (!left) return;
    var t = null;
    left.addEventListener('scroll', function () {
      if (t) return;
      t = setTimeout(function () { t = null; updateToolbarState(); }, 300);
    }, { passive: true });
  })();

  /* ═══ 13. 공개 API ══════════════════════════════════════════════════════ */

  var publicApi = {
    version: 1,
    // HTML 통합 지점
    ensureOverlay: ensureOverlay,
    loadInk: loadInk,
    resetDoc: resetDoc,
    flush: flush,
    // 상태/조작
    setEnabled: setEnabled,
    isEnabled: function () { return S.enabled; },
    setToolbarHidden: setToolbarHidden,   // 전체화면 시트가 열린 동안 툴바 표시만 숨김 (모드 상태는 유지)
    reclampToolbar: reclampBarPos,        // v10.2 상단바 숨김/복원 등 경계 변화 시 툴바 위치 재클램프
    invalidateLayout: invalidateLayout,   // v10.3 오버레이 rect 캐시 무효화 (레이아웃을 바꾼 쪽에서 호출)
    setTool: setTool,
    getTool: function () { return S.tool; },
    undo: undoPage,
    redo: redoPage,
    // v10.9 PDF 핀치줌: 두 번째 손가락이 닿는 순간 진행 중이던 획을 취소 (내부 abortActiveStroke 노출)
    abortStroke: abortActiveStroke,
    getPages: function () { return S.pages; },
    commitPage: commitPage,
    shiftPages: shiftPages,   // v4 빈 페이지 삽입: from 이상 페이지 필기를 delta만큼 이동 (호출 후 flush로 확정)
    refresh: refreshAllOverlays,
    // 풀이검사 등: 페이지 필기를 임의 캔버스에 픽셀로 합성 (정규화 좌표 → w×h px, 필압/질감 유지)
    renderPageToCanvas: function (page, ctx, w, h) { renderAnnotationsToCanvas(ctx, S.pages[page] || [], w, h); },
    // 확장 (영역선택 → AI질문 / 올가미 예정)
    registerTool: registerTool,
    addToolbarButton: addToolbarButton,
    // 테스트용 순수 함수
    _pure: PURE
  };

  global.Annot = publicApi;
})(typeof window !== 'undefined' ? window : globalThis);
