# PR #1 추가 검증 결과 — 2026-10-25

## 판정

**운영 적용 보류.** 로컬 전용 설정과 테스트는 준비했지만 Windows 재시작 대기 상태로 Docker 엔진이 작동하지 않아 실제 로컬 DB 검증을 아직 완료하지 못했습니다.
운영 Supabase, 운영 환경변수, 실제 Telegram 봇 설정은 변경하지 않았습니다.

## 설치 및 현재 차단 요인

- Docker Desktop 4.96.3 설치 완료, Docker CLI 29.9.2 확인.
- Supabase CLI 2.122.0을 프로젝트 devDependency로 고정 설치.
- 사용자의 명시적 승인 후 WSL 2.7.14 설치와 Windows 기능 설정 명령 완료.
- CPU 펌웨어 가상화: 활성화. 현재 `HypervisorPresent`: False.
- Windows Component Based Servicing의 `RebootPending`: True.
- Docker 엔진 조회: API 500/응답 대기. 로컬 실행 도구는 12초 제한 후 DB 명령 실행 전에 중단합니다.
- 자동 재부팅은 실행하지 않았습니다. PC 재시작 후 Docker Desktop이 정상 실행되는지 다시 확인해야 합니다. 재시작 후에도 실패하면 WSL/VirtualMachinePlatform 기능 및 Docker 초기 설정을 추가 점검합니다.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| `npm run lint` | 통과 |
| `npm run test:telegram` | 9/9 통과 — DB 모의 테스트 포함 |
| `npm run test:local-tools` | 3/3 통과 — Preview 기본 전송 차단, 운영 도메인 차단, 원격 DB 인자 차단 |
| `npm run build` | 통과 — TypeScript 및 production build |
| `npm run db:local:prepare` | 통과 — 원본 6개 SQL의 로컬 복사본 생성 |
| 로컬 Supabase 기동/`test:db:local` | Docker 엔진 미기동으로 차단. SQL은 실행하지 않음 |
| pgTAP 31개 및 실제 DB 통합 테스트 | 준비 완료, 미실행. 합격으로 간주하지 않음 |
| Preview 웹훅 | 안전한 합성 재생 도구 및 절차 준비. 원격 전송·보호 설정 변경 없음 |

Node 테스트에서 기존 MODULE_TYPELESS_PACKAGE_JSON 경고가 발생하지만 테스트 실패는 아닙니다.

## 기존 SQL 문제와 해결

같은 날짜 버전의 기존 마이그레이션 3개와 `jobs` 생성 전 콘텐츠 FK 참조를 확인했습니다.
로컬 전용 작업 폴더에서 고유 버전과 의존성 순서를 적용한 내용 동일 복사본으로 처리합니다. 운영 마이그레이션 원본과 이력은 수정하지 않습니다.

## 보안 감사

`npm audit`는 6개 패키지에 대해 high 5건, critical 1건을 보고했습니다: brace-expansion, js-yaml, next, sharp, source-map-js, zod.
Next.js 16.3.1의 감사 결과에는 critical 항목이 포함됩니다. 감사 도구는 Next.js 16.4.3으로의 업데이트를 제시합니다.
이번 작업은 개발 DB 검증이므로 프레임워크나 기존 전이 의존성의 일괄 업데이트는 수행하지 않았습니다. 운영 적용 전 별도 보안 업데이트와 회귀 검증이 필요합니다.

## 재시작 후 이어갈 순서

1. Docker Desktop을 시작하고 Linux 엔진이 정상 상태인지 확인합니다.
2. `npm run db:local:start` → `npm run db:local:reset`로 로컬 전용 마이그레이션을 실행합니다.
3. `npm run test:db:local` → `npm run test:telegram:local`로 SQL 권한·수신·수정·중복·역순 수신을 검증합니다.
4. 실제 결과를 이 보고서와 PR에 업데이트합니다.
5. 격리된 Preview 테스트 DB와 승인된 자동화 인증이 준비된 경우에만 Preview 합성 수신을 검증합니다.
6. DB 테스트, 보안 업데이트, Preview 검증 완료 후 운영 적용 승인 여부를 결정합니다.

상세 실행 방법: [telegram-local-validation.md](telegram-local-validation.md)
