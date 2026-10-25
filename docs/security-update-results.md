# 이슈 #2 보안 업데이트 및 회귀 검증 — 2026-10-25

## 변경 범위

- 기준: `origin/main`의 `15964731a10996127eece53d1c7227313edcc8af`.
- 보안 브랜치: `codex/security-issue-2`. 별도 worktree `clean-manager-security`에서 작업했습니다.
- PR #1의 `codex/telegram-schedule-intake`와 커밋 `099ada54c298f24e4e2db8ad4eccfd53b24f6e0d`는 수정하지 않았습니다.
- 앱의 `src/` 코드 및 기존 SQL은 변경하지 않았습니다. 보안 버전·lockfile과 재현 가능한 로컬 회귀 도구/테스트/문서만 추가했습니다.
- 운영 Supabase에 접근하지 않았으며 운영 환경변수·실제 Telegram 봇·Vercel 보호 설정을 변경하지 않았습니다. 실제 고객 데이터, 실제 이메일 발송, 유료 AI 호출을 사용하지 않았습니다.

## 호환성 및 정확한 버전

| 패키지 | 이전 | 업데이트 |
| --- | --- | --- |
| next | 16.3.1 | **16.4.3** 고정 |
| eslint-config-next | 16.3.1 | **16.4.3** 고정 |
| sharp | 0.35.3 | 0.35.5 |
| brace-expansion (구형/신형 전이 경로) | 1.1.18 / 5.0.9 | 1.1.21 / 5.0.12 |
| js-yaml | 4.3.1 | 4.3.2 |
| source-map-js | 1.2.1 | 1.2.2 |
| zod | 4.4.3 | 4.6.7 |

