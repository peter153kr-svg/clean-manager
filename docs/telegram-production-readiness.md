# PR #1 운영 적용 준비 — 2026-10-26

## 판정: 운영 적용 보류

신규 적용 SQL의 실제 로컬 DB 테스트와 후보 적용 후 CRM 회귀는 완료했다. 이후 사용자가 이번 작업에 한해 운영 읽기 전용 메타데이터/백업 조회를 승인하여 운영 점검을 진행했다. **운영 스키마 차이와 백업 부재를 확인했으므로 적용은 보류한다.** 이 문서는 운영 적용 승인이 아니다. 운영 DDL/DML, reset/push/repair/migration up, 봇/환경변수 변경, main 병합, Vercel 운영 배포는 실행하지 않았다. 운영 고객 데이터 행은 조회하지 않았다.

## 최신 운영 읽기 전용 확인 결과

### 대상 및 실행 범위

- Supabase Dashboard에서 clean-manager, main, Healthy 상태를 확인했다. 프로젝트 식별자는 보고서에 기록하지 않는다.
- 저장소 앱 설정과 Dashboard 프로젝트를 값 출력 없이 비교하여 일치를 확인했다. 추가로 기존 Vercel 앱의 공개 페이지(HTTP 200)에서 참조하는 정적 JS 9개를 읽어 고유 Supabase 프로젝트 참조 1개가 Dashboard와 일치함을 확인했다. 공개 자산 확인은 서버 전용 환경변수 전체의 일치나 배포 커밋 일치를 증명하지 않는다.
- 점검 SQL을 먼저 재검토했다. Phase 1은 READ ONLY/statement_timeout 10s/lock_timeout 1s/카탈로그 SELECT/ROLLBACK뿐이다. 권한 검사 문자열의 INSERT/UPDATE/DELETE는 실행문이 아니다.
- SQL Editor에 Phase 1 전체를 입력하여 시작/종료 구문을 확인하고 실행했다. Editor가 마지막 결과만 표시하고 가상화로 일부 행/컬럼을 숨겨, 같은 Phase 1 메타데이터 SELECT를 별도 READ ONLY 트랜잭션에서 재조회했다. 전체 비교를 위해 동일 시스템 카탈로그 결과를 jsonb_agg/jsonb_build_object로 묶어 단일 결과 셀로 읽었으며 앱 데이터 테이블 행을 읽지 않았다. 모든 재조회에도 동일 timeout과 ROLLBACK을 유지했다.
- `supabase_migrations.schema_migrations`의 to_regclass 결과는 NULL이었다. 따라서 **Phase 2는 실행하지 않았다.** 이력 부재를 앱 테이블 미적용으로 판단하지 않았다.
- 권한 오류는 발생하지 않았다. 백업 화면의 요금제 제한은 우회하지 않았고 유료 전환/백업 생성/복원은 실행하지 않았다.

### 실제 확인된 객체와 차이

| 범위 | 실제 확인 결과 |
| --- | --- |
| 기존 public 테이블 | customers, inquiries, jobs, sales, content_projects, content_generations, content_templates, media_assets 총 8개 존재 |
| 컬럼 | 총 87개. 기존 CRM/콘텐츠/미디어 컬럼 확인. 저장소의 기본 스키마와 완전 동일하지 않음 |
| 인덱스/제약/트리거 | 19개/34개/8개 확인. PK/FK/check, 기존 조회 인덱스 및 updated_at 트리거 존재 |
| RLS | 8개 모두 활성, FORCE RLS는 false. authenticated ALL 정책 8개, USING/WITH CHECK true |
| service_role | 8개 테이블 SELECT/INSERT/UPDATE/DELETE true, public USAGE true, BYPASSRLS true |
| 공통 함수 | public.set_updated_at(): 인자 없음, trigger 반환, SECURITY INVOKER, updated_at을 now()로 갱신하는 구현. service_role EXECUTE true. anon/authenticated EXECUTE도 true |
| 텔레그램 객체 | 두 테이블, 신규 3개 인덱스, ingest RPC, 관련 트리거/정책 없음. 동명 객체 충돌은 이번 public 조회 범위에서 발견되지 않음 |
| 이력 | CLI 이력 테이블 없음, Phase 2 생략 |

발견한 스키마 차이와 위험:

