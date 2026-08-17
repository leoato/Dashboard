// App Store 스크린샷 전용 — 학생 앱을 데모 모드로 바로 진입시킨다.
// (평소에는 연결 코드 입력 화면이 먼저 뜨므로 스크린샷을 찍을 수 없다)
(function () {
  if (!localStorage.getItem('yt_paired')) {
    localStorage.setItem('yt_paired', '1');   // Supabase 설정이 없으면 자동으로 데모 모드
    location.reload();
    return;
  }
  var VIEWS = [
    function () { var b = document.querySelector('[onclick*="goHome"]'); if (b) b.click(); },
    function () { var c = document.querySelectorAll('.card, .tile, [onclick]'); if (c[1]) c[1].click(); }
  ];
  VIEWS.forEach(function (fn, i) { setTimeout(function () { try { fn(); } catch (e) {} }, 3000 + i * 6000); });
})();
