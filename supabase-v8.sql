-- v8 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 실제 휴대폰 알림(Web Push): 기기별 구독 저장 + 미모 리마인더 스케줄

create table if not exists push_subs (
  endpoint  text primary key,          -- 브라우저가 준 푸시 주소 (기기 1대 = 1행)
  pair_code text not null,
  role      text not null,             -- teacher | student
  p256dh    text not null,
  auth      text not null,
  label     text,                      -- 기기 메모 (예: 아이패드)
  created_at timestamptz not null default now(),
  last_ok   timestamptz
);
create index if not exists idx_push_subs_pair on push_subs(pair_code, role);

alter table push_subs enable row level security;
drop policy if exists "anon all push_subs" on push_subs;
create policy "anon all push_subs" on push_subs for all using (true) with check (true);

-- ── 미모 리마인더: 매시 정각에 notify 함수를 깨운다.
--    보낼지 말지(한국시간 평일 여부·설정한 시각·오늘 미모 미제출 여부·하루 1회)는 함수가 판단한다.
-- ※ 아래 두 줄이 권한 오류를 내면 Dashboard → Database → Extensions 에서
--    pg_cron, pg_net 을 토글로 먼저 켠 뒤 이 줄들을 지우고 다시 Run 하세요.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('oneul-mini-reminder')
  where exists (select 1 from cron.job where jobname = 'oneul-mini-reminder');

-- ※ 서버 주소·키는 저장소에 두지 않는다 (2026-10-16 정리).
--    다시 실행할 일이 있으면 <프로젝트-ref>·<ANON_KEY> 자리에 대시보드 Settings → API 값을 넣어 실행.
select cron.schedule('oneul-mini-reminder', '0 * * * *', $CRON$
  select net.http_post(
    url     := 'https://<프로젝트-ref>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer <ANON_KEY>'),
    body    := '{"kind":"mini_reminder"}'::jsonb
  );
$CRON$);
