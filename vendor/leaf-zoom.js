/* ═══════════════════════════════════════════════════════════════════════════
   leaf-zoom.js — 리프(Leaf) viewer.js 의 initPdfZoom 블록 원문 이식본
   출처: Project/리프/viewer.js 704~1563행 (2026-08-26 main). **무수정**.

   왜 통째로 가져오는가 — 리프 `재설계/조작엔진-현황.md`:
     · 이 층은 실기기 왕복 12라운드로 다시 만들어졌고, 원리를 모른 채 한 줄만 고쳐도
       하루치 회귀가 되살아난다.
     · "이식 원칙: viewer.js·annotation.js 는 최신 main 을 통째로 가져간다.
        부분 발췌·재작성 금지."
   (직접 짠 줌·팬으로 2026-08-25 같은 증상을 다시 겪고 이 원칙대로 되돌렸다.)

   ── 호스트가 제공해야 하는 것 (조작엔진-현황.md §6 이식 순서) ─────────────
   DOM : #main > #left > #pdfStage > .pdf-page    (#left{touch-action:none} 필수,
         #left 는 실제 스크롤 컨테이너여야 한다 — transform 캔버스로 바꾸지 말 것)
   CSS : #pdfStage 의 크기를 var(--pdf-zoom) 으로 계산 (엔진은 이 변수만 바꾼다)
   함수: rerenderPagesForZoom()  — 배율 확정 후 재렌더 (없으면 try/catch 로 무시됨)
   내보냄: window.__setPdfZoom / __pdfZoom / __pdfPinching / __pdfScrollBusy / __pinchLog
   진단: 좌하단 배율(%) 버튼 0.9초 길게 누르기 → 로그 모달
   ═══════════════════════════════════════════════════════════════════════ */

/* 리프 viewer.js 276행의 pdfPinchDebug — ?pinchdebug=1 이 아닐 때의 noop 판본과 동일 */
const pdfPinchDebug=(function(){
  var noop={enabled:false,begin:function(){},frameStart:function(){},anchor:function(){},
            clamp:function(){},scrollToPage:function(){},frameEnd:function(){},end:function(){}};
  window.__pdfPinchDebug=noop; return noop;
})();

