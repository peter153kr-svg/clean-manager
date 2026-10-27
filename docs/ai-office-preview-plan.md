# AI 비서 V1 Preview 준비안 — 실행 전 별도 승인 필요

현재 코드는 합성 모드와 loopback Supabase만 허용한다. 이 문서는 연결 방안이며,
외부 DB 생성·연결 허용 코드 배포·환경변수 변경·Preview 배포를 실행하지 않았다.
운영 Supabase 프로젝트/키를 재사용하거나 운영 백업을 개발 DB에 복원하지 않는다.

## 권장 구성

실제 고객 데이터가 없는 전용 Supabase 개발 프로젝트와 PR #4 Vercel Preview를
짝지어 사용한다. 전용 개발 Auth 사용자, 개발 관리자 역할, 합성 고객/일정만 준비한다.
운영 프로젝트와 URL/프로젝트 ref/서비스 키/DB 비밀번호를 분리한다.
환경변수를 연결하기 전에 운영 Vercel 설정을 읽거나 수정할 필요가 없는 구성을 사용한다.

현재 코드의 loopback 차단과 HTTP loopback Origin 검사는 그대로 두었다. 원격 연결은
새 개발 전용 허용 목록, HTTPS Origin/Host 검증, Preview 호스트 검증, 운영 ref 거절을
추가한 후 별도 검토해야 한다. 변수만 바꿔 현재 코드를 원격 DB에 연결할 수는 없다.

## 필요한 설정 (값은 저장소/로그/보고서에 기록하지 않음)

| 설정 | 용도/경계 |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | 승인받은 별도 개발 프로젝트 URL만 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 같은 개발 프로젝트 공개 Auth 키 |
| SUPABASE_SERVICE_ROLE_KEY | Preview 서버 전용 비밀 저장소, 브라우저 전달 금지 |
| AI_OFFICE_DEV_MODE | 합성 모드; 원격 허용 변경은 별도 검토 |
| VERCEL_ENV / Preview URL | 플랫폼 제공 환경을 검증하고 production 거절 |
| TELEGRAM_SCHEDULE_CHANNEL_ID | 합성 채널 식별자만, 실제 채널 사용 금지 |
| TELEGRAM_SCHEDULE_WEBHOOK_SECRET | 합성 수신 테스트용 별도 랜덤 값; 실제 봇 미연결 |

OPENAI_API_KEY 및 실제 봇 토큰은 필요 없다. 환경변수는 Preview 범위와 해당 개발
브랜치로 한정하고 Production/운영 프로젝트에는 등록하지 않는다. Auth 리다이렉트
허용 목록도 승인된 Preview 주소만 포함한다.

## 승인 뒤 실행할 순서

1. 별도 개발 프로젝트 생성 위치·비용·접근 담당자, 합성 데이터만 사용한다는 범위 승인.
2. 개발 DB 준비 SQL을 기존 migration dependency 순서와 새 로컬 fixture에서 별도 검토.
   원본 6개 migration의 일괄 재실행 명령을 운영에 사용하지 않는다.
3. 개발 전용 관리자 최초 지정/회수 절차와 RLS를 점검한다. 이메일/metadata 자가 승격을
   허용하지 않으며, 관리자 추가는 승인된 운영자만 수행한다.
4. 원격 개발 연결 허용 코드와 정확한 Preview Origin/Host 검증을 구현·로컬 회귀한다.
5. 개발 프로젝트 전용 환경변수 설정과 Preview 배포에 대한 별도 승인을 받는다.
6. 승인 후에만 Preview 배포, 합성 사용자로 관리자/일반 사용자 분리 및 모바일 전체
   흐름을 검증한다. 실제 봇/고객 메시지/유료 AI API는 계속 사용하지 않는다.
7. 실패하면 해당 Preview를 이전 정상 개발 커밋으로 되돌리고 별도 개발 DB의 합성
   데이터만 복구/정리한다. 운영 DB·운영 배포에는 손대지 않는다.

Preview가 통과해도 main 병합·운영 배포·운영 SQL·실제 봇 활성화는 별도 승인 대상이다.
운영 백업과 복원 검증 미완료 상태를 운영 적용 절차에서 해결해야 한다.
