# PR #1 운영 적용 준비 — 2026-10-26

## 판정: 운영 적용 보류

운영 스키마 조회와 신규 적용 SQL의 실제 DB 테스트가 완료되지 않았다. 이 문서는 승인된 운영 적용 결과가 아니다. 운영 DDL/DML, reset/push/repair/migration up, 봇/환경변수 변경, main 병합, Vercel 운영 배포는 실행하지 않았다. 고객 데이터 행은 조회하지 않았다.

## GitHub 및 main 확인

- GitHub API에서 PR #1 `텔레그램 일정 수신함 및 웹훅 기반 추가`는 open, merged=false, mergeable=true였다.
- PR head 및 로컬 HEAD: `638e6fed53d03eb9dd24d17f88d2bdee68140ef0`.
- 최신 main: `b7e1b874c38bf6a84794a7cb5feec719c49312d5` (보안 PR #3 병합).
- `git fetch origin main codex/telegram-schedule-intake` 성공 후 `origin/main...HEAD`는 0/5, 원격 작업 브랜치와 로컬 HEAD 차이는 0/0이었다. 이번 준비 변경을 추가하기 전의 비교다.
- 기존 미추적 patch 및 supabase.zip은 사용하거나 커밋하지 않았다.

## 운영 읽기 전용 점검 상태

`docs/sql/inspect-production-migrations-readonly.sql`을 먼저 검토했다. 실행 구문은 BEGIN TRANSACTION READ ONLY, SET LOCAL 시간 제한, 시스템 카탈로그/정보 스키마 SELECT, ROLLBACK이다. DDL/DML 또는 사용자 정의 RPC 호출이 없다. `has_*_privilege`, `pg_get_*`, `to_regclass`는 시스템 메타데이터 조회다. 주석의 이력 SELECT는 phase 1에서 이력 테이블 존재가 확인된 경우에만 별도로 실행한다. 마이그레이션 version/name은 이력 메타데이터이며 고객 데이터가 아니다.

기존 파일에는 컬럼/인덱스/제약/트리거와 전체 public 정책 점검이 부족했다. 이를 추가하고 service_role의 테이블 권한, public 스키마 USAGE, BYPASSRLS, 함수 정의/서명/실행 권한을 조회하도록 보완했다. 함수 정의나 기본값에 비밀값을 하드코딩한 환경이라면 반환 내용을 외부에 게시하지 말고 로컬에서 검토한다. 결과 전체를 PR에 업로드하지 않는다.

이번 세션에는 Supabase 전용 connector가 없고, 로그인된 운영 브라우저의 접근 요청은 `Computer Use app approval timed out`으로 종료됐다. 따라서 **운영 SQL은 실행되지 않았고 운영 테이블/컬럼/인덱스/RLS/함수/권한/이력은 미확인**이다. 이전 문서의 Dashboard `No migrations`는 이력 테이블 부재와 빈 이력을 구별하지 못하며, 운영 스키마 보존의 증거로 사용하지 않는다.

운영 메타데이터 대조 시 다음을 확인해야 한다.

| 범위 | 필요한 대조 |
| --- | --- |
| CRM | customers, inquiries, jobs, sales의 컬럼/자료형/null/default, PK/FK/check, 인덱스, 트리거, RLS/정책/권한 |
| 홈페이지 문의 | inquiries_source_check에 홈페이지 허용, inquiries_homepage_recent_dedupe_idx의 컬럼/정렬/조건 |
| 콘텐츠/미디어 | content_projects, content_generations, content_templates, media_assets와 jobs FK, 정책, storage 관련 기존 구조 |
| 신규 일정 | telegram_schedule_messages/revisions 및 동명 인덱스/RPC의 부재 또는 실제 정의 |
| 공통 선행 조건 | set_updated_at()가 인자 없는 trigger 반환 함수이고 updated_at만 갱신하는지, gen_random_uuid(), service_role USAGE/BYPASSRLS |
| 이력 | 이력 테이블 존재를 먼저 확인한 뒤 version/name과 수동 적용 스키마 대응 관계 확인 |

현재 정적 코드 비교에서 신규 SQL은 CRM/홈페이지 테이블에 FK나 쓰기를 추가하지 않는다. 그러나 **운영에서 기존 스키마가 보존되어 있다는 메타데이터 검증은 아직 완료되지 않았다**.

## 충돌 및 최소 적용 후보

원본 6개 마이그레이션에는 20260818 버전 중복 3개와 content 테이블의 jobs 선행 의존성이 있다. 기존 5개 SQL을 운영에 재실행하면 정책 중복, constraint 변경 등 불필요한 위험이 생긴다. 이력 부재를 전체 미적용으로 간주하지 않는다.

별도 파일 `docs/sql/apply-telegram-production-candidate.sql`은 텔레그램 원본 SQL만 포함하고 다음 안전장치를 추가했다.

- 단일 트랜잭션, lock_timeout 2초, statement_timeout 30초, 설치 작업 간 advisory lock.
- 신규 테이블/동명 인덱스/동명 RPC가 하나라도 존재하면 처음부터 중단. 부분 적용과 다른 RPC overload도 덮어쓰지 않는다.
- set_updated_at() 반환형, UUID 함수, service_role USAGE/BYPASSRLS 선행 조건 검사. 공통 함수를 생성/수정하지 않는다. 함수 본문의 의미는 별도 운영 메타데이터 검토가 필요하다.
- PUBLIC의 신규 테이블 권한을 제거하고 SECURITY INVOKER에 필요한 service_role 권한을 명시한다. messages: SELECT/INSERT/UPDATE, revisions: SELECT/INSERT. anon/authenticated 쓰기와 RPC는 원본처럼 차단한다.
- 기존 CRM/홈페이지 SQL, 마이그레이션 이력, 운영 환경변수는 변경하지 않는다.

**이 후보는 fresh-install 전용이며 무조건 성공하는 멱등 SQL이 아니다.** 재실행은 기존 객체 감지로 실패하고 트랜잭션이 롤백되는 설계다. 이미 적용되었다면 읽기 전용으로 검증하고 재실행을 생략한다. 부분 적용/상이한 스키마라면 실제 메타데이터에 맞춘 별도 delta SQL이 필요하다. 운영 실측 전이므로 이 후보가 운영에 필요한 최종 최소 변경이라고 확정할 수 없다.

## 이번 실행 결과

| 검증 | 결과 |
| --- | --- |
| 텔레그램 단위/route 테스트 | 9/9 통과 |
| 로컬 도구 안전장치 | 3/3 통과 |
| 보안 의존성 회귀 | 6/6 통과 |
| lint | 통과 (격리 빌드 복사본 제거 후 재확인) |
| Next 16.4.3 빌드 | 격리 복사본에서 `next build --webpack` 성공, TypeScript/정적 생성 20개 완료 |
| 후보 검증 runner 구문 | `node --check scripts/test-production-candidate-local.mjs` 통과 |
| 로컬 Supabase 시작 | 실패: dockerDesktopLinuxEngine named pipe 없음 |
| 후보 SQL 최초 적용/재실행/스키마 보존 검사 | 실행 시도했으나 Docker inspect 단계 차단, DB 명령 미실행 |
| pgTAP 신규 테이블/RPC 31개 | 실행 불가: Docker 엔진 부재 |
| 텔레그램 실제 DB 통합 | 실행 불가: Docker 엔진 부재 |
| 기존 CRM 실제 DB 회귀 | 실행 불가: Docker 엔진 부재 |
| 운영 metadata 비교 | 미실행: 브라우저 접근 시간 초과 |

빌드는 `.env.local`을 포함하지 않은 추적 파일 복사본에서 수행했다. cloud 관련 프로세스 환경변수도 제거하고 loopback URL/가짜 build-only publishable key를 사용했다. 실제 운영 값은 읽거나 변경하지 않았다. 첫 빌드는 파일 생성 EPERM으로 중단됐으나 격리 복사본에 대한 권한 재시도로 성공했다. 복사본 내 생성물이 root lint에 잡힌 중간 실패가 있어 빌드 복사본을 제거한 뒤 lint를 다시 실행했다. 원본 앱/설정 코드는 변경하지 않았다. 복사본 위치에 따른 workspace lockfile 경고가 있었으며 production 배포 검증을 의미하지 않는다. 기존 MODULE_TYPELESS_PACKAGE_JSON 경고는 테스트 실패가 아니다.

이전 날짜의 72개 통과 기록을 이번 후보 SQL 테스트 통과로 재사용하지 않는다.

## 로컬 검증 재개 절차

1. Docker Desktop Linux 엔진이 응답하는지 확인한다.
2. `npm run db:local:start`로 로컬 프로젝트만 시작한다. 이 명령은 loopback 전용 workdir을 사용한다.
3. `node scripts/test-production-candidate-local.mjs`를 실행한다. runner는 고정 로컬 container/image/55322 포트를 검증한 후 UUID 이름의 임시 DB를 만든다. 기존 SQL 5개는 **이 합성 로컬 DB에만** fixture로 적용한다.
4. runner는 읽기 전용 점검 SQL 문법, 후보 최초 적용, 기존 8개 테이블 schema-only dump 동일성, 재실행 거부 및 전체 public schema 동일성, pgTAP 31개를 검증한다. finally에서 자신이 생성한 임시 DB만 삭제한다. 실행 도중 강제 종료되었다면 로그/로컬 DB 목록으로 남은 `telegram_candidate_*`를 확인하고 소유권 확인 후 정리한다.
5. `npm run test:db:local`, `npm run test:telegram:local`을 실행한다. CRM은 기존 문서의 운영 env 없는 격리 checkout에서 `npm run security:local:start`, `npm run security:local:build`, `npm run test:crm:local` 순서로 검증한다. 현재 원본 checkout에는 .env.local이 있으므로 CRM wrapper가 이를 거부하는 안전장치를 유지한다.
6. 결과와 실패/스킵 수를 이 보고서에 갱신한다. 테스트 후 로컬 서비스만 stop한다. 운영 URL이나 실제 봇으로 대체하지 않는다.

## 운영 적용 순서 및 승인 게이트

1. 로그인된 운영 clean-manager 프로젝트와 기존 앱의 프로젝트 일치를 비밀값 출력 없이 확인한다.
2. 읽기 전용 SQL phase 1을 실행하고 전체 메타데이터를 내부 보관한다. 이력 테이블이 있으면 phase 2를 별도로 실행한다. 고객 행 SELECT 및 count(*)도 실행하지 않는다.
3. 위 대조표와 원본 SQL을 비교한다. 누락된 기존 CRM/홈페이지 객체가 있으면 신규 설치와 분리해 원인을 조사한다. 동명 신규 객체가 있으면 이 후보를 실행하지 않는다.
4. 로컬 DB 검증을 모두 통과시키고 최종 후보 SHA-256/커밋, 실행자, 대상 프로젝트, 작업 시간을 확정한다.
5. 운영 백업의 최근 성공 시각, 보존기간, PITR 사용 가능 여부/복구 목표 시점, 프로젝트/리전 일치, 접근 권한을 담당자가 확인한다. 별도 격리 복원으로 복구 가능성과 시간을 검증한다. storage 바이너리는 DB 백업과 별개이므로 필요한 기존 보관/복구 체계도 확인한다. 백업에 포함된 개인정보를 PR이나 로그에 올리지 않는다. 이번에는 백업 상태를 확인하지 못했다.
6. **최종 SQL 및 대상 DB에 대한 운영 DDL/권한 변경 승인이 필요하다.** 승인 전에는 이 단계 이후 실행하지 않는다. 승인 후에도 전체 파일을 한 트랜잭션으로 실행하고 오류 시 즉시 ROLLBACK한다. 기존 6개 migration 일괄 실행이나 history repair를 대신 수행하지 않는다.
7. 적용 직후 같은 읽기 전용 메타데이터로 기존 schema dump/정책/권한 동일성 및 신규 객체를 확인한다. 운영 합성 RPC 테스트도 DML이므로 별도 승인 전 실행하지 않는다.
8. 앱 배포/main 병합, 실제 봇 토큰/웹훅/운영 환경변수 변경, 실제 봇 E2E는 각각 별도 승인·작업 범위다. 이번 요청은 이를 금지하므로 진행하지 않는다.

## 롤백 및 복구

- COMMIT 전 실패: 동일 세션에서 ROLLBACK. timeout/부분 오류 후 나머지 구문을 따로 실행하지 않는다. 원본 CRM 스키마는 건드리지 않는다.
- COMMIT 후 앱 문제: 우선 신규 수신 경로 활성화를 보류한다. 이미 활성화된 경우 승인된 운영자가 수신을 중단하고 기존 CRM 기능을 유지한다. 신규 테이블을 즉시 삭제하지 않는다.
- 신규 수신 데이터가 있을 수 있는 경우: 승인된 내부 백업과 복구 가능성을 먼저 확인하고 원문/수정 이력을 보존한다. 앱 rollback으로 테이블을 남기는 방식을 우선 검토한다.
- 스키마 제거가 꼭 필요한 경우: 별도 승인된 down SQL로 신규 RPC, 신규 트리거/정책/인덱스/테이블만 의존성 순서로 처리한다. `CASCADE` 금지, 공유 `set_updated_at()` 및 기존 CRM/홈페이지 객체 삭제 금지. 데이터 손실 가능성과 백업을 확인하기 전에는 DROP을 실행하지 않는다. 파괴적인 자동 rollback 파일은 제공하지 않았다.
- DB 전체 복원은 기존 CRM의 새 변경까지 되돌릴 수 있다. 격리 복원 후 필요한 데이터만 복구하는 계획을 담당자와 승인하고, 운영 reset을 복구 수단으로 사용하지 않는다.
- CLI migration history 정합화는 별도 계획/승인 대상으로 남긴다. 이번 SQL은 history를 기록하거나 repair하지 않는다.

남은 핵심 위험은 운영 메타데이터 미검증, 후보 SQL 실제 DB 미검증, 백업/복구 미확인이다. 기존 설계의 동일 초 수정본 구분 한계와 실제 봇 네트워크 E2E 미검증도 남아 있다. 이 세 가지 주요 게이트가 해소되기 전 운영 적용은 보류한다.
