-- v10 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 선생님 손풀이: 미모 한 회차에 통으로 1장

alter table worksheets add column if not exists solution_path text;         -- 학생에게 보이는 합성 이미지(문제지+필기)
alter table worksheets add column if not exists solution_ink  jsonb;        -- 필기 원본 (나중에 다시 고쳐 쓸 수 있게)
alter table worksheets add column if not exists solution_at   timestamptz;  -- 보낸 시각
