# PR #1 로컬 DB 검증 결과 — 2026-10-25 재부팅 후

## 판정

**요청한 로컬 데이터베이스 검증 완료. 운영 적용은 별도 보안 업데이트와 Preview 검증 완료 전까지 보류합니다.**
운영 Supabase에 접근하거나 운영 환경변수·실제 Telegram 봇 설정을 변경하지 않았습니다. main 병합 및 운영 배포도 수행하지 않았습니다.

## 실행 환경 및 대상 확인

- Docker Desktop 4.96.3 / Docker 엔진 29.9.2: 정상 응답.
- WSL2 `docker-desktop`: Running, VERSION 2. Windows HypervisorPresent: True.
- Supabase CLI 2.122.0 / 로컬 PostgreSQL 이미지 17.11.0.006.
- 프로젝트 `clean-manager-local`, 전용 workdir `.supabase-local/`, API `http://127.0.0.1:55321`, DB 포트 `55322`.
- 실행 도구는 cloud 토큰·DB URL·텔레그램 환경변수를 하위 CLI에서 제거하며 원격 link/ref 및 원격 인자를 거부합니다.
- `.env.local`과 운영 DB 연결정보를 테스트에 사용하지 않았습니다. 서비스 키와 익명 키는 **로컬 CLI 상태 출력에서만** 메모리로 받아 테스트 프로세스에 전달하고 표시하지 않았습니다.

## 요청 순서대로 실행한 결과

| 명령 | 결과 |
| --- | --- |
| `npm run db:local:prepare` | 성공. 원본 내용 동일 SQL 6개의 로컬 고유 버전 복사본 준비 |
| `npm run db:local:start` | 성공. 최초 이미지 다운로드 후 로컬 서비스 정상 기동 |
| `npm run db:local:status` | 성공. loopback API 주소 검증 통과, 키 출력 없음 |
| `npm run db:local:reset` | 성공. 기존 SQL 5개와 텔레그램 SQL 1개 적용. 이력 6개 확인 |
| `npm run test:db:local` | **31/31 PASS**, 실패 0 |
| `npm run test:telegram:local` | **9/9 PASS**, 실패 0, 취소/스킵 0. 상위 테스트 1개 + 시나리오 8개 |
| `npm run db:local:stop` | 성공. 전용 로컬 프로젝트 종료, 로컬 데이터 백업 유지 |

Node의 기존 MODULE_TYPELESS_PACKAGE_JSON 경고와 pgTAP 확장이 이미 존재한다는 NOTICE는 있었으나 실패는 아닙니다.
직전 커밋의 lint·production build·단위/안전장치 테스트 12개는 통과한 상태입니다. 이번 재개 작업은 문서만 변경하며 의존성 또는 앱 코드는 변경하지 않습니다.

## 31개 DB 테스트에서 확인한 사항

- 고객·문의·작업·매출·콘텐츠·미디어 테이블과 FK 의존성 충족.
- 일정 수신함과 수정 이력 테이블의 RLS 활성화.
- 원문 저장, 수정 이력 보존, 동일 수정본 재수신 시 중복 행 없음.
- 늦게 온 수정본은 이력에 보관하면서 최신 메시지/검토 상태를 되돌리지 않음.
- 새 수정본은 검토 상태를 확인 대기로 바꾸고 이전 파싱 결과를 초기화.
- 익명 읽기·RPC 차단, 로그인 역할의 읽기 허용 및 INSERT/UPDATE/DELETE/RPC 차단.

## 실제 DB 통합 시나리오 8개

1. 실제 RPC를 통한 신규 채널 글 저장.
2. 수정된 글의 최신 원문 갱신 및 이전 원문 보관.
3. 동일 수정본 동시 5건 재수신에도 메시지 1개/수정 이력 2개 유지.
4. 오래된 수정본 저장 후 최신 원문 유지, 이력만 추가.
5. 잘못된 웹훅 비밀키는 401, 다른 채널은 ACK만 하고 저장하지 않음.
6. 실제 익명 PostgREST 읽기·RPC 거부.
7. 로컬 Auth에 만든 가상 계정의 실제 로그인 후 읽기는 허용, 수정·RPC는 거부.
8. 고객·문의·작업·매출 테이블의 행 수가 테스트 전후 동일.

실제 라우트 코드를 컴파일하여 로컬 PostgREST/RPC/Auth와 실행한 통합 테스트입니다. Next.js 미들웨어, Vercel Preview 보호 통과, 실제 Telegram 네트워크 전송까지 포함하는 E2E는 아닙니다.

## 데이터 정리 및 종료 증거

종료 전 로컬 컨테이너의 psql 읽기 조회로 다음을 확인했습니다.

- 마이그레이션 이력: 6개.
- 고객/문의/작업/매출: 각각 0행. 새로 만든 테스트 DB이며 운영 데이터를 복제하지 않았습니다.
- 텔레그램 수신함/수정 이력: 각각 0행. SQL 테스트 롤백과 통합 테스트 fixture 삭제 완료.
- `local-inbox-…@example.invalid` 가상 사용자: 0명. Auth 정리 완료.

`db:local:stop` 성공 후 프로젝트 전용 실행 컨테이너가 0개임을 확인했습니다. Docker Desktop/WSL 자체는 종료하지 않습니다.

## 보안 검토 및 남은 문제

- 최신 npm audit: 취약 패키지 6개(high 5, critical 1), 이전 결과와 동일. 강제 수정이나 버전 변경 없음.
- [별도 보안 작업 #2](https://github.com/peter153kr-svg/clean-manager/issues/2)로 Next.js Critical과 기존 기능 회귀 검증을 분리해 추적합니다.
- [보안 원인·영향·업데이트 계획](security-update-plan.md)에 패키지별 경로와 위험 조건, Next/eslint-config-next 16.4.3 후보 및 전이 의존성 수정 목표를 기록했습니다.
- 로그인 보호를 유지한 Preview의 합성 수신은 아직 실행하지 않았습니다. 별도 테스트 DB와 승인된 자동화 인증이 필요합니다. 운영/Preview 설정은 변경하지 않았습니다.
- 마이그레이션 원본의 날짜 버전 중복·의존 순서 문제는 로컬 복사본에서 처리했습니다. 운영 이력의 이름 변경이나 원본 파일 재적용은 수행하지 않습니다. 운영 SQL 적용 시 실제 적용 이력에 대한 별도 승인된 점검이 필요합니다.
- 동일 초 수정본을 시간만으로 구분하는 현재 설계의 제한은 유지됩니다. 이번 테스트는 초가 다른 수정본을 검증했습니다.

이전 재부팅 전의 차단 원인(Docker 엔진 미기동/Windows RebootPending)은 이번 재부팅 후 해소됐습니다.
상세 실행/Preview 절차: [telegram-local-validation.md](telegram-local-validation.md)
