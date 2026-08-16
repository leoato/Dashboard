-- v5 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- 질문 답변 기능 (선생님 답변 → 학생 열람)
alter table questions add column if not exists answer text;
alter table questions add column if not exists answered_at timestamptz;