1. 운영 content_projects에는 저장소 SQL에 없는 `content_brief` 컬럼(jsonb, NOT NULL, 빈 JSON 기본값)이 있다. 보존해야 할 운영 확장이며 삭제/정규화하지 않았다.
2. 운영 content_generations/content_templates의 content_type check는 저장소 기본값 목록에 추가로 `website_case`를 허용한다. 기존 홈페이지 콘텐츠 기능과 관련될 수 있는 운영 확장이다. 기본 로컬 fixture가 이 차이를 재현하지 않았으므로 기존 로컬 회귀 통과를 운영과 동일한 스키마 검증으로 간주하지 않는다.
3. 운영 `inquiries_source_check`에는 `홈페이지`가 없다. 저장소 홈페이지 API는 source=홈페이지로 INSERT하므로, 현재 스키마에서 해당 경로가 실제 호출되면 제약 오류가 날 위험이 있다. 고객 행/실제 API 요청으로 재현하지 않았다.
4. 운영에 `inquiries_homepage_recent_dedupe_idx`가 없다. 저장소의 20260819 SQL과 다른 상태다. 성능/중복 확인 경로의 차이이며 신규 텔레그램 SQL로 해결되지 않는다.

위 차이를 발견한 즉시 적용 계획을 보류했다. 후보 텔레그램 SQL은 이 기존 객체를 변경하지 않고 신규 객체 이름 충돌도 발견되지 않았지만, **전체 운영 적용 가능 판정은 승인 불가/보류**다. 홈페이지 차이를 자동 수정하거나 기존 migration을 재실행하지 않았다. 별도 원인 조사/최소 변경 계획과 운영 확장을 반영한 로컬 fixture 검증이 필요하다.

### 백업 및 복구 확인 결과

| 항목 | 실제 확인 / 제한 |
| --- | --- |
| Dashboard 개요 | LAST BACKUP: No backups |
| Scheduled backups | Free Plan에는 project backups 미포함. 최근 성공 시각/백업 목록 없음 |
| 현재 보존기간 | Dashboard 관리형 예약 백업의 보존기간을 확인할 수 없음(현재 이용 불가). Pro 안내의 최대 7일은 현재 보존기간이 아님 |
| PITR | Pro Plan add-on 안내만 표시. 현재 사용 가능한 PITR 복구 구간 없음 |
| Restore to new project | Pro 이상 및 physical backups 활성화가 필요하다는 제한 표시. 사용 가능한 복원 지점/실행 절차 화면에 도달하지 않음 |
| 접근 권한 | 현재 계정으로 SQL 메타데이터와 백업 세 화면 조회 가능. 계정의 명시적 조직 역할/복원 실행 권한은 확인되지 않음 |
| 외부 수동 백업 | 존재/성공 시각/보관/암호화/복원 가능성 미확인. Dashboard에 없다는 이유로 외부 백업까지 없다고 단정하지 않음 |
| 백업 생성·복원 | 실행하지 않음. Storage 파일 복구 및 RPO/RTO도 검증하지 않음 |

현재 Dashboard로 실행 가능한 복원 경로를 확인할 수 없었다. 운영 적용 전 담당자가 승인된 백업 방식, 백업 성공 시각/대상/보존기간/보관 장소, 복원 담당자와 권한, Storage 별도 보관, RPO/RTO를 확정해야 한다. 데이터 추출을 포함한 백업 생성과 격리 복원 시험은 이번 읽기 전용 승인에 포함되지 않는다. 이 작업들은 별도 승인을 받은 뒤 실행하고 검증 증거를 확보해야 한다. 요금제 변경은 선택 가능한 별도 결정이며 이번에 수행하지 않았다.

### 정보 취급 및 미확인 범위

원본 결과를 파일/보고서/PR에 저장하지 않았다. 다만 화면 이동 오류 상태를 확인한 한 번의 도구 호출에서 메타데이터 셀 전체가 도구 출력에 포함됐다. 원본 로그 금지 요청을 완전히 준수하지 못한 점을 사용자에게 알렸으며, 고객 데이터 행/연결 비밀값은 포함되지 않았다. 이후 요약만 출력했다. 함수 본문/기본값 원문은 이 문서에 복사하지 않는다.

이 검증은 현재 객체 존재와 구조를 확인한 것이며 과거 기준 대비 데이터 보존이나 모든 속성의 완전한 동일성을 증명하지 않는다. 실제 고객 행, 행 수, 운영 RPC 실행, 실제 봇 E2E, 서버 전용 Vercel 변수 전체, 외부 백업과 복구 실효 권한은 미확인이다. 점검 SQL에 포함되지 않은 sales.profit 생성식 등 확장 메타데이터의 완전 대조도 남아 있다.

운영 적용 전 승인은 다음과 같이 분리해야 한다: (1) 운영 확장 보존 및 홈페이지 차이에 대한 별도 수정 범위 승인, (2) 필요한 백업 생성/보관 및 격리 복원 검증 승인, (3) 검증 완료한 최종 텔레그램 SQL의 대상/커밋/실행자/작업시간을 지정한 DDL·권한 변경 승인. 이번 승인으로 어느 것도 실행하지 않는다. main 병합·환경변수/봇 변경·운영 배포도 별도 범위다.

