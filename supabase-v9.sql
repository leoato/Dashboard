-- v9 마이그레이션 — SQL Editor에 붙여넣고 Run 한 번
-- ① 질문을 대화(스레드)로  ② 제출물 문항별 코멘트
-- 기존 컬럼은 건드리지 않으므로 지금까지의 질문·제출 기록은 그대로 유지됩니다.

-- 질문 스레드: [{who:'s'|'t', text, photos:[], ts}]
-- 비어 있으면 앱이 기존 note/answer를 첫 두 메시지로 읽습니다.
alter table questions   add column if not exists thread   jsonb not null default '[]'::jsonb;

-- 제출물 문항별 코멘트: 문항 번호(0부터) 기준 문자열 배열
alter table submissions add column if not exists comments jsonb not null default '[]'::jsonb;
