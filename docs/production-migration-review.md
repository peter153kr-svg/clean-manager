# 운영 Supabase 마이그레이션 이력·충돌 점검

## 운영 Dashboard 읽기 전용 조회 결과

사용자 로그인 후 Supabase Dashboard의 clean-manager 프로젝트를 확인했습니다. 기존 앱의 NEXT_PUBLIC_SUPABASE_URL과 Dashboard 프로젝트가 일치한다는 비교 결과는 true였습니다. URL/키 값은 로그나 보고서에 기록하지 않았습니다.

운영 프로젝트 개요는 **LAST MIGRATION: No migrations**, Database → Migrations 화면은 **Run your first migration**을 표시했습니다. 따라서 **Dashboard 표시 기준 등록된 CLI 마이그레이션 이력이 없는 상태**로 확인했습니다.

이력 화면만 읽었고 화면의 link/db push 안내는 실행하지 않았습니다. 운영 SQL Editor에서 쿼리·DDL/DML·repair를 실행하지 않았으며 고객·문의·작업·매출 행도 읽지 않았습니다.
정확히 구분하면, 이력 테이블이 없거나 비어 있는지는 UI만으로 구분하지 못합니다. 기존 수동 SQL 적용 여부 및 실제 테이블/정책/권한은 별도 읽기 전용 SQL로 확인해야 합니다. 이력 표시가 없다는 이유로 운영 스키마가 비어 있다고 판단하면 안 됩니다.

## 원본 버전과 정적 충돌 가능성

| 원본 version | 파일 | 위험 |
| --- | --- | --- |
| 20260817 | create_customers_and_inquiries | 수동 SQL Editor 적용과 CLI 이력의 불일치 가능성 |
| 20260818 | create_jobs_and_sales | 같은 version을 쓰는 파일 3개 중 하나 |
| 20260818 | create_content_tables | 위 파일보다 먼저 정렬되어 jobs FK 참조 실패 가능성 |
| 20260818 | create_media_assets | 같은 version 중복 |
| 20260819 | add_homepage_inquiry_source | 운영 실제 constraint/이력 상태와 대조 필요 |
| 20261025 | create_telegram_schedule_messages | 신규로 보이지만 운영 적용 여부는 아직 미확인 |

Supabase는 `supabase_migrations.schema_migrations`의 version 이력으로 적용 여부를 추적합니다. 이 저장소의 날짜 20260818 중복은 원격 적용 전 해결 계획이 필요한 문제입니다. [공식 문서](https://supabase.com/docs/guides/deployment/database-migrations)
이번 병합에서 원본 마이그레이션의 이름/내용은 변경하지 않았습니다. 로컬 도구의 14자리 복사본 버전은 로컬 재현 전용이며 운영 이력과 같다고 가정하지 않습니다.

## 실제 이력에 따라 달라지는 판단

- 이력 테이블이 없음: 수동 SQL 적용으로 앱 테이블이 존재할 수 있습니다. 이력 부재만으로 기존 SQL 전체를 미적용으로 판단하면 안 됩니다.
- 원격 version이 기존 날짜/14자리 등 다른 체계를 사용: 기존 운영 스키마와 대응 관계를 확인한 뒤 승인된 이력 정합화 계획이 필요합니다. 이번 작업은 repair를 실행하지 않습니다.
- telegram version 또는 관련 테이블/정책이 이미 존재: 파일의 `CREATE TABLE IF NOT EXISTS`만으로 안전한 재실행을 보장하지 않습니다. 두 `CREATE POLICY`는 이미 같은 이름이 있으면 실패합니다. IF NOT EXISTS는 기존 컬럼/constraint 구조가 원하는 것인지도 검증하지 않습니다.
- `public.set_updated_at()`가 없음/서명이 다름: 텔레그램 updated_at 트리거 생성이 실패할 수 있습니다.
- service_role의 기본 table 권한이 운영에서 다름: SECURITY INVOKER RPC는 실행 권한만 있어도 INSERT/UPDATE가 부족하면 실패합니다. 로컬의 기본 권한 통과를 운영 권한 통과로 간주하지 않습니다.
- `ingest_telegram_schedule_message`의 같은 서명/상이한 구현이 이미 있음: CREATE OR REPLACE가 기존 의미를 변경할 수 있으므로 실제 메타데이터 비교 후 승인 필요.

## 준비한 읽기 전용 점검 SQL

[inspect-production-migrations-readonly.sql](sql/inspect-production-migrations-readonly.sql)은 catalog와 마이그레이션 version/name만 조회합니다. 고객·문의·작업·매출 행은 조회하지 않습니다.
첫 단계는 `BEGIN TRANSACTION READ ONLY`와 시간 제한으로 메타데이터를 조회하고 ROLLBACK합니다. 해당 SQL의 문법은 로컬 DB에서만 검증했으며 운영에는 실행하지 않았습니다. 이력 테이블이 있음을 확인한 경우에만 주석의 두 번째 이력 SELECT를 별도 실행합니다.

운영 DB에 migration up/push/reset/repair, DDL/DML, GRANT/REVOKE를 실행하지 않았고 운영 환경변수·봇 설정도 변경하지 않았습니다. 운영 적용 승인 요청을 대신하는 문서가 아닙니다.
