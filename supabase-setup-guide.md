# 학생 태블릿 연동 설정법 (v2 — 한 번만 하면 됩니다, 약 10분)

지금은 **데모 모드**로도 전체 흐름을 체험할 수 있습니다 (선생님 앱과 student.html을 같은 브라우저에서 열고, 학생 앱 연결 코드에 `데모` 입력). 실제 태블릿과 연동하려면 아래를 따라 하세요.

## 1. Supabase 프로젝트 만들기 (무료)

1. https://supabase.com → 가입/로그인 → **New project**
2. 이름 예: `yunseo-tutor` · 리전: Northeast Asia (Seoul) · DB 비밀번호는 아무거나 만들고 보관
3. 생성 완료까지 1~2분 대기

## 2. 스키마 설치 (SQL 한 번 실행)

1. 왼쪽 메뉴 **SQL Editor** → New query
2. 이 폴더의 `supabase-setup.sql` 내용을 통째로 붙여넣고 **Run**
3. "Success"가 나오면 끝 (테이블 2개 + 저장소 버킷 2개 + 권한이 한 번에 생깁니다)

## 3. 키 두 개 복사해서 앱에 넣기

1. 왼쪽 메뉴 **Settings → API**
2. **Project URL** 과 **anon public key** 복사
3. 선생님 앱 → **설정 탭 → 학생 태블릿 연동** 카드에 붙여넣기 (페어링 코드는 기본 YUN-4821 그대로 두면 됨)
4. 카드 상단이 "Supabase 연결됨"으로 바뀌면 성공

## 4. 학생 태블릿에 설치

1. `student.html`을 인터넷 주소로 만들어야 태블릿에서 엽니다 — **GitHub Pages** 추천:
   - github.com/leoato/Dashboard → Settings → Pages → Branch: `main` / root → Save
   - 1~2분 뒤 주소 생김: `https://leoato.github.io/Dashboard/student.html`
2. 태블릿 브라우저로 그 주소 열기 → **홈 화면에 추가** (앱처럼 사용)
3. 선생님 앱 설정에서 **[📲 태블릿 연결 코드 복사]** → 카톡 등으로 태블릿에 전달 → 학생 앱 첫 화면에 붙여넣고 [연결]
4. 끝. 이후에는 자동으로 연결된 상태가 유지됩니다.

## 5. 자동 핑 (안 멈추게 하는 보험 — 이미 설치됨)

무료 플랜은 7일 무활동 시 일시정지되는데, GitHub Actions가 **화·금 아침마다 자동 핑**을 보내 막아줍니다.
시크릿만 넣으면 작동합니다:

1. github.com/leoato/Dashboard → Settings → **Secrets and variables → Actions** → New repository secret
2. `SUPABASE_URL` = 3단계의 Project URL / `SUPABASE_ANON_KEY` = anon key — 두 개 추가
3. (확인) Actions 탭 → supabase-keepalive → Run workflow 수동 실행 → 초록불이면 끝

참고: GitHub은 레포에 60일간 커밋이 없으면 예약 워크플로를 자동 비활성화하고 이메일을 보냅니다. 메일이 오면 버튼 한 번으로 재활성화하면 돼요 (개발이 이어지는 동안은 신경 쓸 일 없음).

## 사용 흐름 (설정 후 매일)

- 선생님: 문제지·자료 탭 → [＋ 새 문제지] → 제목 + **정답(쉼표 구분)** + (선택) Claude로 만든 학습지 HTML → 전송
- 학생: 문제지함에 NEW → 종이에 풀고 답만 입력 → 풀이 종이 촬영 → 채점 → 제출
- 선생님: 오늘 탭에 📥 알림 → 눌러서 점수·문항 ○✕·손풀이 열람 (열면 확인함 처리)

## 알아둘 것

- **비용**: Supabase 무료 플랜(DB 500MB·저장소 1GB)으로 충분. 사진은 자동 압축(~1400px)돼 올라갑니다.
- **보안 수준**: 개인용 2인 앱 전제라 anon 키를 아는 사람은 접근 가능한 구조입니다. 키를 공개 저장소·단톡에 올리지 마세요. (여러 학생/공개 배포로 커지면 Auth 도입 필요 — 그때 말해주세요)
- **정답 키**: 자동 채점용 정답은 문제지 데이터에 들어가므로, 이론상 학생이 개발자 도구로 볼 수는 있습니다. 윤서를 믿습니다 😄
