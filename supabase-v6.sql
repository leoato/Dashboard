-- v6 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 과외 기록(진도·문자·학생·약점·성적 등) 동기화를 Drive 대신 Supabase로
create table if not exists app_state (
  pair_code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
drop policy if exists "anon all app_state" on app_state;
create policy "anon all app_state" on app_state for all using (true) with check (true);
