-- v3 마이그레이션 — Supabase SQL Editor에 붙여넣고 Run 한 번 (1초)
-- 앱에서 생성한 문항 원문을 저장해 "오답 유사문제 만들기"·약점 노트 연계에 사용
alter table worksheets add column if not exists problems jsonb;
