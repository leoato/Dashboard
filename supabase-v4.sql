-- v4 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 학생 "질문하기" 수신함용 테이블
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  pair_code text not null,
  worksheet_id uuid,                     -- 어느 문제지에 대한 질문인지 (없어도 됨 — 교재 질문)
  worksheet_title text,                  -- 표시용 스냅샷
  problem_index int,                     -- 몇 번 문제인지 (없어도 됨)
  note text not null,                    -- 어느 부분에서 막혔는지
  photo_paths jsonb not null default '[]',  -- 교재 사진 (handwriting 버킷)
  status text not null default 'open',   -- open → seen
  created_at timestamptz not null default now()
);
create index if not exists idx_questions_pair on questions(pair_code, created_at desc);
alter table questions enable row level security;
drop policy if exists "anon all questions" on questions;
create policy "anon all questions" on questions for all using (true) with check (true);
