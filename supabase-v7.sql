-- v7 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 미니 모의고사(미모): 날짜별로 배정되는 복습 세트
alter table worksheets add column if not exists kind text not null default 'sheet';  -- sheet | mini
alter table worksheets add column if not exists serve_date date;                      -- 미모가 열리는 날
create index if not exists idx_worksheets_mini on worksheets(pair_code, kind, serve_date);
