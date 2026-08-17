// App Store 스크린샷 전용 데모 시드.
// 실제 학생 개인정보를 스토어에 노출하지 않기 위해 전부 가명·허구 데이터를 쓴다.
// 이 파일은 스크린샷 빌드에만 주입하고 제출 빌드에는 넣지 않는다.
(function () {
  if (localStorage.getItem('__demo_seeded')) return;

  localStorage.setItem('t1', JSON.stringify([{
    name: '홍길동', grade: '고1', student_phone: '', parent_phone: '',
    school: '한빛고등학교', day: '매주 월요일,금요일', time: '19시 30분~22시',
    subject: '공통수학1', hourly: '35000', hrs: '2', sessions: '8',
    memo: '도형 단원 취약. 계산 실수보다 개념 확인이 먼저 필요.'
  }]));

  var lessons = [
    { num: 1, date: '2026-07-06', content: '1. 지난 숙제 풀이\n2. 원의 방정식 기본 유형 (1~6)', hw: '1. 금일 진도 유형 문제\n2. 교재 82p까지', extras: {} },
    { num: 2, date: '2026-07-10', content: '1. 지난 숙제 질의응답\n2. 원과 직선의 위치 관계', hw: '1. 유형 7~12번\n2. 오답 재풀이', extras: {} },
    { num: 3, date: '2026-07-13', content: '1. 오답 정리\n2. 점과 직선 사이의 거리', hw: '1. 금일 진도 유형 문제', extras: {} },
    { num: 4, date: '2026-07-17', content: '1. 지난 숙제 풀이\n2. 도형의 평행이동', hw: '1. 평행이동 유형 전체\n2. 약점 보완 프린트', extras: {} },
    { num: 5, date: '2026-07-20', content: '1. 30분 테스트\n2. 도형의 대칭이동', hw: '1. 대칭이동 유형 1~10', extras: {} },
    { num: 6, date: '2026-07-24', content: '1. 테스트 오답 설명\n2. 대칭이동 심화', hw: '1. 심화 문제 5문항', extras: {} },
    { num: 7, date: '2026-07-27', content: '1. 지난 숙제 풀이\n2. 단원 마무리 정리', hw: '1. 단원 종합 문제', extras: {} },
    { num: 8, date: '2026-08-03', content: '1. 종합 문제 오답\n2. 집합의 뜻과 표현', hw: '1. 집합 기본 유형', extras: {} }
  ];
  localStorage.setItem('t3', JSON.stringify(lessons));

  localStorage.setItem('t4', JSON.stringify([{
    id: 1, date: '2026-08-03',
    text: '안녕하세요 어머님, 오늘 8회차 수업 잘 마쳤습니다 😊\n\n' +
          '📖 오늘 진도:\n1. 종합 문제 오답\n2. 집합의 뜻과 표현\n\n' +
          '📝 숙제 범위:\n1. 집합 기본 유형\n\n' +
          '오늘 도형 단원 종합 문제를 끝까지 마쳤습니다. 다음 시간부터 집합으로 넘어갑니다.\n\n' +
          '언제나 최선을 다하겠습니다. 감사합니다.'
  }, {
    id: 2, date: '2026-07-27',
    text: '안녕하세요 어머님, 오늘 7회차 수업 잘 마쳤습니다 😊\n\n' +
          '📖 오늘 진도:\n1. 지난 숙제 풀이\n2. 단원 마무리 정리\n\n' +
          '📝 숙제 범위:\n1. 단원 종합 문제\n\n' +
          '언제나 최선을 다하겠습니다. 감사합니다.'
  }]));

  localStorage.setItem('t5', JSON.stringify([
    { id: 1, subject: '공통수학1', unit1: '도형의 방정식', unit2: '원의 방정식', type: '접선 조건 세우기', memo: '판별식과 거리 공식 중 어느 쪽을 쓸지 판단이 느림', photos: [], date: '2026-07-20' },
    { id: 2, subject: '공통수학1', unit1: '도형의 방정식', unit2: '대칭이동', type: '직선 y=x 대칭', memo: 'x, y를 바꾸는 것과 부호를 바꾸는 것을 혼동', photos: [], date: '2026-07-24' }
  ]));

  localStorage.setItem('tutor_scores', JSON.stringify([
    { id: 1, name: '3월 모의고사', type: '모의고사', date: '2026-03-24', score: 62, grade: '4등급', weak: '도형 단원 전반', student: '홍길동' },
    { id: 2, name: '1학기 중간고사', type: '내신', date: '2026-04-28', score: 71, grade: '3등급', weak: '함수 그래프 해석', student: '홍길동' },
    { id: 3, name: '6월 모의고사', type: '모의고사', date: '2026-06-04', score: 78, grade: '3등급', weak: '원의 방정식 접선', student: '홍길동' },
    { id: 4, name: '1학기 기말고사', type: '내신', date: '2026-07-08', score: 84, grade: '2등급', weak: '대칭이동 심화', student: '홍길동' }
  ]));

  localStorage.setItem('__demo_seeded', '1');
  location.reload();
})();