Node 24.19.0은 Next의 >=20.9.0 조건을, React/React DOM 19.2.8은 ^19 peer 조건을 만족합니다. ESLint 9와 TypeScript 5도 eslint-config-next의 명시 범위에 포함됩니다.
npm 메타데이터와 설치된 패키지의 선언을 대조했으며 `npm ls --all --json`은 exit 0, problems=[]였습니다.
[Next 16.4.3 릴리스](https://github.com/vercel/next.js/releases/tag/v16.4.3)와 [캐시 RCE 수정 범위](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr)를 검토했습니다.

직접 버전 지정 설치와 `npm update sharp brace-expansion js-yaml source-map-js zod`를 사용했습니다. 각 부모의 허용 semver 범위 내에서 갱신했으며 overrides 또는 `npm audit fix --force`는 사용하지 않았습니다.
Next/SWC/ESLint 플러그인 및 sharp 플랫폼 바이너리·libvips는 같은 계열로 함께 갱신됐습니다. ESLint 내부 fastq의 호환 patch 변경도 lockfile에 포함됩니다.
재현 테스트용 Supabase CLI 2.122.0은 devDependency로 고정 추가했습니다. main에 기존 로컬 DB 테스트 실행 도구가 없었기 때문입니다.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| `npm ci` | 성공, 잠금 파일 기준 새 설치 |
| `npm run lint` | 통과 |
| `npm run typecheck` (`tsc --noEmit`) | 통과 |
| `npm run security:local:build` | Next 16.4.3 production build 및 내장 TypeScript 검사 통과 |
| `npm run test:security` | **6/6 PASS** |
| `npm run test:crm:local` | **14/14 PASS**: 상위 1개 + CRM/HTTP 시나리오 13개 |
| `npm audit --json` | **취약점 0**, exit 0 |
| `npm audit --omit=dev --json` | **취약점 0**, exit 0 |
| `npm ls --all --json` | exit 0, 잘못된 의존/peer 0 |
| `git diff --check` | 통과 |

전체 감사의 이전 취약 패키지 6개(high 5, critical 1)가 현재 감사에서 모두 해소됐습니다. 알려진 npm 권고 기준의 결과이며 모든 보안 위험이 없다는 뜻은 아닙니다.

## 실제 CRM/HTTP 회귀 범위

`tests/crm-local.integration.mjs`는 실제 서버 액션을 컴파일해 실제 로컬 Auth/PostgREST로 실행합니다. navigation/cache 효과만 테스트용으로 치환합니다. 별도 production Next 서버의 HTTP 검증은 실제 프레임워크·미들웨어·SSR을 사용합니다.

- 합성 고객 등록/수정, 문의 등록 및 quote_sent 상태 변경.
- 고객/문의 FK를 가진 작업 예약, 작업중 변경, 완료 시 매출 생성.
- 최종금액 우선 및 최종금액이 없을 때 예상금액 사용.
- 매출/비용/결제 상태 수정과 DB generated profit 계산.
- 반복 완료가 매출을 중복 생성하거나 기존 paid/비용/금액을 초기화하지 않음.
- 이력 있는 고객 삭제 제한, 음수 비용 제한, 익명 고객/문의/작업/매출 읽기 거부.
- production HTTP: 주요 CRM 경로 5개의 비로그인 307 보호, 로그인한 대시보드/목록/고객·작업 상세/매출 편집 총 8개 경로 200.
- 로그인/비밀번호 찾기/비밀번호 변경 화면 200, 코드 없는 callback의 안전한 리디렉션, 로컬 sign-out 후 세션 제거.
- 홈페이지 문의 API는 무서명 요청 401, 합성 HMAC 서명 요청 200, 동일 원문 재전송 시 문의 1개 유지.

`test:security`는 sharp의 합성 SVG→PNG·크기, 두 brace-expansion major의 정상 glob, YAML alias, source map 왕복, Zod 정상/크기 제한, OpenAI SDK의 Zod JSON schema helper를 검증합니다. 외부 API 호출은 없습니다.

## 테스트 중 발견·수정한 오류

1. brace-expansion 5를 default export로 가정한 새 테스트 로더가 실패했습니다. 실제 명명 export `expand`로 수정 후 6/6 통과했습니다.
2. PostgREST의 일대일 jobs→sales 관계를 배열로 가정한 새 테스트가 실패했습니다. 실제 object 응답의 revenue를 검사하도록 수정 후 CRM 14/14 통과했습니다.
3. Git이 빈 테스트 디렉터리를 보존하지 않는 점을 처리해 새 clone에서도 로컬 준비가 실패하지 않도록 했습니다.

앱 코드의 회귀 실패는 확인되지 않았습니다. npm의 기존 unrs-resolver install-script 승인 안내와 PR #1의 Node MODULE_TYPELESS_PACKAGE_JSON 경고는 있었지만 검사 실패는 아닙니다. npm 전역 승인 설정을 변경하지 않았습니다.

## PR #1 텔레그램 영향 검증

원본 PR #1을 변경하지 않고 별도의 detached worktree `clean-manager-security-telegram`을 `099ada5`에 만들었습니다. 이 worktree에만 보안 브랜치의 dependencies/devDependencies와 lockfile을 덮어 테스트 의존성을 결합했습니다. 이 결합 상태는 PR #1에 커밋/푸시하지 않았습니다.

- `npm ci`: 성공, 감사 취약점 0.
- `npm run lint`: 통과.
- 기존 텔레그램 단위 테스트 **9/9**, 안전장치 테스트 **3/3** 통과.
- 기존 SQL **31/31 PASS**.
- 실제 로컬 DB 통합 **9/9 PASS** (상위 1개+시나리오 8개).
- Next 16.4.3 결합 production build 결과는 아래 최종 확인 절에 기록합니다.

수신/수정/동시 중복 5건/역순 수신/웹훅 인증/익명·로그인 권한/CRM 행 수 보존을 검증했습니다. 실제 Telegram 전송은 수행하지 않았습니다.

## DB 분리와 재현 명령

보안 CRM DB는 `clean-manager-security`, API `127.0.0.1:56321`, DB `56322`, Next HTTP 서버는 loopback `3160`입니다. 자동 env 파일이 있는 checkout에서는 Next 검증을 거부하며, 로컬 CLI 상태의 키만 메모리로 넘깁니다.
운영 SQL의 파일명/내용은 보존합니다. 원본 5개 SQL은 로컬 복사본에서 고유 버전·FK 순서만 조정합니다. 보안 테스트 DB는 운영 데이터를 복제하지 않습니다.

```powershell
npm ci
npm run security:local:prepare
npm run security:local:start
npm run security:local:reset
npm run security:local:build
npm run typecheck
npm run lint
npm run test:security
npm run test:crm:local
npm audit
npm audit --omit=dev
npm run security:local:stop
```

텔레그램 결합 DB는 별도 `clean-manager-security-telegram`, API `127.0.0.1:55321`, DB `55322`입니다. PR #1 원본 DB 컨테이너를 사용하지 않습니다.
CRM 테스트 종료 후 customers/inquiries/jobs/sales와 합성 Auth 사용자가 모두 0임을 읽기 조회로 확인하고 CRM DB를 종료했습니다. 텔레그램 결합 DB도 정리·종료 후 결과를 최종 확인 절에 기록합니다.

## 남은 제한

- 보안 업데이트의 main 병합·운영 배포는 하지 않습니다.
- Vercel Preview는 기존 로그인 보호를 유지합니다. 보호를 해제하거나 예외·자동화 비밀키를 만들지 않습니다. 새 PR의 자동 Preview 결과는 별도 확인합니다.
- 실제 봇 네트워크 E2E, 이메일 비밀번호 재설정 전체 흐름, 유료 AI 응답, 사진 전체 업로드/시각적 비교는 이 테스트의 범위 밖입니다.
- PR #1의 동일 초 다중 수정본 구분 제한과 운영 SQL 이력 점검 필요성은 이번 의존성 변경으로 해결되는 문제가 아닙니다.
- 기존 content 코드가 요구하는 일부 추가 컬럼은 저장소 초기 SQL과 차이가 있습니다. 이번 회귀 범위는 고객·문의·작업·매출이며, 관련 없는 콘텐츠 운영 스키마를 추정해서 변경하지 않았습니다.

## 최종 확인

- PR #1 결합 상태의 Next 16.4.3 production build와 내장 TypeScript 검사도 통과했습니다.
- CRM 및 텔레그램 결합 테스트 DB의 합성 데이터·가상 사용자 정리를 확인하고 두 Supabase 프로젝트를 종료했습니다. 실행 중인 Docker 컨테이너는 0개입니다.
- PR #1 원본 작업 폴더는 기존 패치/ZIP 미추적 파일만 남았고 origin/codex/telegram-schedule-intake는 099ada54c298f24e4e2db8ad4eccfd53b24f6e0d 그대로입니다.