(function initPdfZoom(){
  const left=document.getElementById('left');
  /* 실기기 원인 특정용 초경량 링 로그 — 콘솔에서 window.__pinchLog 로 열람 (최근 60건).
     커밋 순간의 화면 튐(commitSnap)·유령 관성 복귀(ghost)·감시 채집(arm)을 남긴다. */
  const pinchLog=(k,info)=>{ const L=window.__pinchLog||(window.__pinchLog=[]);
    L.push(Object.assign({t:Math.round(performance.now()), k:k}, info)); if(L.length>60) L.shift(); };
  const Z_MIN=1, Z_MAX=4;
  window.__pdfZoom=1;
  window.__pdfPinching=false;
  let settleT=null, settleDirty=false, pctBtn=null;

  // 앵커 포착: 앵커점(뷰포트 px)이 걸친(없으면 가장 가까운) 페이지와 그 내부 비율
  function captureAnchor(cx, cy){
    const rect=left.getBoundingClientRect();
    if(cx===undefined||cy===undefined){ cx=rect.left+rect.width/2; cy=rect.top+rect.height/2; }
    let best=null, bestD=Infinity;
    for(const el of left.querySelectorAll('.pdf-page')){
      const r=el.getBoundingClientRect();
      if(r.top>rect.bottom+1600) break;            // 문서 순서라 멀어지면 중단 (거대 문서 보호)
      const d=(cy>=r.top&&cy<=r.bottom)?0:Math.min(Math.abs(r.top-cy),Math.abs(r.bottom-cy));
      if(d<bestD){ bestD=d; best={el,r}; }
      if(d===0) break;
    }
    if(!best) return null;
    return { el:best.el, cx, cy,
      fx:(cx-best.r.left)/Math.max(1,best.r.width),
      fy:(cy-best.r.top)/Math.max(1,best.r.height) };
  }
  function restoreAnchor(a){
    if(!a) return;
    const r=a.el.getBoundingClientRect();          // 새 배율 레이아웃 기준 (동기 리플로우)
    const wantX=left.scrollLeft+(r.left+a.fx*r.width)-a.cx;   // = computeZoomAnchor(scroll,anchor,before,after) 산식
    const wantY=left.scrollTop +(r.top +a.fy*r.height)-a.cy;
    left.scrollLeft=wantX;
    left.scrollTop=wantY;
    pdfPinchDebug.anchor(wantX,left.scrollLeft,wantY,left.scrollTop);
    return {wantX, wantY};                          // v10.9.4 호출부가 "요청 vs 실제"로 포화량을 잰다
  }

  /* ══ 라이브 배율 (제스처 중 · 레이아웃 무변경) ═══════════════════════════════
     #pdfStage 하나에 transform: translate(dx,0) scale(k) — 자료 canvas와 필기 SVG가
     한 서브트리라 프레임 단위로도 어긋날 수 없다.
     dx = "커밋 후 컨테이너가 놓일 가로 위치" − "지금 놓여 있는 가로 위치".
       컨테이너는 들어가면 가운데(align-items:center / margin:auto), 넘치면 왼쪽(0)에 놓인다
       → 두 경우 모두 L(z)=max(0,(패널폭 − 컨테이너폭(z))/2) 하나로 표현된다.
       transform-origin:0 0 이라 스케일은 컨테이너의 **왼쪽 위 모서리를 고정**하므로,
       그 모서리를 미리 L(z)로 옮겨 두면 라이브 화면 = 커밋 후 레이아웃이 완전히 일치한다.
       (이걸 안 하면 "확대하면 곧 왼쪽 정렬될 것"이 반영되지 않아, 손을 뗄 때 최대
        패널여백만큼 가로로 튀거나 스크롤 범위가 모자라 클램프되며 튄다) */
  let live=null;                 // {base, k, st, panelW, baseW, baseH, padX, padY, cw, ch, l0}
  let wcClearT=null;             // willChange 지연 해제 타이머 (빠른 연속 제스처의 레이어 재생성 깜빡임 방지)
  let hbounceReset=function(){}; // 가로 바운스 즉시 해제 훅 (아래 바운스 블록이 채움) — 라이브 실측 전 청소용
  function liveBegin(){
    if(live) return true;
    const st=document.getElementById('pdfStage');
    if(!st) return false;                          // 아직 자료가 없는 화면 → 예전 레이아웃 경로로
    if(wcClearT){ clearTimeout(wcClearT); wcClearT=null; }   // 직전 커밋의 해제 예약 취소 — 레이어 유지
    hbounceReset();                                // 가로 바운스 transform이 걸려 있으면 실측 전에 제거 (아래 실측이 오염되지 않게)
    const cs=getComputedStyle(left);
    const padX=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);
    const padY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
    const r=st.getBoundingClientRect();             // transform 없는 상태 = 레이아웃 실측
    live={ base:window.__pdfZoom||1, k:1, st:st,
           panelW:left.clientWidth-padX, baseW:r.width, baseH:r.height,
           padX:padX, padY:padY, cw:left.clientWidth, ch:left.clientHeight,
           l0:Math.max(0,(left.clientWidth-padX-r.width)/2),
           dx:0, residX:0, residY:0, pivot:null };  // v10.9.4 포화 흡수 / v10.9.6 줌 축 고정
    st.style.willChange='transform';               // 제스처 중에만 (합성 레이어 상시 점유 방지)
    return true;
  }
  /* 커밋 후 **실제로 존재할** 스크롤 범위. #pdfStage의 폭·높이·gap이 전부 --pdf-zoom에
     선형 비례하므로 배율 k에서의 콘텐츠 크기는 base×k로 정확히 예측된다.
     (scrollWidth = padding + 콘텐츠 + padding → max = 그것 − clientWidth) */
  function liveMaxScroll(k){
    return { x:Math.max(0, live.padX+live.baseW*k-live.cw),
             y:Math.max(0, live.padY+live.baseH*k-live.ch) };
  }
  /* ★ 커밋 클램프 튐 방지 (v10.9.2 · 실측으로 잡은 버그)
     라이브 중에는 레이아웃 박스가 아직 **옛 배율 크기**라 브라우저가 허용하는 스크롤 범위가
     (축소할 때) 실제보다 훨씬 넓다. 그 영역에 사용자를 둔 채 손을 떼면 커밋 순간 레이아웃이
     줄면서 브라우저가 scrollLeft/Top을 강제로 깎는다 → 화면이 튄다.
     (실측: 문서 끝에서 오른쪽 끝까지 팬한 뒤 축소 → 가로 169px · 세로 249px 점프)
     커밋 후 존재할 범위로 매 프레임 미리 제한하면 클램프될 여지가 사라진다.
     확대할 때는 max가 커지기만 하므로 걸리지 않는다(=기존 동작 그대로).
     ★ 두 손가락 "팬만" 하는 프레임에도 반드시 통과시켜야 한다 — 축소해 둔 상태에서
       팬으로 다시 범위 밖으로 나갈 수 있기 때문. */
  function clampLive(k){
    const mx=liveMaxScroll(k);
    const beforeX=left.scrollLeft, beforeY=left.scrollTop;
    if(left.scrollLeft>mx.x) left.scrollLeft=mx.x;
    if(left.scrollTop >mx.y) left.scrollTop =mx.y;
    pdfPinchDebug.clamp(beforeX-left.scrollLeft,beforeY-left.scrollTop);
  }
  /* v10.9.4 스크롤이 못 따라간 만큼(residX/Y)을 #pdfStage 이동으로 흡수한 최종 transform.
     translate는 scale과 독립이라 배율은 그대로 두고 위치만 보정한다. */
  function applyLiveTransform(){
    if(!live) return;
    live.st.style.transform='translate('+(live.dx-live.residX).toFixed(3)+'px,'
      +(-live.residY).toFixed(3)+'px) scale('+live.k.toFixed(6)+')';
  }
  /* 팬(간격 유지)만 하는 프레임: 스크롤에 여유가 생겼으면 흡수분을 스크롤로 되돌린다.
     시각 위치는 보존된다(스크롤+ty 합 불변) — ty가 0을 향해 스스로 녹아 팬이 어긋나지 않는다. */
  function drainResid(){
    if(!live || (!live.residX && !live.residY)) return;
    if(live.residY){ const b=left.scrollTop;  left.scrollTop =b+live.residY; live.residY-=(left.scrollTop -b); }
    if(live.residX){ const b=left.scrollLeft; left.scrollLeft=b+live.residX; live.residX-=(left.scrollLeft-b); }
    applyLiveTransform();
  }
  /* ─── 릴레이 C-009: 최소 배율에서 더 오므리면 화면이 꿈쩍도 안 해 "고장인가?"로 읽힌다.
     저항을 주며 12%까지 더 줄었다가 손을 떼면 돌아오는 고무줄. 결과 배율은 그대로 Z_MIN이고
     ★ 배율 수학은 건드리지 않는다 — #left를 통째로 scale 하는 시각 껍데기라 완전히 분리된다. */
  var RUBBER_MIN = 0.88, RUBBER_RESIST = 0.42, rubberNow = 1;
  function setRubber(s){
    s = Math.max(RUBBER_MIN, Math.min(1, s));
    if(Math.abs(s - rubberNow) < 0.002) return;
    rubberNow = s;
    left.style.transition = '';
    left.style.transform = s < 1 ? ('scale(' + s + ')') : '';
    left.style.transformOrigin = 'center center';
  }
  function releaseRubber(){
    if(rubberNow >= 1) return;
    left.style.transition = 'transform .22s ease-out';
    rubberNow = 1;
    left.style.transform = '';
    setTimeout(function(){ left.style.transition = ''; }, 260);
  }
  function liveSet(z, cx, cy){
    if(!live) return false;
    if(z < Z_MIN - 0.001) setRubber(1 - (Z_MIN - z) * RUBBER_RESIST);
    else if(rubberNow < 1) setRubber(1);
    z=Math.min(Z_MAX, Math.max(Z_MIN, z||1));
    const k=z/live.base;
    pdfPinchDebug.frameStart(k,z);
    if(Math.abs(k-live.k)<0.0004){ clampLive(live.k); drainResid(); pdfPinchDebug.frameEnd(); return true; }   // 배율 변화 없음 = 두 손가락 팬만 (범위는 유지)
    /* ★ v10.9.6 줌 축(pivot)을 줌하는 동안 고정한다 (iPad 실측·헤드리스로 확정한 잔여 드리프트).
       예전엔 매 프레임 "현재 손가락 중점"으로 앵커를 새로 잡았다 → 사람 손은 핀치 중 미세하게
       미끄러지는데(자연스러움), 그 미끄러짐을 앵커가 충실히 따라가 배율에 곱해져 누적됐다.
       (satY·sync엔 안 잡힘 — 앵커는 "제대로" 움직이는 중점을 따라간 것이므로.)
       경계 걸침이 특히 심했던 이유: 매 프레임 중점 아래 페이지가 바뀌어 앵커 페이지가 튀었다.
       이제 줌 버스트가 시작될 때 한 번만 잡고 유지 → 손가락이 미끄러져도 줌은 제자리.
       의도적 두 손가락 팬은 movePinch가 pivot을 무효화(null)해 다음 줌이 그 위치에서 새로 잡는다. */
    if(!live.pivot) live.pivot=captureAnchor(cx, cy);
    const a=live.pivot;
    live.k=k;
    window.__pdfZoom=z;                            // 화면에 보이는 실효 배율 = 이 값
    live.dx=Math.max(0,(live.panelW-live.baseW*k)/2)-live.l0;
    live.st.style.transform='translate('+live.dx.toFixed(3)+'px,0) scale('+k.toFixed(6)+')';   // ty=0으로 먼저 — restoreAnchor가 새 rect를 읽어야 하므로
    const want=restoreAnchor(a);                   // rect에 배율이 반영되므로 그대로 통한다
    clampLive(k);                                  // 커밋 때 클램프되며 튀지 않도록 범위를 미리 맞춘다
    /* ★ v10.9.4 스크롤 포화 흡수 (iPad 실측으로 확정: 확대 중 앵커가 원하는 scrollTop이
       라이브 레이아웃(옛 배율) 한계에 잘려 손가락 아래가 미끄러짐 — 측정 satY 최대 1183px/프레임).
       못 내려간 만큼(want − 실제)을 #pdfStage 세로/가로 이동으로 마저 밀어 앵커를 무조건 고정한다.
       커밋(liveCommit)은 이 시각 상태 위에서 다시 앵커를 잡으므로 자동으로 반영된다. */
    live.residX = want ? (want.wantX - left.scrollLeft) : 0;
    live.residY = want ? (want.wantY - left.scrollTop ) : 0;
    if(live.residX || live.residY) applyLiveTransform();
    if(pctBtn) pctBtn.textContent=Math.round(z*100)+'%';
    zoomRenderFrozen=true;                         // 배율이 움직이는 중 = 재렌더 보류
    settleDirty=true;
    pdfPinchDebug.frameEnd();
    return true;
  }
  /* 커밋 = transform → 실제 배율(--pdf-zoom). 위 등식 덕분에 화면은 그대로여야 한다.
     restoreAnchor는 서브픽셀/반올림 잔차를 흡수하는 안전망(정상이면 0~1px). */
  function liveCommit(){
    if(!live) return;
    const st=live.st, z=window.__pdfZoom, moved=Math.abs(live.k-1)>0.0004;
    live=null;
    /* willChange를 즉시 끄면 컴포지터 레이어가 파괴되고 다음 핀치가 재생성한다 — 빠른 연속
       줌인아웃마다 거대 레이어 재래스터가 반복돼 깜빡임의 원인이 된다 (2026-08-24 실기기
       "깜빡거리면서 줌된다"). 800ms 뒤에 끄되, 그 안에 새 제스처가 오면 liveBegin이 취소. */
    if(wcClearT) clearTimeout(wcClearT);
    wcClearT=setTimeout(function(){ wcClearT=null; st.style.willChange=''; }, 800);
    if(!moved){ st.style.transform=''; return; }
    const a=captureAnchor();                       // 패널 중앙 = 기준점 (어느 점을 잡아도 같아야 정상)
    const pre=a?a.el.getBoundingClientRect().top:0;   // 커밋 직전 앵커의 화면 위치 (transform 반영)
    st.style.transform='';
    left.style.setProperty('--pdf-zoom', z);
    left.classList.toggle('pdf-zoomed', z>1.001);
    restoreAnchor(a);
    /* 커밋이 화면을 실제로 움직였으면(2px 초과) 링 로그에 남긴다 — "커밋 순간 튐"의 실기기 증거 수집 */
    if(a){ const snap=Math.round(a.el.getBoundingClientRect().top-pre);
      if(Math.abs(snap)>2) pinchLog('commitSnap', {z:+z.toFixed(2), snap:snap}); }
    /* 필기 SVG의 굵기 기준(strokeBaseWidth = widthRatio × 오버레이 픽셀폭)은 "그릴 때의 폭"에
       묶여 있다. 라이브 중에는 transform이 굵기까지 같이 키워 두는데, transform을 풀면
       그 굵기가 원래대로 얇아진 채 세틀(220ms)까지 남는다 → 얇아졌다 굵어지는 깜빡임.
       공개 API refresh()로 새 폭 기준 SVG를 곧바로 다시 그려 그 구간을 없앤다
       (대상은 화면 근처의 채워진 오버레이뿐 — annotation.js refreshAllOverlays). */
    try{ if(window.Annot){ Annot.invalidateLayout && Annot.invalidateLayout(); Annot.refresh && Annot.refresh(); } }catch(e){}
  }
  window.__pdfZoomLive=()=>!!live;                 // 검증/디버그용

  /* ─── 줌 세틀 = "배율이 멎은 뒤 한 번만" (v10.9.1 iPad 핀치 수정) ─────────────
     ■ 구버전이 왜 화면을 튀게 했나
       setPdfZoom은 핀치 move마다 이 함수를 부르고, 안의 두 타이머(160ms 재정렬 /
       220ms 전체 재렌더)는 디바운스라 "줌이 잠깐 멈출 때"마다 발화한다. 그런데 실제
       핀치는 손가락이 미세하게 멈췄다 움직이길 반복하므로 **제스처 도중에 계속 터졌다**.
         · 160ms 타이머 = leftSync.scrollToPage(curP): 현재 페이지를 읽기 기준선에
           강제 정렬 → 손가락 중심을 고정해 둔 앵커 결과를 덮어써 화면이 튐
         · 220ms 타이머 = renderedPages.clear() + 전체 재렌더: 제스처 한복판에서
           pdf.js 렌더가 메인스레드를 물어 터치 입력이 유실 → 배율이 계단처럼 튐
     ■ 지금
       ① 핀치 진행 중(window.__pdfPinching)에는 예약조차 하지 않는다. endPinch가
          제스처를 닫은 뒤 딱 한 번 예약한다.
       ② leftSync.scrollToPage(curP)는 **줌 경로 전체에서 제거**했다. 근거:
          - 핀치·Ctrl+휠은 손가락/포인터 지점을, 버튼(−/+/%)은 패널 중앙을 앵커로 잡아
            restoreAnchor가 이미 "봐야 할 위치"를 만들어 둔다. scrollToPage(curP)는 그걸
            읽기 기준선(상단 min(210px,34%))으로 다시 끌어당기므로 앵커를 파괴할 뿐이다.
          - 좌↔우 스크롤 싱크도 이게 없어야 정상이다: 앵커 보정이 #left를 움직이면
            scroll 이벤트 → createScrollSync.report()가 기준선의 페이지를 curP로 갱신하고
            rightSync.scrollToPage로 우측을 따라오게 한다(원래 경로). 앵커가 스크롤을
            전혀 움직이지 않았다면 재정렬할 것도 없다.
          - 예외는 "스크롤 없이 curP만 바뀐 상태"(페이지 탭·썸네일 클릭 가드 구간·분리창
            클릭)인데, 그건 아래처럼 **우측 패널만** 맞추면 충분하다(좌측은 안 건드림).
     ■ zoomRenderFrozen: 배율이 움직이는 동안에는 renderVisiblePages가 "배율 낡음"을
       이유로 재렌더하지 않게 막아 둔다(스크롤 이벤트마다 재렌더가 도는 것 방지).
       세틀에서 풀고 그때 딱 한 번 다시 굽는다. */
  function runSettle(){
    settleT=null;
    /* 버튼/휠 줌으로 예약해 둔 세틀이 떠 있는 사이에 새 핀치가 시작된 경우 —
       여기서 처리하면 또 제스처 도중 재렌더다. settleDirty를 살려 둔 채 물러나면
       endPinch가 다시 예약한다. */
    if(window.__pdfPinching) return;
    liveCommit();                                  // Ctrl+휠처럼 "끝"이 없는 입력의 커밋 지점
    settleDirty=false;
    zoomRenderFrozen=false;
    try{ rerenderPagesForZoom(); }catch(e){}                       // 보이는 페이지만 · 1회
    try{                                                           // 우측 해설만 현재 페이지로 (좌측 불변)
      const r=document.getElementById('right');
      if(r && !r.classList.contains('detached') && !window.__panelSyncOff) rightSync.scrollToPage(curP);
    }catch(e){}
    try{ schedulePanelAnchorSnapshot(); }catch(e){}   // 제스처 중 건너뛴 패널 앵커 스냅샷을 세틀 뒤 한 번 잡는다
  }
  function scheduleSettle(){
    if(!settleDirty) return;                       // 배율이 실제로 변한 적 없음 → 할 일 없음(두 손가락 팬만 한 경우)
    if(settleT){ clearTimeout(settleT); settleT=null; }
    if(window.__pdfPinching) return;               // 제스처 진행 중 → endPinch가 끝난 뒤 한 번만 예약
    settleT=setTimeout(runSettle, 220);
  }

  /* 레이아웃 경로 (이산 변경 전용: −/+/% 버튼, 문서 교체 시 리셋).
     라이브 transform이 걸려 있으면 먼저 커밋해 상태를 하나로 모은다. */
  function setPdfZoom(z, cx, cy){
    if(live) liveCommit();
    z=Math.min(Z_MAX, Math.max(Z_MIN, z||1));
    if(Math.abs(z-window.__pdfZoom)<0.0005) return;
    const anchor=captureAnchor(cx, cy);
    window.__pdfZoom=z;
    window.__pdfZoomQuiet=performance.now()+300;   // v10.9.5 버튼/휠 줌의 앵커 스크롤도 싱크 정렬을 유발하지 않게
    left.style.setProperty('--pdf-zoom', z);
    left.classList.toggle('pdf-zoomed', z>1.001);
    restoreAnchor(anchor);
    if(pctBtn) pctBtn.textContent=Math.round(z*100)+'%';
    zoomRenderFrozen=true;                         // 배율이 움직이는 중 = CSS 확대만 (재렌더 보류)
    settleDirty=true;
    scheduleSettle();
  }
  window.__setPdfZoom=setPdfZoom;

  /* 좌하단 줌 컨트롤: − / 배율% / + (배율 클릭=100% 리셋) */
  (function buildCtl(){
    const box=document.createElement('div');
    box.id='pdfZoomCtl';
    const mk=(id,label,title,fn)=>{
      const b=document.createElement('button');
      b.type='button'; if(id) b.id=id;
      b.textContent=label; b.title=title;
      b.addEventListener('click',fn);
      box.appendChild(b); return b;
    };
    mk('','−','PDF 축소', ()=>setPdfZoom(window.__pdfZoom/1.25));
    pctBtn=mk('pzPct','100%','클릭하면 100%(화면 맞춤)로 리셋', ()=>setPdfZoom(1));
    mk('','＋','PDF 확대', ()=>setPdfZoom(window.__pdfZoom*1.25));
    document.getElementById('main').appendChild(box);
  })();

  /* ── 진단 로그 뷰어 (2026-08-26 복원 — 83e0030 이 유령방어를 걷어내며 같이 지웠다.
     로그를 **적는** 쪽(pinchLog: commitSnap·tailSkip·mom·panBlocked·gestEnd)은 그대로 살아 있어서
     실기기에서 읽을 창구만 사라진 상태였다. 조작엔진-현황.md 5장: "실기기 문제의 유일한 눈") ──
  /* ── 진단 로그 뷰어: 좌하단 배율(%) 버튼을 0.9초 길게 누르면 __pinchLog 표시 ──
     실기기(iPad)에서 "가끔 페이지가 튄다" 류를 신고할 때, 재현 직후 이 창을 열어
     스크린샷으로 보내 주면 어떤 메커니즘(ghost/commitSnap/tailSkip)인지 바로 특정된다.
     (#cpPg 배지는 챗 팝업 안이라 평소 안 보여서 항상 보이는 % 버튼으로. 길게 누르기는
      짧은 클릭(100% 리셋)과 충돌하지 않게 발동 시 그 클릭을 한 번 삼킨다.) */
  (function(){
    const btn=document.getElementById('pzPct');
    if(!btn) return;
    // 길게 누르기 신뢰성: iOS 텍스트 선택·콜아웃·스크롤 시작이 900ms 홀드를 pointercancel로 끊지 않게
    btn.style.touchAction='none'; btn.style.webkitUserSelect='none'; btn.style.userSelect='none';
    try{ btn.style.webkitTouchCallout='none'; }catch(e){}
    let pressT=null, swallow=false;
    const openLog=()=>{
      let ov=document.getElementById('pinchLogOv');
      if(ov){ ov.remove(); return; }
      const L=window.__pinchLog||[];
      const base=L.length?L[0].t:0;
      const lines=L.map(e=>{
        const rest=Object.keys(e).filter(k=>k!=='t'&&k!=='k').map(k=>k+'='+e[k]).join(' ');
        return '+'+((e.t-base)/1000).toFixed(1)+'s  '+e.k+'  '+rest;
      });
      ov=document.createElement('div');
      ov.id='pinchLogOv';
      ov.style.cssText='position:fixed;inset:60px 12px 12px;z-index:2650;background:rgba(15,23,42,.96);color:#e2e8f0;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;font:12px/1.5 ui-monospace,Menlo,monospace;';
      ov.innerHTML='<div style="font-weight:800;">핀치 진단 로그 ('+lines.length+'건) · zoom '+((window.__pdfZoom||1).toFixed(2))
        +' · build '+(window.__leafBuild||'dev')+'</div>'
        +'<textarea readonly style="flex:1;background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:8px;font:inherit;resize:none;-webkit-user-select:text;">'
        +(lines.join('\n')||'(기록 없음 — 핀치를 몇 번 한 뒤 다시 여세요)')+'</textarea>'
        +'<div style="display:flex;gap:8px;justify-content:flex-end;">'
        +'<button id="plClear" style="padding:8px 14px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;">지우기</button>'
        +'<button id="plClose" style="padding:8px 14px;border-radius:8px;border:0;background:#38bdf8;color:#082f49;font-weight:800;">닫기</button></div>';
      document.body.appendChild(ov);
      ov.querySelector('#plClose').onclick=function(){ ov.remove(); };
      ov.querySelector('#plClear').onclick=function(){ (window.__pinchLog||[]).length=0; ov.remove(); };
    };
    btn.addEventListener('pointerdown', function(){
      swallow=false; clearTimeout(pressT);
      pressT=setTimeout(function(){ swallow=true; openLog(); }, 900);
    });
    ['pointerup','pointerleave','pointercancel'].forEach(function(t){
      btn.addEventListener(t, function(){ clearTimeout(pressT); });
    });
    btn.addEventListener('click', function(e){
      if(swallow){ swallow=false; e.stopImmediatePropagation(); e.preventDefault(); }   // 길게 누른 뒤의 클릭이 100% 리셋을 쏘지 않게
    }, true);
  })();

  /* Ctrl+휠 (데스크톱 · 트랙패드 핀치도 ctrl+wheel로 옴)
     이것도 "연속 제스처"라 라이브 경로를 탄다(macOS Safari 트랙패드 핀치는 아이패드와
     같은 재래스터 지연 문제를 가진다). 끝 이벤트가 없으므로 커밋은 세틀(220ms)이 한다. */
  left.addEventListener('wheel', e=>{
    if(!e.ctrlKey) return;
    e.preventDefault();
    const z=(window.__pdfZoom||1)*Math.exp(-e.deltaY*0.0022);
    if(liveBegin()) { liveSet(z, e.clientX, e.clientY); settleDirty=true; scheduleSettle(); }   // settleDirty=1: 커밋(=transform 해제)을 반드시 한 번 돌리기 위해
    else setPdfZoom(z, e.clientX, e.clientY);
  }, {passive:false});

  /* ─── 2손가락 핀치 줌 + 팬 (v10.9 재작성 — iPad에서 아예 안 먹던 버그) ──────
     ■ 원래 왜 안 됐나
       구현은 손가락 수를 **Pointer Events**(pts Map)로만 셌다. 그런데 iOS Safari는
       #left의 touch-action이 pan-x/pan-y(=한 손가락 스크롤 허용)라서 두 번째 손가락이
       닿는 순간 "이건 내(브라우저) 확대 제스처"로 판정하고 그 즉시 **두 포인터에
       pointercancel**을 쏜다. 그러면
         · pts가 비워져 pinch가 시작조차 못 하고(또는 시작하자마자 죽고)
         · 그런데 아래 touchmove의 preventDefault는 그대로 걸려 있어 브라우저 확대도 막힌다
       = 두 손가락으로 벌려도 **아무 일도 안 일어난다**(사용자가 본 그 증상).
       첫 손가락이 먼저 스크롤로 넘어간 경우엔 그 포인터가 취소돼 pts.size가 2에 도달조차 못 했다.
     ■ 어떻게 고쳤나
       손가락 추적을 **Touch Events(e.touches)** 로 옮겼다. e.touches는 pointercancel과
       무관하게 항상 화면에 닿아 있는 손가락 전부를 준다. 캡처 단계 + passive:false로 달아
       자식(필기 오버레이·사진 레이어)이 무엇을 하든 우리가 먼저 보고 기본 동작을 막는다.
       iOS 전용 gesturestart/gesturechange/gestureend도 막아 Safari 페이지 확대와 겹치지 않게 한다.
       Touch Events가 오지 않는 환경(데스크톱 등)에서는 기존 Pointer 경로를 그대로 쓴다.
     ■ 필기와의 관계
       두 번째 손가락이 닿는 순간 __pdfPinching=true + Annot.abortStroke() →
       진행 중이던 획은 취소되고 핀치 중에는 새 획이 시작되지 않는다
       (annotation.js onOverlayDown의 touchDownCount≥2 / __pdfPinching 가드와 이중). */
  let pinch=null;             // {startDist, startZoom, lastMid, key}
  let touchNative=false;      // Touch Events가 실제로 오는 환경인지 (첫 touchstart에서 확정)
  /* ── 릴레이 C-012: 핀치 후 잔여 손가락 관성으로 페이지가 날아가는 문제 ──
     ① resid: 핀치에서 손가락 하나만 남으면 그 손가락을 브라우저에 돌려주지 않고
        수동 팬으로 직접 스크롤한다(preventDefault 유지). 브라우저가 옛 레이아웃 기준의
        관성을 쏘는 걸 원천 차단.
     ② (R-018에서 폐지) 유령 관성 감시 — touch-action:none 이 iOS 관성을 원천 차단해
        감시 대상이 사라졌고, 남은 걸림돌은 정당한 클램핑뿐이라 걷어냈다(아래 주석).
     ※ ①의 수동 팬은 유지 — 라이브 줌 중 잔여 손가락은 옛 레이아웃 범위에서 직접 다뤄야 한다. */
  let resid=null;             // {id, x, y} — 핀치 잔여 손가락 수동 팬
  let seqMomPx=0;             // 이번 시퀀스에서 관성 방패가 되돌린 외부 스크롤 총량 (진단)
  let seqPanBlockedPx=0;      // 이번 시퀀스에서 줌 잠금이 막은 팬 총량 (진단 — "첫 드래그 무반응" 후보 판별)
  let activeTouches=0;        // 문서 전체 손가락 수 (제스처 종료 판정용)
  ['touchstart','touchend','touchcancel'].forEach(t=>{
    document.addEventListener(t, e=>{
      activeTouches=(e.touches&&e.touches.length)||0;
      /* 커밋이 0손가락으로 미뤄지면서(위 finishTouchSeq) 마지막 touchend가 #left 밖(툴바·우측
         패널)에서 나면 커밋이 영영 안 도는 구멍이 생긴다(R-007과 같은 유실 경로) → 문서 레벨에서
         한 번 더 마무리. left 안에서 뗀 경우엔 onTouchEnd와 이중 호출되지만 endPinch가 멱등이라 무해. */
      if(t!=='touchstart' && activeTouches===0 && (pinch||live||resid)) finishTouchSeq();
    }, {passive:true, capture:true});
  });

  function midOf(a,b){
    return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, d:Math.hypot(a.x-b.x, a.y-b.y)||1 };
  }
  /* v10.9.3 핀치 중 팬 잠금 (아래 movePinch 주석 참조)
     ZOOM_EPS: 이 프레임에서 손가락 간격이 이만큼(px) 넘게 변하면 "줌 중"으로 본다.
     PAN_LOCK_MS: 줌으로 판정된 뒤 이 시간 동안은 팬을 막는다 — 벌리는 중간중간 간격이
     잠깐 멎는 프레임에서 팬이 새어 들어오는 것을 막기 위한 여유. */
  const PINCH_ZOOM_EPS=1.2, PINCH_PAN_LOCK_MS=260;

  function startPinch(a,b){
    const m=midOf(a,b);
    pinch={ startDist:m.d, startZoom:window.__pdfZoom, lastMid:m, key:a.id+'|'+b.id, zoomAt:0,
            expSL:left.scrollLeft, expST:left.scrollTop,   // 관성 방패 기준점 — 이 제스처가 확정한 스크롤 위치
            vA:{x:0,y:0}, vB:{x:0,y:0}, vD:0,              // 손가락별·간격 지수평활 속도 — together/zoomAt 판정용 (교대 갱신 평균화)
            lastA:{x:a.x,y:a.y}, lastB:{x:b.x,y:b.y} };   // 손가락별 직전 위치 — "함께 움직였나" 판정용
    window.__pdfPinching=true;
    pdfPinchDebug.begin(window.__pdfZoom);
    liveBegin();                                   // 제스처 내내 레이아웃 대신 transform (실패 시 예전 경로)
    try{ window.Annot && Annot.abortStroke && Annot.abortStroke(); }catch(e){}   // 진행 중이던 획 취소
  }
  function movePinch(a,b){
    if(!pinch) return;
    /* ★ 관성 방패 (2026-08-24 실기기 로그 ghost dy=1146로 확정): 직전 제스처에서 샌 iOS
       관성이 다음 touchstart로 유령 감시가 꺼진 뒤에도 살아서 **이번 제스처 밑으로** 스크롤을
       민다. 줌 프레임은 restoreAnchor가 되잡지만 팬 프레임은 delta 적용이라 무방비였다 →
       프레임 사이에 외부 주체가 움직인 만큼 먼저 되돌리고 시작한다. (우리가 둔 위치는
       expSL/expST에 매 프레임 기록 — 프레임 밖의 변화 = 우리 것이 아니다) */
    if(pinch.expST!=null){
      /* ★ 기대값을 **현재 유효 범위로 클램핑한 뒤** 비교한다 (2026-08-24, R-018 후속).
         줌아웃으로 콘텐츠가 줄면 브라우저가 scrollTop 을 새 범위로 깎는데(정당한 동작),
         날 기대값과 비교하면 그 클램핑을 매 프레임 되돌리려 들어 화면이 떤다. 클램핑된
         기대값과 같으면 편차 0 → 싸우지 않고, 진짜 외부 이동만 남는다. */
      const mX=Math.max(0,left.scrollWidth-left.clientWidth), mY=Math.max(0,left.scrollHeight-left.clientHeight);
      const eSL=Math.min(Math.max(0,pinch.expSL),mX), eST=Math.min(Math.max(0,pinch.expST),mY);
      const devX=left.scrollLeft-eSL, devY=left.scrollTop-eST;
      if(Math.abs(devX)>2 || Math.abs(devY)>2){
        seqMomPx+=Math.hypot(devX,devY);
        left.scrollLeft=eSL; left.scrollTop=eST;
      }
    }
    const m=midOf(a,b);
    /* ★ v10.9.3 줌 중에는 팬을 적용하지 않는다 (iPad 실사용 버그 — 영상으로 확인)
       증상: 두 손가락으로 줌인/아웃만 하는데 화면이 계속 흘러 다른 페이지로 넘어감
             (11초 핀치에 3페이지 이동. 문서 중간에서도, 내용이 다 보이는 채로 발생)
       원인: 사람은 핀치할 때 두 손가락을 대칭으로 움직이지 않는다 — 보통 엄지는 두고 검지만
             벌린다. 그러면 두 손가락의 "중점"이 검지 이동거리의 **절반만큼** 따라 움직이는데,
             예전 코드는 그 중점 이동을 전부 팬으로 받아 스크롤을 밀었다. 벌렸다 오므렸다를
             반복하면 그게 쌓여 페이지를 넘어간다.
       고침: 손가락 간격이 변하는 프레임 = 줌 의도 → 팬 금지.
             손가락 사이의 내용은 앵커(captureAnchor/restoreAnchor)가 이미 제자리에 붙잡고 있으므로
             팬을 빼도 "손가락 아래가 고정된다"는 감각은 그대로다.
             간격을 유지한 채 두 손가락을 같이 미는 프레임에서만 팬한다(= 기존 두 손가락 팬 그대로).
       ※ lastMid는 팬을 건너뛴 프레임에서도 갱신한다 — 안 그러면 팬이 재개되는 순간
         그동안 밀린 양이 한꺼번에 적용돼 화면이 튄다. */
    /* ★ zoomAt(팬 잠금) 갱신도 EMA로 (2026-08-24 로그 panBlocked 상시 발생으로 확정):
       iOS 교대 좌표 갱신은 손가락 **간격**도 이벤트마다 ±수 px씩 출렁이게 만들어, 원시
       |Δd|>1.2 판정으로는 드래그 중에도 zoomAt이 계속 갱신됐다(잠금 영구 연장 → "줌 직후
       드래그가 씹힌다"). 부호가 교대하는 지터는 EMA에서 0 근처로 상쇄되고, 진짜 줌(한 방향
       연속 변화)만 임계를 넘는다. */
    pinch.vD=(pinch.vD||0)*0.7 + (m.d-pinch.lastMid.d)*0.3;
    if(Math.abs(pinch.vD) > PINCH_ZOOM_EPS){
      /* ★ 배율이 실제로 움직일 수 있을 때만 잠금 갱신 (2026-08-24 "줌아웃 후 드래그만 씹힌다"):
         줌인은 목표 배율에서 잠깐 멈춘 뒤 드래그해 잠금이 풀려 있지만, 줌아웃은 Z_MIN에 박힌
         채(고무줄 구간) 계속 오므리다 곧장 드래그로 넘어가 잠금이 늘 신선했다. 최소 배율에서
         더 오므리는 건 줌이 못 움직이므로 팬을 잠글 이유가 없다(중점 드리프트가 해를 못 끼침).
         Z_MAX에 박힌 채 더 벌리는 쪽은 잠금 유지 — 그 드리프트는 v10.9.3의 원조 증상이다. */
      if(!(pinch.vD<0 && (window.__pdfZoom||1)<=Z_MIN+0.001)) pinch.zoomAt=performance.now();
    }
    const zooming = pinch.zoomAt && (performance.now()-pinch.zoomAt) < PINCH_PAN_LOCK_MS;
    /* ★ 2026-08-17: "줌 중엔 팬 금지"만으로는 두 손가락 이동이 자주 막혔다
         (신고: "두 손가락 패닝하고 싶을 때도 있는데 역할이 딱 나뉘어 있다").
       위 v10.9.3 버그의 진짜 원인은 **한 손가락만 움직일 때**다 — 엄지를 두고 검지만 벌리면
       중점이 검지 이동의 절반을 따라가고, 옛 코드가 그걸 전부 팬으로 받아 페이지가 흘렀다.
       그래서 잠그는 기준을 "간격이 변했나"에서 **"두 손가락이 함께 움직였나"**로 바꾼다:
         · 두 벡터가 같은 방향(내적>0)이고 크기도 비슷하면(작은 쪽이 큰 쪽의 40% 이상)
           = 손 전체를 미는 중 → 간격이 좀 변해도 팬을 허용(줌과 동시에 걸린다).
         · 한 손가락만 움직이면 작은 쪽 크기가 0에 가까워 자동으로 걸러진다(옛 버그 재발 방지).
       팬 양은 종전대로 중점 이동분 — 함께 움직인 경우 중점 이동 = 두 손의 공통 이동이다. */
    let together=false;
    if(pinch.lastA && pinch.lastB){
      const ax=a.x-pinch.lastA.x, ay=a.y-pinch.lastA.y;
      const bx=b.x-pinch.lastB.x, by=b.y-pinch.lastB.y;
      /* ★ 원시 델타 → 지수평활(EMA) 속도로 판정 (2026-08-24 실기기 로그 panBlocked로 확정:
         "두 손가락 드래그가 한 번은 통째로 안 먹힌다" — panBlocked=36 & 이동 1px 제스처 실측).
         iOS는 touchmove마다 두 손가락 좌표를 **번갈아 하나씩만** 갱신할 때가 있다 — 프레임
         단위 원시 델타로는 한쪽이 항상 0이라 together가 영영 참이 못 되고, 간격도 출렁여
         zoomAt이 계속 연장된다 → 드래그 전체가 잠긴다. EMA는 교대 갱신을 평균화한다.
         엄지 고정+검지만(v10.9.3 원조 버그)은 고정 쪽 EMA가 지수적으로 0에 수렴해 여전히
         걸러진다 — 판정 기준(내적>0·40% 비율·0.15px)은 그대로, 입력만 평활. */
      const K=0.4;
      pinch.vA.x=pinch.vA.x*(1-K)+ax*K; pinch.vA.y=pinch.vA.y*(1-K)+ay*K;
      pinch.vB.x=pinch.vB.x*(1-K)+bx*K; pinch.vB.y=pinch.vB.y*(1-K)+by*K;
      const ma=Math.hypot(pinch.vA.x,pinch.vA.y), mb=Math.hypot(pinch.vB.x,pinch.vB.y);
      if(ma>0.15 && mb>0.15 && (pinch.vA.x*pinch.vB.x+pinch.vA.y*pinch.vB.y)>0
         && Math.min(ma,mb) >= 0.4*Math.max(ma,mb)) together=true;
      /* 원시 판정도 병행 (개정⑥): 줌→드래그 전환 직후에는 EMA가 아직 줌의 반대 벡터 잔상을
         품고 있어 수 프레임 늦는다. 두 좌표가 한 이벤트에 같이 갱신된 프레임(교대 아님)이
         뚜렷이 "함께 이동"이면 즉시 인정 — 드래그 첫 프레임부터 팬이 붙는다. */
      const ra=Math.hypot(ax,ay), rb=Math.hypot(bx,by);
      if(ra>0.15 && rb>0.15 && (ax*bx+ay*by)>0 && Math.min(ra,rb) >= 0.4*Math.max(ra,rb)) together=true;
    }
    pinch.lastA={x:a.x,y:a.y}; pinch.lastB={x:b.x,y:b.y};
    if(!zooming || together){
      const px=pinch.lastMid.x-m.x, py=pinch.lastMid.y-m.y;
      left.scrollLeft+=px;                         // 간격 유지 + 중점 이동 = 두 손가락 팬
      left.scrollTop +=py;
      if((px||py) && live) live.pivot=null;         // v10.9.6 팬으로 위치가 바뀌었으니 다음 줌은 새 축에서
    } else {
      // 진단: 줌 잠금이 막은 팬 양 — "첫 드래그가 안 먹는다" 신고의 후보 판별용 (finishTouchSeq에서 로그)
      seqPanBlockedPx+=Math.hypot(pinch.lastMid.x-m.x, pinch.lastMid.y-m.y);
    }
    pinch.lastMid=m;
    const z=pinch.startZoom*m.d/pinch.startDist;   // 배율 변화 여부는 settleDirty가 기억
    if(!liveSet(z, m.x, m.y)){
      pdfPinchDebug.frameStart(z/pinch.startZoom,z);
      setPdfZoom(z, m.x, m.y);
      pdfPinchDebug.frameEnd();
    }
    if(pinch){ pinch.expSL=left.scrollLeft; pinch.expST=left.scrollTop; }   // 이번 프레임이 확정한 위치 (관성 방패 기준)
  }
  /* 제스처 종료 = 세틀을 예약할 수 있는 **유일한** 시점.
     구 코드의 pinch.zoomed 플래그는 없앴다 — 3→2손가락 재기준(startPinch 재호출)이 그 플래그를
     초기화해 "확대해 놓고 손가락을 하나 뗀 뒤 놓으면 재렌더가 영영 안 도는" 구멍이 있었다.
     지금은 setPdfZoom이 세운 settleDirty가 제스처 전체를 통틀어 유지된다. */
  function endPinch(){
    if(!pinch) return;
    pinch=null;
    window.__pdfPinching=false;
    window.__pdfZoomQuiet=performance.now()+400;   // v10.9.5 커밋 scrollTop + 220ms 세틀의 우측 정렬 에코까지 싱크 억제
    releaseRubber();       // 릴레이 C-009: 고무줄이 당겨져 있었으면 되돌린다
    liveCommit();          // ① 손을 뗀 즉시 실제 배율로 확정 (화면은 그대로 — 위 등식)
    pdfPinchDebug.end();
    scheduleSettle();      // ② 220ms 뒤 보이는 페이지만 새 배율로 다시 굽는다
  }

  /* ── 유령 관성 감시(C-012 ②)는 R-018에서 폐지 ─────────────────────────────
     존재 이유는 "iOS가 핀치 릴리스에 몰래 붙이는 관성"이었는데, #left 의 touch-action:none 이
     그 관성을 원천 차단하면서 감시할 대상이 사라졌다. 그 뒤 감시에 걸린 것은 전부 **정당한
     스크롤**이었다 — 실기기 로그에서 `ghost dy=637` 이 `arm`·`bake` 와 같은 타임스탬프에 찍혔다:
     줌아웃으로 콘텐츠가 줄면 브라우저가 scrollTop 을 새 범위로 클램핑하는데, 감시가 그걸 옛
     좌표로 되돌리고 브라우저가 다시 클램핑하며 **"줌인아웃하면 약간 튀는"** 현상을 만들고
     있었다(2026-08-24 신고). 자체 스크롤러의 관성도 같은 이유로 예외 처리가 필요했던 터라,
     방어 자체를 걷어내는 것이 옳다. ※ 되살릴 일이 생기면 커밋 7770fb8 의 rAF 감시본 참고. */

  /* ══ 자체 스크롤러 (R-018, 2026-08-24) ═══════════════════════════════════════
     ■ 왜 만들었나 (오늘 실기기 11라운드의 결론)
       iOS 네이티브 스크롤이 #left의 **공동 주인**이라, 방어를 아무리 쌓아도 셋이 샜다:
         ① 제스처 중 병행 스크롤 — 방패가 한 제스처에 20만 px 을 되돌리고 있었다(mom 로그)
         ② 면역 세션 — 첫 손가락이 혼자 움직여 스크롤이 개시되면, 뒤늦게 두 번째 손가락이
            합류해 preventDefault 를 걸어도 iOS 는 그 세션을 놓아주지 않는다
         ③ 릴리스 후 유령 관성 — 컴포지터에서 이미 수백 px 흐른 뒤에야 메인스레드가 잡는다
       셋 다 "우리가 주인이 아니어서" 생긴 문제라 방어로는 끝이 없다.
       → #left 에 touch-action:none 을 걸어 iOS 를 스크롤에서 완전히 배제하고,
         한 손가락 드래그·관성·가장자리 저항을 여기서 직접 계산한다.
     ■ 설계 원칙
       · **좌표계를 바꾸지 않는다** — scrollLeft/scrollTop 을 그대로 쓴다. 가상 렌더·좌우 싱크·
         줌 앵커·필기 레이아웃이 전부 스크롤 좌표를 읽으므로, transform 기반 가상 스크롤로
         갈아타면 그 전부를 다시 써야 한다(위험만 크고 이득 없음).
       · **남의 제스처엔 손대지 않는다** — 두 손가락(핀치)·펜슬·손가락 필기 ON·사진 조작·
         UI 요소 위에서는 소유권을 포기한다(scrCanOwn).
       · 가장자리 저항은 #pdfStage transform (시각 전용 — C-009 고무줄·R-017 가로 바운스와
         같은 원칙. 배율·스크롤 수학 무수정).
     ■ 감각 상수 — 실기기에서 맞추는 값. 바꾸면 반드시 iPad 실측할 것. */
  const SCR_FRICTION=0.952;      // 관성 감쇠 (프레임당, 60fps 기준)
  const SCR_STOP=0.02;           // 이 속도(px/ms) 아래면 정지
  const SCR_RESIST=0.4;          // 범위 밖으로 끌 때 따라오는 비율
  const SCR_MAX_OVER=110;        // 저항 구간 최대치(px)
  const SCR_SPRING=0.75;         // 저항 복귀 감쇠(프레임당)
  const SCR_EDGE_FRICTION=0.80;  // 범위 밖에서 관성이 죽는 속도
  const SCR_MAX_V=4.5;           // 플릭 속도 상한(px/ms) — 과속 방지

  let scrOwn=null;               // {id,x,y,s[]} — 우리가 소유한 한 손가락 세션
  let scrAnim=null;              // rAF — 관성·복귀 애니메이션
  let scrOver={x:0,y:0};         // 가장자리 저항 이동량(스크롤 단위)
  let scrV={x:0,y:0};            // 관성 속도(px/ms, 스크롤 증가 방향)

  function scrApplyOver(){
    const s=document.getElementById('pdfStage'); if(!s) return;
    s.style.transition='';
    s.style.transform=(!scrOver.x && !scrOver.y) ? ''
      : 'translate('+(-scrOver.x).toFixed(1)+'px,'+(-scrOver.y).toFixed(1)+'px)';
  }
  function scrStop(){ if(scrAnim){ cancelAnimationFrame(scrAnim); scrAnim=null; } scrV.x=0; scrV.y=0; }
  function scrReset(){ scrStop(); scrOwn=null; scrOver.x=0; scrOver.y=0; scrApplyOver(); }
  hbounceReset=scrReset;         // 핀치가 시작되면 liveBegin 이 즉시 청소(실측 오염 방지)

  /* 한 축 이동 → [새 스크롤, 새 저항량]. 저항 구간에 있으면 되돌리는 이동은 1:1,
     더 미는 이동만 SCR_RESIST 로 눌러 iOS 고무줄과 같은 감각을 만든다. */
  function scrAxis(cur, max, over, d){
    const cap=v=>Math.max(-SCR_MAX_OVER, Math.min(SCR_MAX_OVER, v));
    if(over!==0){
      const no=over+d;
      if((over>0&&no<=0)||(over<0&&no>=0)){ d=no; over=0; }        // 저항 구간을 빠져나옴 → 남은 양은 스크롤로
      else return [cur, cap(over + d*(((d>0)===(over>0)) ? SCR_RESIST : 1))];
    }
    let s=cur+d;
    if(s<0){ over=s*SCR_RESIST; s=0; }
    else if(s>max){ over=(s-max)*SCR_RESIST; s=max; }
    else over=0;
    return [s, cap(over)];
  }
  function scrPan(dx,dy){
    const mx=Math.max(0,left.scrollWidth-left.clientWidth);
    const my=Math.max(0,left.scrollHeight-left.clientHeight);
    const ax=scrAxis(left.scrollLeft, mx, scrOver.x, dx);
    const ay=scrAxis(left.scrollTop , my, scrOver.y, dy);
    left.scrollLeft=ax[0]; left.scrollTop=ay[0];
    scrOver.x=ax[1]; scrOver.y=ay[1];
    scrApplyOver();
  }
  function scrMomentum(){
    let last=performance.now();
    const frame=()=>{
      scrAnim=null;
      const now=performance.now(), dt=Math.min(34, now-last); last=now;
      const f=dt/16.67;
      if(scrOver.x || scrOver.y){
        /* 가장자리에 부딪힘 — 남은 속도를 저항 구간에 흘려 빠르게 죽이고, 멎으면 복귀 */
        scrV.x*=Math.pow(SCR_EDGE_FRICTION,f); scrV.y*=Math.pow(SCR_EDGE_FRICTION,f);
        if(Math.abs(scrV.x)<SCR_STOP) scrV.x=0;
        if(Math.abs(scrV.y)<SCR_STOP) scrV.y=0;
        if(scrV.x || scrV.y) scrPan(scrV.x*dt, scrV.y*dt);
        else {
          const k=Math.pow(SCR_SPRING,f);
          scrOver.x*=k; scrOver.y*=k;
          if(Math.abs(scrOver.x)<0.5) scrOver.x=0;
          if(Math.abs(scrOver.y)<0.5) scrOver.y=0;
          scrApplyOver();
        }
        if(scrOver.x || scrOver.y || scrV.x || scrV.y) scrAnim=requestAnimationFrame(frame);
        return;
      }
      scrV.x*=Math.pow(SCR_FRICTION,f); scrV.y*=Math.pow(SCR_FRICTION,f);
      if(Math.abs(scrV.x)<SCR_STOP) scrV.x=0;
      if(Math.abs(scrV.y)<SCR_STOP) scrV.y=0;
      if(!scrV.x && !scrV.y) return;
      scrPan(scrV.x*dt, scrV.y*dt);
      scrAnim=requestAnimationFrame(frame);
    };
    scrAnim=requestAnimationFrame(frame);
  }
  window.__pdfScrollBusy=()=>!!(scrOwn||scrAnim);   // 검증·진단용

  /* 소유권 — 하나라도 걸리면 물러난다(그 제스처의 주인이 따로 있다) */
  function scrCanOwn(e){
    if(!e.touches || e.touches.length!==1) return false;
    if(pinch || live || resid) return false;                       // 핀치 세션 몫
    if(e.touches[0].touchType==='stylus') return false;            // 애플펜슬 = 필기
    if(photoBusy()) return false;                                  // 사진 선택 중 = pageimg 몫
    const el=e.target;
    if(el && el.closest){
      /* 손가락 필기 ON 이면 annotation 이 오버레이 touch-action 을 none 으로 바꾼다 —
         그 표시를 그대로 읽어 소유권을 넘긴다(판정을 복제하지 않으니 항상 일치한다) */
      const layer=el.closest('.annot-layer');
      if(layer && layer.style.touchAction==='none') return false;
      if(el.closest('.pageimg-sel,.pageimg-cropbox,.pageimg-chandle,.pageimg-btn,'
        +'.annot-sel-menu,.annot-text-edit,#annotBar,button,a,input,textarea,select,[contenteditable]')) return false;
    }
    return true;
  }
  left.addEventListener('touchstart', e=>{
    scrStop();                                   // 진행 중이던 관성을 손가락으로 잡는다(캐치).
                                                 // 저항량(scrOver)은 유지 — 튀지 않고 그 자리에서 이어 끈다.
    if(!scrCanOwn(e)){ scrOwn=null; return; }
    const t=e.touches[0];
    scrOwn={id:t.identifier, x:t.clientX, y:t.clientY, s:[{t:performance.now(), x:t.clientX, y:t.clientY}]};
  }, {passive:true, capture:true});
  left.addEventListener('touchmove', e=>{
    if(!scrOwn) return;
    /* 두 번째 손가락이 합류한 프레임 — 우리 리스너가 핀치 리스너보다 먼저 등록돼 있어
       이 프레임을 그냥 두면 한 손가락 델타로 한 번 밀어 버린다(핀치 시작에 미세한 튐).
       손가락 수로 즉시 물러난다. */
    if(!e.touches || e.touches.length!==1){ scrOwn=null; return; }
    if(pinch || live || resid){ scrOwn=null; return; }    // 핀치 세션에 양보
    let t=null; const ts=e.touches;
    for(let i=0;i<ts.length;i++) if(ts[i].identifier===scrOwn.id){ t=ts[i]; break; }
    if(!t) return;
    const now=performance.now();
    scrPan(scrOwn.x-t.clientX, scrOwn.y-t.clientY);   // 스크롤 증가 = 손가락 반대 방향
    scrOwn.x=t.clientX; scrOwn.y=t.clientY;
    scrOwn.s.push({t:now, x:t.clientX, y:t.clientY});
    while(scrOwn.s.length>6 || (scrOwn.s.length>2 && now-scrOwn.s[0].t>110)) scrOwn.s.shift();
  }, {passive:true, capture:true});
  function scrRelease(e){
    if(!scrOwn) return;
    if(e.touches && e.touches.length){ scrOwn=null; return; }      // 손가락이 남음 = 다른 제스처로 전환
    const s=scrOwn.s, now=performance.now(); scrOwn=null;
    let vx=0, vy=0;
    if(s.length>=2){
      const a=s[0], b=s[s.length-1], dt=b.t-a.t;
      /* 마지막 표본이 70ms 넘게 묵었으면 손가락을 멈춘 뒤 뗀 것 → 관성 없음(플랫폼 관례) */
      if(dt>0 && now-b.t<70){ vx=-(b.x-a.x)/dt; vy=-(b.y-a.y)/dt; }
    }
    scrV.x=Math.max(-SCR_MAX_V, Math.min(SCR_MAX_V, vx));
    scrV.y=Math.max(-SCR_MAX_V, Math.min(SCR_MAX_V, vy));
    if(Math.abs(scrV.x)<SCR_STOP) scrV.x=0;
    if(Math.abs(scrV.y)<SCR_STOP) scrV.y=0;
    if(scrV.x || scrV.y || scrOver.x || scrOver.y) scrMomentum();
  }
  ['touchend','touchcancel'].forEach(t=>left.addEventListener(t, scrRelease, {passive:true, capture:true}));

  /* 사진이 선택돼 있으면 두 손가락은 "사진 크기조절"(pageimg.js) 몫 → PDF 핀치는 양보한다.
     (브라우저 기본 확대는 그대로 막아 둔다 — 안 그러면 사진 조절 중 페이지가 통째로 확대된다) */
  function photoBusy(){
    try{ return !!(window.PageImg && PageImg.getSelection && PageImg.getSelection()); }catch(e){ return false; }
  }

  /* ── ① Touch Events 경로 (iPad·안드로이드 — 주 경로) ── */
  function two(e){
    const t=e.touches;
    if(!t || t.length<2) return null;
    return [{id:t[0].identifier, x:t[0].clientX, y:t[0].clientY},
            {id:t[1].identifier, x:t[1].clientX, y:t[1].clientY}];
  }
  /* (R-018) 차단막(non-passive touchmove) 은 제거됐다 — #left 의 touch-action:none 이
     iOS 스크롤을 원천 차단하므로 preventDefault 로 감쇠시킬 대상 자체가 없다.
     메인스레드에 스크롤을 묶던 마지막 고리도 함께 사라졌다. */
  left.addEventListener('touchstart', e=>{
    touchNative=true;                              // 이 환경은 터치 이벤트가 온다 → Pointer 경로 양보
    const p=two(e);
    if(p) resid=null;                              // C-012 ①: 두 손가락 복귀 → 수동 팬 종료(핀치가 이어받음)
    if(!p) return;
    e.preventDefault();                            // 브라우저 확대/스크롤 선점 차단
    if(photoBusy()){ endPinch(); return; }
    startPinch(p[0], p[1]);                        // 손가락 구성이 바뀌면 그 시점 거리로 재기준 (튐 방지)
  }, {passive:false, capture:true});
  /* ★ 2026-08-24 (R-015 개정⑧): touchmove 리스너를 passive로 전환 — v1 시절 네이티브 스크롤 감각 복원.
     non-passive touchmove가 #left에 있으면 iOS는 **모든 한 손가락 스크롤 프레임마다** 메인스레드
     JS 완료를 기다린다. 평소엔 티가 안 나지만 세틀이 캔버스를 굽는 200~500ms 동안 스크롤 전체가
     렌더를 기다리며 버벅였다 — "초기 버전(핀치줌 없던 시절) 스크롤이 편했다"의 정체.
     move의 preventDefault가 하던 일은 이제 전부 다른 층이 맡는다:
       · 페이지 확대 차단 = touchstart(두 손가락) preventDefault + document gesturestart 차단
       · 병행 네이티브 스크롤 = 어차피 move preventDefault로 안 막혔음(mom 로그로 실증) —
         관성 방패(프레임마다 외부 이동 무효화) + 유령 감시(rAF)가 처리한다. */
  left.addEventListener('touchmove', e=>{
    const p=two(e);
    if(!p){
      // C-012 ①: 핀치 잔여 손가락 = 수동 팬 (외부 기여는 관성 방패가 프레임마다 되돌린다)
      if(e.touches && e.touches.length===1 && (pinch || live)){
        const t=e.touches[0];
        const now=performance.now();
        if(!resid || t.identifier!==resid.id){
          /* 낯선 한 손가락도 입양 (2026-08-24): 커밋이 0손가락으로 미뤄져 라이브가 열린 동안
             한 손가락이 네이티브 스크롤로 넘어가면 **아직 안 줄어든 옛 레이아웃** 범위를
             달리다 커밋 클램프로 튄다. 세션이 열려 있는 한 모든 한 손가락은 수동 팬으로.
             calm 판정은 2→1 인계와 동일 기준 — 핀치 문맥을 알면 줌 중이었을 때만 꼬리 의심,
             모르면(핀치 없이 라이브만) 보수적으로 의심(150ms 상한이 피해를 막는다). */
          const adoptZooming = !!(pinch && pinch.zoomAt && now-pinch.zoomAt < PINCH_PAN_LOCK_MS);
          resid={id:t.identifier, x:t.clientX, y:t.clientY, at:now, born:now,
                 calm:(pinch ? !adoptZooming : false), skip:0, dirX:0, dirY:0,
                 expSL:left.scrollLeft, expST:left.scrollTop};
          return;
        }
        /* 관성 방패 — movePinch와 동일: 프레임 사이 외부(관성·네이티브) 이동을 되돌리고 시작.
           passive 전환으로 네이티브 스크롤이 함께 돌지만, 이 방패가 매 이벤트 우리 몫만 남긴다 */
        if(resid.expST!=null){
          const mX=Math.max(0,left.scrollWidth-left.clientWidth), mY=Math.max(0,left.scrollHeight-left.clientHeight);
          const eSL=Math.min(Math.max(0,resid.expSL),mX), eST=Math.min(Math.max(0,resid.expST),mY);
          const devX=left.scrollLeft-eSL, devY=left.scrollTop-eST;
          if(Math.abs(devX)>2 || Math.abs(devY)>2){
            seqMomPx+=Math.hypot(devX,devY);
            left.scrollLeft=eSL; left.scrollTop=eST;
          }
        }
        const dx=resid.x-t.clientX, dy=resid.y-t.clientY;
        // 방향 반전 = 의도 판정 — 꼬리는 직선 탄도라 방향이 꺾이면 사용자가 새로 끄는 것이다
        if(!resid.calm && (dx*resid.dirX + dy*resid.dirY) < 0) resid.calm=true;
        /* ★ 꼬리 속도 게이트 (2026-08-24 실기기 "빠르게 모으면 다음 페이지로" 수정 — 재현으로 확정):
           빠른 핀치는 손가락이 동시에 안 떨어진다. 늦게 떨어지는 손가락이 **아직 핀치 속도로
           움직이는 채로** 여기 인계되면, 그 꼬리 이동(재현 실측 180px = 한 페이지)이 그대로
           팬이 되어 다음 페이지에서 끝난다. 판정은 세 겹 — R-009("팬을 딱딱 막지 마라")·
           R-014("시간창으로 때우지 마라")와의 충돌을 피하기 위한 구성:
             ① 1차 기준은 제스처 문맥 — 인계 직전에 실제로 줌 중이었을 때만 calm=false로 시작
                (두 손가락 팬만 하던 핀치의 잔여 손가락은 즉시 팬 — R-009 감각 유지).
             ② 고속(>1px/ms)으로 움직이는 동안만 팬 보류, 추적점은 계속 갱신
                (재개 순간 한꺼번에 적용되는 튐 없음 — v10.9.3 lastMid 교훈 준수).
             ③ 상한 150ms — 그보다 오래 지속되는 빠른 끌기는 꼬리가 아니라 의도적 팬이다
                (꼬리는 본질적으로 짧다: 손가락이 곧 떨어진다).
           네이티브 쪽 꼬리 기여는 위 관성 방패가 매 이벤트 되돌리고, 릴리스 후 관성은
           유령 감시(rAF)가 잡는다 — passive 전환 후에도 억제 체계는 유지된다. */
        const speed=Math.hypot(dx,dy)/Math.max(1, now-(resid.at||now));
        if(!resid.calm && speed>1.0 && now-(resid.born||0)<150){
          resid={id:t.identifier, x:t.clientX, y:t.clientY, at:now, born:resid.born, calm:false,
                 skip:(resid.skip||0)+Math.hypot(dx,dy), dirX:dx, dirY:dy,
                 expSL:left.scrollLeft, expST:left.scrollTop};
          return;
        }
        left.scrollLeft+=dx;
        left.scrollTop +=dy;
        if(live) clampLive(live.k);   // 커밋이 0손가락으로 미뤄져 라이브가 열려 있다 — 커밋 후 범위를 넘지 않게
        resid={id:t.identifier, x:t.clientX, y:t.clientY, at:now, born:resid.born, calm:true,
               skip:resid.skip||0, dirX:dx, dirY:dy, expSL:left.scrollLeft, expST:left.scrollTop};
      }
      return;
    }
    if(photoBusy()){ endPinch(); return; }
    if(!pinch || pinch.key!==p[0].id+'|'+p[1].id) startPinch(p[0], p[1]);
    else movePinch(p[0], p[1]);
  }, {passive:true, capture:true});
  /* 터치 시퀀스 마무리(손가락 0개) — 커밋·세틀·유령 감시 채집을 여기서 **한 번만** 한다.
     ★ 2026-08-24 실기기 신고("줌인아웃이 깜빡이며 뚝뚝 끊긴다") 수정:
       실기기 핀치는 손가락이 동시에 안 떨어져 항상 2→1→0 순서로 끝난다. 예전엔 2→1에서
       endPinch가 돌아 커밋(전체 리플로우+필기 SVG 재렌더)이 제스처 한복판에 끼었고,
       세틀(220ms 뒤 캔버스 재굽기)은 남은 손가락이 아직 팬하는 중에 발화해 프레임을 떨궜다.
       빠른 줌인·줌아웃 반복(2→1→2 손가락 튐)마다 이 비용이 반복돼 "깜빡이며 뚝뚝".
       이제 2→1은 수동 팬 인계만 하고(라이브 transform 유지), 커밋·세틀은 마지막 손가락이
       떨어질 때 한 번만 — 3→2 재기준이 이미 쓰던 "세션 관통" 설계를 2→1에도 적용한 것. */
  function finishTouchSeq(){
    if(resid && resid.skip>30) pinchLog('tailSkip', {px:Math.round(resid.skip)});   // 억제한 꼬리 이동량 (실기기 증거용)
    if(seqMomPx>30) pinchLog('mom', {px:Math.round(seqMomPx)});                     // 제스처 밑으로 샌 관성을 방패가 되돌린 양
    if(seqPanBlockedPx>30) pinchLog('panBlocked', {px:Math.round(seqPanBlockedPx)});// 줌 잠금이 막은 팬 양 ("드래그 무반응" 판별용)
    seqMomPx=0; seqPanBlockedPx=0;
    resid=null;
    endPinch();
    pinchLog('gestEnd', {sl:Math.round(left.scrollLeft), st:Math.round(left.scrollTop)});   // 제스처 종료 표시(진단용)
  }
  function onTouchEnd(e){
    const p=two(e);
    if(p){ startPinch(p[0], p[1]); return; }       // 3→2개로 줄었을 때: 남은 두 손가락으로 재기준
    // C-012 ①: 핀치 도중 2→1 — 남은 손가락을 수동 팬으로 인계. 커밋은 안 한다(위 주석) —
    // 라이브 transform을 유지한 채 finishTouchSeq(0손가락)가 한 번에 확정한다.
    if(pinch && e.touches && e.touches.length===1){
      const t=e.touches[0];
      const now=performance.now();
      // 인계 직전에 실제로 줌 중이었을 때만 꼬리 의심(calm:false) — 팬만 하던 핀치면 즉시 팬(R-009)
      const wasZooming = !!(pinch.zoomAt && now-pinch.zoomAt < PINCH_PAN_LOCK_MS);
      resid={id:t.identifier, x:t.clientX, y:t.clientY, at:now, born:now, calm:!wasZooming, skip:0,
             dirX:0, dirY:0, expSL:left.scrollLeft, expST:left.scrollTop};
      return;
    }
    if(!e.touches || e.touches.length===0) finishTouchSeq();
  }
  left.addEventListener('touchend', onTouchEnd, {passive:true, capture:true});
  left.addEventListener('touchcancel', onTouchEnd, {passive:true, capture:true});
  /* iOS Safari 자체 확대 제스처(gesture*) 차단 — touch-action만으론 안 막힌다.
     릴레이 C-007: #left 에만 걸려 있어 툴바·우측 패널·홈은 무방비였다 → 문서 전체로. */
  ['gesturestart','gesturechange','gestureend'].forEach(t=>{
    document.addEventListener(t, e=>{ e.preventDefault(); }, {passive:false, capture:true});
  });
  /* 한 손가락 더블탭 확대도 차단 — 단 버튼·입력칸 위에서는 막지 않는다(click이 안 나가 UI가 죽는다) */
  (function(){
    let lastTap = 0;
    document.addEventListener('touchend', e => {
      const now = Date.now();
      if(now - lastTap < 320){
        const el = e.target.closest && e.target.closest('button,a,input,textarea,select,label,[role="button"],[onclick]');
        if(!el && e.cancelable) e.preventDefault();
      }
      lastTap = now;
    }, {passive:false, capture:true});
  })();

  /* ── ② Pointer Events 폴백 (터치 이벤트가 없는 환경) ── */
  const pts=new Map();
  function ptArr(){
    const v=[...pts.entries()];
    return [{id:v[0][0], x:v[0][1].x, y:v[0][1].y}, {id:v[1][0], x:v[1][1].x, y:v[1][1].y}];
  }
  left.addEventListener('pointerdown', e=>{
    if(touchNative || e.pointerType!=='touch') return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(photoBusy()){ endPinch(); return; }
    if(pts.size===2){ const p=ptArr(); startPinch(p[0], p[1]); }
    else if(pts.size>2) endPinch();
  }, true);
  left.addEventListener('pointermove', e=>{
    if(touchNative || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(!pinch || pts.size!==2) return;
    const p=ptArr();
    movePinch(p[0], p[1]);
  }, true);
  function endPt(e){
    if(!pts.delete(e.pointerId)) return;
    if(pts.size<2) endPinch();
  }
  left.addEventListener('pointerup', endPt, true);
  left.addEventListener('pointercancel', endPt, true);
})();
