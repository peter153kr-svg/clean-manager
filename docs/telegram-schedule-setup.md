# 맑은하늘클린 텔레그램 일정 수신함 (1단계)

## 범위

@skyclean_schedule_bot이 참여한 **일정 채널의 새 게시글과 게시글 수정**을
CRM의 `/telegram-schedules`에 표시합니다.

- 저장: 원문, 작성·수정 일시, 사진/영상 등 첨부파일 ID, 받은 수정본 이력
- 안전장치: 별도의 서버 비밀키 검증 + 특정 채널 ID 허용목록 + 중복 방지
- **아직 하지 않는 일:** 예약 자동 확정, 고객 데이터 매칭, 매출 산입, 사진 파일 다운로드, 자동 메시지 전송
- 텔레그램은 대기 중인 업데이트를 오래 보관하지 않으므로 **과거 채널 전체를 자동 가져오지 않습니다.**
- 민감한 일정이 포함되므로 사용자 계정은 신뢰할 수 있는 관리자에게만 발급합니다.

## 사전 준비

1. 운영 중인 Supabase에 `supabase/migrations/20261025_create_telegram_schedule_messages.sql`을 **검토한 뒤 적용**합니다. 기존 고객·작업·매출 테이블은 수정하지 않습니다.
2. 텔레그램 채널의 관리자 목록에 봇 `@skyclean_schedule_bot`이 있는지 확인합니다.
3. 기존 clean-manager의 서버 호스팅 위치(Vercel 등)를 확인하고, 배포된 HTTPS 주소가 있는지 확인합니다. `skyclean.kr`이 **별도 홈페이지 프로젝트**라면 이 경로를 홈페이지에 등록하지 마세요.
4. 로컬 PC의 git-ignored `.env.local`에 다음 값을 안전하게 저장합니다. **BotFather 토큰을 ChatGPT 메시지나 GitHub에 붙여넣지 마세요.**

```dotenv
TELEGRAM_BOT_TOKEN=봇파더에서_받은_개인_토큰
TELEGRAM_SCHEDULE_WEBHOOK_SECRET=직접_생성한_긴_랜덤_영숫자_밑줄_하이픈_문자열
TELEGRAM_SCHEDULE_WEBHOOK_URL=https://CRM_배포도메인/api/telegram/schedule
# discover 단계 이후 입력
TELEGRAM_SCHEDULE_CHANNEL_ID=-100...
```

5. `TELEGRAM_SCHEDULE_WEBHOOK_SECRET`과 `TELEGRAM_SCHEDULE_CHANNEL_ID`는 **CRM 호스팅 서버의 비밀 환경변수**에도 설정합니다. `TELEGRAM_BOT_TOKEN`은 웹훅 수신 자체에는 필요하지 않으므로, 운영 서버에 불필요하게 추가하지 않아도 됩니다.

## 채널 ID 확인 및 연결

로컬 `clean-manager` 프로젝트 폴더에서 Node.js 24 기준으로 실행합니다.

```bash
# 봇이 추가된 채널에 테스트 메시지를 하나 올린 뒤
node --env-file=.env.local scripts/telegram-webhook.mjs discover
```

나오는 숫자 ID를 `TELEGRAM_SCHEDULE_CHANNEL_ID`로 입력합니다. 여러 채널 숫자가 나오면 채널을 확인한 뒤 선택하세요. 웹훅이 이미 있다면 먼저 기존 연결을 확인해야 하므로 이 스크립트는 무단으로 삭제하지 않습니다.

다음 순서대로 진행합니다.

1. CRM 코드와 SQL을 검증하고 CRM 호스팅 서버에 배포합니다.
2. CRM 서버의 환경변수 2개(채널 ID, 비밀키)를 설정하고 재배포합니다.
3. 로컬에서 `node --env-file=.env.local scripts/telegram-webhook.mjs register`로 웹훅을 등록합니다.
4. `node --env-file=.env.local scripts/telegram-webhook.mjs info`로 상태를 확인합니다.
5. **새로운 테스트 게시글**을 채널에 올리고, CRM → '텔레그램 일정'에서 수신과 수정 이력을 확인합니다.

## 운영 참고

- 수정된 메시지는 최신 원문이 목록에 표시되며, 이전에 받은 버전은 이력으로 남습니다. 같은 초에 여러 번 편집한 수정본은 Telegram API의 초 단위 시간 정보 때문에 구분이 제한될 수 있습니다.
- 봇을 채널에 추가하기 전에 기록된 글은 자동으로 수집하지 않습니다.
- 첨부 이미지 자체를 저장하지는 않습니다. 후속 단계에서 Bot API로 다운로드하려면 토큰·저장소·보관 정책이 추가로 필요합니다.
- 웹훅은 **특정 채널**의 업데이트만 수집합니다. 봇과 주고받은 개인 메시지나 다른 채널은 저장하지 않습니다.
- `getUpdates`와 `setWebhook`은 동시에 사용할 수 없습니다. 초기 채널 확인은 웹훅 등록 전에 진행합니다.
- 다음 개발 단계: 채널 메시지에서 일시·현장·금액·작업 범위 추출 → 대표님 검토 → CRM 예약과 연결 → 사전 촬영 체크리스트 생성.

## 개발 검증 및 운영 적용 승인

- `npm run lint`, `npm run test:telegram`, `npm run build`로 코드와 웹훅 동작을 검증합니다.
- 웹훅 테스트는 모의 DB와 테스트 전용 비밀키를 사용합니다. 실제 Telegram 수신이나 Supabase SQL 실행 검증을 대체하지 않습니다.
- PR의 Vercel Preview에서 UI와 빌드를 확인한 뒤, 별도 승인을 받아 운영 배포와 운영 DB 마이그레이션을 진행합니다. 이 문서의 설치 순서는 운영 변경에 대한 승인을 의미하지 않습니다.
- Preview의 DB 연동 테스트는 별도 개발 DB에서 진행합니다. 운영 DB의 쓰기 권한과 실제 봇 웹훅을 Preview에 연결하지 않습니다.
- `register`는 실제 봇의 수신 주소를 바꾸므로 운영 전환 승인을 받은 뒤 실행합니다. Preview 확인 과정에서는 실행하지 않습니다.
