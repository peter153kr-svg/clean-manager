# PR #1 로컬 Supabase 및 Preview 검증

## 운영과 분리

이 검증 도구는 `.env.local`을 읽거나 수정하지 않습니다. `supabase link`, `db push`, `--linked`, 원격 DB URL, 실제 Telegram API 호출을 사용하지 않습니다.
프로젝트 전용 CLI는 `supabase@2.122.0`으로 고정했습니다. Docker Desktop과 WSL 2 엔진이 필요합니다.

```powershell
npm ci
npm run db:local:prepare
npm run db:local:start
npm run db:local:status
npm run db:local:reset
npm run test:db:local
npm run test:telegram:local
npm run db:local:stop
```

`reset`은 이 프로젝트의 **로컬 테스트 DB 데이터**를 초기화합니다. 운영 데이터는 복제하지 않습니다.
로컬 API는 `http://127.0.0.1:55321`, DB 포트는 `55322`, Studio 포트는 `55323`입니다.
로컬 런타임·키·생성 파일은 Git 제외 경로 `.supabase-local/`에만 저장합니다. CLI의 원본 `status` 결과에는 키가 포함될 수 있으므로 공유하지 마세요. 제공한 `db:local:status`는 키를 표시하지 않습니다.
Docker 포트가 다른 장치에 노출되지 않도록 Windows 방화벽의 공용 네트워크 접근은 허용하지 않고, 외부 터널은 열지 않습니다.

## 기존 마이그레이션 호환성

원본 마이그레이션 이름은 바꾸지 않습니다. 기존 파일에는 다음 두 문제가 있습니다.

- `20260818` 버전을 가진 파일 3개가 있어 CLI 이력의 버전이 중복됩니다.
- 알파벳순의 `create_content_tables`가 먼저 실행되면 아직 없는 `public.jobs`를 참조합니다.

로컬 실행 도구는 **내용이 같은 복사본**을 고유한 로컬 버전으로 생성하고, 고객/문의 → 작업/매출 → 콘텐츠 → 미디어 → 홈페이지 문의 → 텔레그램 순으로 실행합니다.
원본과 복사본의 대응은 `.supabase-local/migration-map.json`에 남습니다. 새 원본 파일이 생기면 자동 추정하지 않고 실행을 중단하므로 순서를 검토해야 합니다.
이 복사본은 로컬 전용입니다. 운영 마이그레이션 이력의 이름 변경·복구에는 사용하지 않습니다.

## 테스트 범위

- pgTAP 31개: 기존 테이블과 FK 의존성, RLS, 신규 수신, 수정 이력, 중복 수신, 역순 수정 수신, 재검토 초기화, 익명/로그인 역할의 읽기·쓰기·RPC 제한.
- 로컬 통합 테스트: 실제 라우트 코드를 컴파일하여 실제 로컬 Supabase JS 클라이언트와 PostgREST/RPC로 실행합니다. 원문 수신 → 수정 → 동시 중복 5건 → 오래된 수정본 → 웹훅 인증 실패/다른 채널 무시 → DB 권한 차단 → 기존 CRM 행 수 보존을 확인합니다.
- API 핸들러 통합 검증이며, Next.js 미들웨어나 실제 Telegram 네트워크 전송까지 포함한 종단간 테스트는 아닙니다.
- SQL 테스트는 트랜잭션을 롤백합니다. 통합 테스트는 고유한 가상 메시지 데이터만 만들고 종료 시 해당 행만 정리합니다. 로컬 키는 CLI 출력에서 메모리로 받아 테스트 프로세스에만 전달합니다.

## 로그인으로 보호된 Vercel Preview에서의 안전한 검증

현재 Preview는 Vercel 로그인 보호를 유지합니다. 이 보호를 끄거나 공개 예외를 만들지 않습니다.
실제 봇의 웹훅 주소를 Preview로 바꾸지 않습니다. 대신 합성 JSON을 HTTP로 재생합니다.

실행 전 조건:

1. 별도 개발 Supabase 또는 격리된 테스트 DB를 준비하고 마이그레이션을 검증합니다. 기존 운영 DB를 지정하지 않습니다. 로컬 DB는 외부 터널 없이 Vercel에서 접근할 수 없으므로 로컬 검증과 Preview 검증은 별도 단계입니다.
2. 사용자 승인 후 Preview 전용 DB 설정, 테스트 전용 채널 ID와 웹훅 비밀키를 사용합니다. Production 환경변수는 수정하지 않습니다. 현재 작업에서는 Preview 설정도 수정하지 않습니다.
3. Vercel의 승인된 Protection Bypass for Automation 비밀값이 있을 때만 요청 헤더로 전달합니다. 이 권한을 새로 만들거나 보호 설정을 변경하려면 별도 승인이 필요합니다.
4. 봇 토큰은 필요 없습니다. 테스트용 값만 Git에서 제외된 `.env.preview-webhook-test`에 저장합니다. 키를 채팅, 명령줄 인자, URL 쿼리 또는 Git에 넣지 않습니다.

필요한 테스트 변수 이름:

```dotenv
TELEGRAM_TEST_PREVIEW_ORIGIN=https://정확한-Preview-배포.vercel.app
TELEGRAM_TEST_PREVIEW_DB_CONFIRMED=isolated-test-db
TELEGRAM_TEST_PREVIEW_CHANNEL_ID=-1009876543210
TELEGRAM_TEST_PREVIEW_WEBHOOK_SECRET=테스트용_수신_비밀키
TELEGRAM_TEST_PREVIEW_BYPASS=승인된_Vercel_자동화_비밀값
```

DB 분리는 서버 설정을 직접 점검해야 합니다. `DB_CONFIRMED` 값 자체는 서버 DB 분리를 자동 검증하지 않습니다.

```powershell
node --env-file=.env.preview-webhook-test scripts/test-preview-webhook.mjs
```

도구는 알려진 운영 도메인을 거부하고 HTTPS Preview 주소만 허용합니다. `x-vercel-protection-bypass`와 `x-telegram-bot-api-secret-token`을 함께 사용하며 리디렉션은 따라가지 않습니다. 기본 실행은 값이 없으면 전송 전에 중단합니다.
HTTP 200만으로 DB 저장 성공 검증을 완료했다고 판단하지 않습니다. 테스트 DB에서 합성 메시지 원문과 수정 이력을 확인해야 합니다. 수신함은 읽기 전용이므로 테스트 데이터 정리는 해당 **개발 DB** 관리 절차로 진행합니다.

공식 자료:
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/reference/cli/supabase-test-db
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