## GitHub 및 main 확인

- GitHub API에서 PR #1 `텔레그램 일정 수신함 및 웹훅 기반 추가`는 open, merged=false, mergeable=true였다.
- PR head 및 로컬 HEAD: `638e6fed53d03eb9dd24d17f88d2bdee68140ef0`.
- 최신 main: `b7e1b874c38bf6a84794a7cb5feec719c49312d5` (보안 PR #3 병합).
- `git fetch origin main codex/telegram-schedule-intake` 성공 후 `origin/main...HEAD`는 0/5, 원격 작업 브랜치와 로컬 HEAD 차이는 0/0이었다. 이번 준비 변경을 추가하기 전의 비교다.
- 기존 미추적 patch 및 supabase.zip은 사용하거나 커밋하지 않았다.

## 운영 읽기 전용 점검 상태

`docs/sql/inspect-production-migrations-readonly.sql`을 먼저 검토했다. 실행 구문은 BEGIN TRANSACTION READ ONLY, SET LOCAL 시간 제한, 시스템 카탈로그/정보 스키마 SELECT, ROLLBACK이다. DDL/DML 또는 사용자 정의 RPC 호출이 없다. `has_*_privilege`, `pg_get_*`, `to_regclass`는 시스템 메타데이터 조회다. 주석의 이력 SELECT는 phase 1에서 이력 테이블 존재가 확인된 경우에만 별도로 실행한다. 마이그레이션 version/name은 이력 메타데이터이며 고객 데이터가 아니다.

기존 파일에는 컬럼/인덱스/제약/트리거와 전체 public 정책 점검이 부족했다. 이를 추가하고 service_role의 테이블 권한, public 스키마 USAGE, BYPASSRLS, 함수 정의/서명/실행 권한을 조회하도록 보완했다. 함수 정의나 기본값에 비밀값을 하드코딩한 환경이라면 반환 내용을 외부에 게시하지 말고 로컬에서 검토한다. 결과 전체를 PR에 업로드하지 않는다.

이전 시도는 브라우저 정책 차단으로 종료되어 로컬 검증만 진행했다. 이후 이번 읽기 전용 승인으로 인앱 브라우저에서 접근하여 위 최신 결과를 확인했다. 예전 Dashboard `No migrations` 표시와 달리 이번에는 카탈로그에서 이력 테이블 부재를 직접 확인했다.

운영 메타데이터 대조 시 다음을 확인해야 한다.

| 범위 | 필요한 대조 |
| --- | --- |
| CRM | customers, inquiries, jobs, sales의 컬럼/자료형/null/default, PK/FK/check, 인덱스, 트리거, RLS/정책/권한 |
| 홈페이지 문의 | inquiries_source_check에 홈페이지 허용, inquiries_homepage_recent_dedupe_idx의 컬럼/정렬/조건 |
| 콘텐츠/미디어 | content_projects, content_generations, content_templates, media_assets와 jobs FK, 정책, storage 관련 기존 구조 |
| 신규 일정 | telegram_schedule_messages/revisions 및 동명 인덱스/RPC의 부재 또는 실제 정의 |
| 공통 선행 조건 | set_updated_at()가 인자 없는 trigger 반환 함수이고 updated_at만 갱신하는지, gen_random_uuid(), service_role USAGE/BYPASSRLS |
| 이력 | 이력 테이블 존재를 먼저 확인한 뒤 version/name과 수동 적용 스키마 대응 관계 확인 |

신규 SQL은 CRM/홈페이지 테이블에 FK나 쓰기를 추가하지 않는다. 기존 8개 운영 테이블 존재는 확인했지만, 위 운영 확장 및 홈페이지 차이 때문에 저장소 기본 스키마와 동일하다고 판단하지 않는다.

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
| Next 16.4.3 빌드 | 최초 webpack 성공에 이어, 이번 로컬 CRM 설정으로 기본 Turbopack 빌드/TypeScript/정적 생성 20개 성공 |
| 후보 검증 runner 구문 | `node --check scripts/test-production-candidate-local.mjs` 통과 |
| 읽기 전용 점검 SQL | 일회용 로컬 DB에서 실제 실행 성공 (운영 실행 아님) |
| 로컬 Supabase 시작 | Docker 29.9.2, clean-manager-local 및 clean-manager-security 기동 성공 |
| 후보 SQL 선행 조건/충돌/최초 적용/재실행 | 4개 시나리오 통과: 함수 누락 거부, 부분 적용 거부, 최초 적용, 재실행 거부 |
| 후보 적용 전후 스키마 | 기존 CRM/콘텐츠 8개 테이블 schema-only dump 동일. 거부된 재실행 전후 전체 public schema 동일 |
| 후보 일회용 DB pgTAP | 신규 테이블/RLS/RPC/중복/역순/권한 31/31 통과 |
| 기존 로컬 SQL 테스트 | 31/31 통과 |
| 텔레그램 실제 DB 통합 | 9/9 통과 (후보 적용 스키마에서 최종 재검증) |
| 기존 CRM 실제 DB 회귀 | 후보 SQL 적용 후 14/14 통과, 실패/취소/스킵 0 |
| 운영 metadata 비교 | 이번 승인 후 조회 완료, 운영 차이 발견으로 적용 보류. 상세는 상단 최신 결과 참조 |

빌드는 `.env.local`을 포함하지 않은 추적 파일 복사본에서 수행했다. cloud 관련 프로세스 환경변수도 제거하고 loopback URL/가짜 build-only publishable key를 사용했다. 실제 운영 값은 읽거나 변경하지 않았다. 첫 빌드는 파일 생성 EPERM으로 중단됐으나 격리 복사본에 대한 권한 재시도로 성공했다. 복사본 내 생성물이 root lint에 잡힌 중간 실패가 있어 빌드 복사본을 제거한 뒤 lint를 다시 실행했다. 원본 앱/설정 코드는 변경하지 않았다. 복사본 위치에 따른 workspace lockfile 경고가 있었으며 production 배포 검증을 의미하지 않는다. 기존 MODULE_TYPELESS_PACKAGE_JSON 경고는 테스트 실패가 아니다.

이번 실제 실행으로 결과를 갱신했다. 이전 날짜의 72개 통과 기록을 이번 후보 SQL 테스트 통과로 재사용하지 않았다.

### 후보 SQL 기반 로컬 검증 상세

검증 runner 첫 실행에서 새 DB의 extensions 스키마에 테스트 역할 USAGE가 없어 SET ROLE 이후 pgTAP `is` 함수 해석에 실패했다. 운영 SQL의 문제가 아닌 로컬 bootstrap 누락이었다. runner의 일회용 DB에만 anon/authenticated/service_role의 extensions USAGE를 추가하고 재실행하여 31개 모두 통과했다. 운영 권한은 변경하지 않았다.

runner는 누락된 set_updated_at()와 충돌하는 sentinel 테이블을 합성하여 사전 중단을 검증한 뒤 실제 후보 SQL을 적용한다. pg_dump는 schema-only로 사용하고, 테스트 DB는 finally에서 삭제했다. 검증 도구의 TAP 판정도 정확히 31개 성공을 요구하도록 보완했다.

실제 API 회귀용 로컬 프로젝트 두 개는 대상 테이블과 Auth 사용자 집계가 모두 0임을 먼저 확인했다. 원본 SQL은 그대로 두고 무시되는 로컬 workdir의 여섯 번째 fixture 복사본만 후보 SQL로 교체한 뒤 `db reset --local --yes`로 테스트 DB만 재구성했다. 기존 5개 SQL 재생은 이 로컬 fixture에 한정했다. CRM DB/API 56322/56321, 텔레그램 DB/API 55322/55321을 사용했다. 운영 reset/push/repair/migration up은 실행하지 않았다.

CRM 검증은 `.security-local/validation`의 운영 env 없는 추적 파일 복사본에서 실행했다. 로컬 CLI가 반환한 키만 메모리로 전달했으며 출력/커밋하지 않았다. 고객 생성/수정, 홈페이지 문의와 상태 변경, 작업 예약/진행/완료, 매출 생성/수정/중복 완료, 삭제 방지, 음수 비용/익명 읽기 차단, 로그인 CRM 화면/보호 경로/홈페이지 API, 로그아웃을 검증했다. 실제 봇이나 운영 API를 호출하지 않았다.

최종 집계에서 두 로컬 DB의 customers/inquiries/jobs/sales/telegram_schedule_messages/telegram_schedule_revisions 및 auth.users가 모두 0이었다. runner의 임시 telegram_candidate_* DB도 0개였다. 검증 복사본과 node_modules junction은 제거하고 원본 의존성은 유지했다. 두 로컬 Supabase 프로젝트를 종료했다.

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

남은 핵심 위험은 확인된 운영 스키마 차이와 Dashboard 관리형 백업/PITR 이용 불가 및 외부 복구 수단 미확인이다. 후보 SQL의 로컬 검증은 통과했지만 운영 확장을 반영한 검증은 별도로 필요하다. 동일 초 수정본 구분 한계와 실제 봇 네트워크 E2E 미검증도 남아 있다. 차이 처리 계획, 백업/복구 조건, 최종 SQL 운영 적용 승인이 완료되기 전 적용은 보류한다.
