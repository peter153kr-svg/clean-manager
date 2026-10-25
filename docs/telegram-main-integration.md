# PR #1 최신 main 통합 검증 — 2026-10-25

## 통합 내용

- 최신 `origin/main`: `b7e1b874c38bf6a84794a7cb5feec719c49312d5` (보안 PR #3 merge).
- 이전 텔레그램 브랜치: `099ada54c298f24e4e2db8ad4eccfd53b24f6e0d`.
- 일반 merge commit: `480c7934ea1b908e0cb048818e144f254d870016`, 두 부모는 위 커밋들입니다.
- rebase, force push, main 병합 및 운영 배포를 하지 않았습니다.

충돌은 `.gitignore`, `package.json`, `package-lock.json` 3개였습니다. main의 보안 dependency/devDependency 및 lockfile을 유지하고 양쪽 npm scripts와 로컬 runtime ignore 규칙을 합쳤습니다.

Next/eslint-config-next 16.4.3, sharp 0.35.5, brace-expansion 1.1.21/5.0.12, js-yaml 4.3.2, source-map-js 1.2.2, zod 4.6.7을 유지했습니다. 강제 audit 수정이나 overrides를 추가하지 않았습니다.

main의 보안 CRM 도구가 기존 5개 SQL만 허용하던 점은 통합 후 실제 6개 SQL을 수용하도록 조정했습니다. 텔레그램 SQL이 존재할 때 명시적으로 로컬 맵에 추가하고, 예상 밖의 SQL이 추가되면 기존처럼 실행을 중단합니다. 기존 SQL 원본을 변경하거나 운영 이력을 재명명하지 않았습니다.

텔레그램 API/파서/수신함/인증 경계와 기존 CRM 앱 코드는 그대로 보존했습니다. 양쪽 테스트 파일과 npm 명령을 모두 유지했습니다.

## 실제 검증 결과

운영 env 파일이 없는 별도 detached worktree `clean-manager-integration-check`에서 정확한 통합 commit을 검증했습니다. 기존 작업 폴더에서도 npm ci가 성공했으며 운영 `.env.local`은 수정하지 않았습니다.

| 검사 | 결과 |
| --- | --- |
| npm ci (원본 작업 폴더 및 검증 worktree) | 성공 |
| npm audit / npm audit --omit=dev | 모두 취약점 **0** |
| npm run lint | 통과 |
| npm run typecheck | 통과 |
| npm run security:local:build | Next 16.4.3 production build 및 내장 TypeScript 검사 통과. 텔레그램 3개 경로 포함 |
| npm run test:security | **6/6 PASS** |
| npm run test:crm:local | **14/14 PASS** (상위 1 + 시나리오 13) |
| npm run test:telegram | **9/9 PASS** |
| npm run test:local-tools | **3/3 PASS** |
| npm run test:db:local | SQL **31/31 PASS** |
| npm run test:telegram:local | 실제 DB **9/9 PASS** (상위 1 + 시나리오 8) |

최종 테스트 실패/취소/스킵은 0입니다. Node의 기존 MODULE_TYPELESS_PACKAGE_JSON 경고와 npm의 기존 unrs-resolver 승인 안내는 있었지만 실패는 아닙니다. 글로벌 npm 승인 설정을 변경하지 않았습니다.

## DB·환경 안전성

보안 CRM은 로컬 clean-manager-security / loopback 56321, 텔레그램 SQL/DB 테스트는 로컬 clean-manager-local / loopback 55321에서 실행했습니다. 양쪽에서 6개 SQL의 격리된 복사본을 적용했습니다. 원본 env 값이나 실제 고객 데이터는 테스트에 사용하지 않았습니다.

종료 전 두 DB의 customers/inquiries/jobs/sales/telegram_schedule_messages/telegram_schedule_revisions 및 테스트용 Auth 사용자가 모두 0임을 확인했습니다. 테스트 SQL은 롤백하고 합성 fixture와 가상 계정을 정리했습니다. 양쪽 Supabase stop을 실행했습니다.

운영 DB 변경, 운영 환경변수 변경, 실제 Telegram 봇 설정 변경은 하지 않았습니다.

## 운영 마이그레이션 이력 점검

사용자 로그인 후 운영 Dashboard의 프로젝트와 기존 앱 URL 일치를 확인했습니다. 개요의 **No migrations**와 Migrations의 **Run your first migration** 표시를 읽기 전용으로 확인했습니다. 실제 고객 행은 조회하지 않았고 운영 SQL도 실행하지 않았습니다.

핵심 위험은 **운영 이력이 표시되지 않는 상태에서 기존 SQL 전체를 자동 재실행하면 안 된다**는 점입니다. 수동 적용된 테이블이 이미 존재할 수 있습니다. 저장소에는 날짜 version 20260818의 중복 3개와 jobs FK 생성 순서 문제가 있습니다. 텔레그램 SQL의 CREATE POLICY는 같은 정책이 존재하면 재실행에 실패할 수 있습니다. RPC의 service_role 테이블 권한과 set_updated_at 함수도 운영 메타데이터 대조가 필요합니다.

자세한 확인 범위·미확인 항목·조건별 충돌 가능성은 [production-migration-review.md](production-migration-review.md)에 분리했습니다. 준비한 읽기 전용 SQL은 로컬에서 문법만 검증했고 운영에는 실행하지 않았습니다.

## 남은 적용 조건

- 운영 SQL 이력 정합화·스키마 메타데이터 비교와 신규 SQL 적용은 별도 승인 후 진행해야 합니다.
- 실제 봇 전송·운영 데이터·이메일 발송 및 유료 AI E2E는 수행하지 않았습니다.
- Preview 로그인 보호는 유지하고 실제 봇을 연결하거나 우회 설정을 만들지 않습니다.
- PR #1의 동일 초 다중 수정본 구분 제한은 유지됩니다.
