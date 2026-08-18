begin;

alter table public.inquiries
  drop constraint if exists inquiries_source_check;

alter table public.inquiries
  add constraint inquiries_source_check
  check (source in ('네이버', '블로그', '플레이스', '스레드', '인스타그램', '지인', '입주민커뮤니티', '광고', '기타', '홈페이지'));

-- 최근 홈페이지 문의 중복 판단을 위한 조회 인덱스입니다.
create index if not exists inquiries_homepage_recent_dedupe_idx
  on public.inquiries (customer_id, created_at desc)
  where source = '홈페이지';

commit;
