-- ═══════════════════════════════════════════════════════
-- 윤서과외 v2 — Supabase 스키마 (SQL Editor에 통째로 붙여넣고 Run 한 번)
-- ═══════════════════════════════════════════════════════

-- 문제지
create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  pair_code text not null,
  title text not null,
  html_path text,                                -- storage의 문제지 HTML 경로 (없어도 됨)
  answer_key jsonb not null default '[]',        -- ["2","5","1",...] 문항 순서대로
  status text not null default 'assigned',       -- assigned(배정됨) → submitted(제출됨) → seen(확인함)
  created_at timestamptz not null default now()
);

-- 제출 (채점 결과 + 손풀이 사진)
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  pair_code text not null,
  answers jsonb not null default '[]',           -- 학생이 입력한 답
  marks jsonb not null default '[]',             -- ["O","X",...]
  score text,                                    -- "5 / 6"
  photo_paths jsonb not null default '[]',       -- storage의 손풀이 사진 경로들
  created_at timestamptz not null default now()
);

create index if not exists idx_worksheets_pair on worksheets(pair_code, created_at desc);
create index if not exists idx_submissions_ws on submissions(worksheet_id);

-- RLS: 켜되 anon 전체 허용 (개인용 2인 앱 — 페어 코드로 구분)
-- 주의: anon 키를 아는 사람은 접근 가능. 개인 프로젝트 전제. 공개 배포 시 Auth 도입 필요.
alter table worksheets enable row level security;
alter table submissions enable row level security;
drop policy if exists "anon all worksheets" on worksheets;
create policy "anon all worksheets" on worksheets for all using (true) with check (true);
drop policy if exists "anon all submissions" on submissions;
create policy "anon all submissions" on submissions for all using (true) with check (true);

-- Storage 버킷: 문제지 HTML + 손풀이 사진 (public 읽기)
insert into storage.buckets (id, name, public) values ('worksheets','worksheets', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('handwriting','handwriting', true)
  on conflict (id) do nothing;
drop policy if exists "anon rw yunseo buckets" on storage.objects;
create policy "anon rw yunseo buckets" on storage.objects
  for all using (bucket_id in ('worksheets','handwriting'))
  with check (bucket_id in ('worksheets','handwriting'));
