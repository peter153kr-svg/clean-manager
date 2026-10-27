# 운영 암호화 백업 진행 — 2026-10-27

**최신 상태: 운영 백업 실행 보류. 아래 긴 PowerShell 런처는 실패 조사용 과거 기록이며 재실행하지 않는다.** 최신 [실패 조사 및 단일 명령 준비 방식](backup-launcher-failure-review.md)을 따른다. 사용자의 최신 지시로 백업과 독립적인 개발은 codex/ai-office-development에서 계속한다. 아래의 백업 성공 후 개발 게이트는 최신 지시로 대체됐다.

## 현재 상태

대표 승인: 운영 DB 읽기 전용 암호화 백업 및 격리 로컬 복원, 성공 후 별도 개발 브랜치에서 AI 비서 개발. USB 작업 중단, 키와 백업은 현재 PC에만 보관. 운영 쓰기/마이그레이션/main 병합/운영 배포/고객 자동 메시지 금지.

새 운영 전용 age 키를 Git 밖 `C:\Users\온혁목\AppData\Local\SkyCleanSecureKeys\clean-manager-production-b8065939e74448fe82ed91e4bd11b44b`에 생성했다. 키 생성 종료 코드 0. 폴더 상속 ACL을 제거하고 현재 Windows 사용자만 FullControl을 갖도록 설정한 뒤 폴더/키 파일 ACL을 확인했다. 비밀키 본문이나 공개키를 출력하지 않았다. 테스트 키는 재사용하지 않았다.

저장소/프로세스에 DB 접속 URL·비밀번호가 없음을 값 출력 없이 확인했다. 사용자에게 DB 비밀번호를 알고 있으며 보안 입력 가능하다는 답변을 받았다. 아직 운영 DB 접속/덤프/복원은 실행하지 않았다. 백업 성공 게이트 전이므로 별도 개발 브랜치/신규 AI 기능 개발도 시작하지 않았다.

## 로컬 보안 입력

일반 PowerShell 창에서 다음 **개별 명령**을 실행한다. `.ps1`, 실행 정책 변경, Bypass, 암호를 포함하는 명령 인자/환경변수/파일을 사용하지 않는다. 비밀번호는 Get-Credential에만 입력하고 출력하지 않는다. 아래 변수 값이나 화면 전체를 채팅에 공유하지 않는다.

```powershell
$cleanManagerBackupHost = Read-Host 'Supabase Connect > Session pooler > Host 값만 입력 (URI 아님)'
$cleanManagerBackupUser = Read-Host '같은 화면의 User 값을 그대로 입력 (프로젝트 식별자 포함)'
$cleanManagerBackupPort = Read-Host '같은 화면의 Port 값을 그대로 입력'
$cleanManagerBackupCredential = Get-Credential -UserName $cleanManagerBackupUser -Message 'clean-manager 운영 DB 비밀번호: 계정 로그인 비밀번호와 구분'
```

Connect에서 **Session pooler 선택 여부를 먼저 확인**한 뒤 Host/User/Port를 표시된 값 그대로 입력한다. 이번 Dashboard에서 User는 프로젝트 식별자가 포함된 postgres.[PROJECT_REF], Port는 5432임을 값 노출 없이 확인했다. User는 postgres로 대체하거나 도구가 생성하지 않는다. Host/User/Port는 실제 입력값을 검증한 뒤 그대로 전달하며, 다른 값이면 자동 수정/포트 기본값 대체 없이 중단한다. 자격증명 창의 User도 변경하지 않는다. 비밀번호 변경/리셋은 하지 않는다. 이 절차 전체를 검토한 후에만 비밀번호를 입력한다. 입력 후 같은 창을 유지한다.

## 한 번만 실행하는 런처

위 입력이 준비된 같은 창에서만 실행한다. 아래에는 실제 접속정보나 암호가 없다. 익명 표준입력 파이프로 UTF-8 JSON을 전달하며, 덤프 바이너리는 PowerShell을 통과하지 않는다. 이 명령은 실제 운영 읽기/백업을 시작한다. 한 번 실패하면 자동 재시도하지 말고 비밀값 없는 요약만 확인한다.

```powershell
$backupStart = New-Object System.Diagnostics.ProcessStartInfo
$backupStart.FileName = 'C:\Program Files\nodejs\node.exe'
$backupStart.Arguments = '"C:\Users\온혁목\Desktop\사업\맑은하늘클린\clean-manager\scripts\backup-production-encrypted.mjs" --credentials-stdin'
$backupStart.WorkingDirectory = 'C:\Users\온혁목\Desktop\사업\맑은하늘클린\clean-manager'
$backupStart.UseShellExecute = $false
$backupStart.RedirectStandardInput = $true
$backupProcess = $null
$backupWireBytes = $null
try {
    if ($null -eq $cleanManagerBackupCredential -or $cleanManagerBackupCredential.UserName -cne $cleanManagerBackupUser) { throw 'User 불일치 또는 입력 취소: 실행하지 말고 중단하세요.' }
    $backupWireBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -InputObject @{host=$cleanManagerBackupHost;user=$cleanManagerBackupCredential.UserName;port=$cleanManagerBackupPort;password=$cleanManagerBackupCredential.GetNetworkCredential().Password}))
    $backupProcess = [System.Diagnostics.Process]::Start($backupStart)
    $backupProcess.StandardInput.BaseStream.Write($backupWireBytes,0,$backupWireBytes.Length)
} finally {
    if ($null -ne $backupProcess) { $backupProcess.StandardInput.Close() }
    if ($null -ne $backupWireBytes) { [Array]::Clear($backupWireBytes,0,$backupWireBytes.Length) }
    Remove-Variable cleanManagerBackupCredential,cleanManagerBackupHost,cleanManagerBackupUser,cleanManagerBackupPort,backupWireBytes -ErrorAction SilentlyContinue
}
if ($null -eq $backupProcess) { throw '백업 프로세스가 시작되지 않았습니다. 재실행하지 말고 중단하세요.' }
$backupProcess.WaitForExit()
"백업·복원 검증 종료 코드: $($backupProcess.ExitCode)"
```

변수와 비밀번호는 로컬 프로세스 메모리에서만 사용한다. 버퍼 지우기와 변수 제거는 디스크 저장을 방지하기 위한 관리이며, .NET/JavaScript의 모든 메모리 복사본이 즉시 소거된다고 보장하지 않는다. 종료 코드/요약 경로만 공유한다. 실제 접속 문자열, 자격증명 객체, 백업 원문, 키 본문은 공유하지 않는다.

## 준비한 도구의 안전 범위

- 입력한 Host/User/Port를 그대로 사용한다. 기존 앱 프로젝트와 Dashboard의 Session pooler 형식에 맞는지 검증하며, User를 생성/대체하지 않는다. direct/transaction pooler, 전체 URI, 임의 host, 잘못된 User/Port, 줄바꿈·NUL 비밀번호는 거부한다.
- Docker desktop-linux named pipe만 허용하고 이미 있는 PostgreSQL 17 이미지만 사용한다. 다운로드/설치를 하지 않는다.
- 운영 연결은 TLS verify-full 및 시스템 CA 검증을 사용한다. PGOPTIONS로 default_transaction_read_only=on, statement timeout 10분, lock timeout 2초를 설정한다. 메타데이터에서 transaction_read_only=on 및 서버 버전을 확인한다.
- 운영에서 실행하는 것은 시스템 메타데이터 SELECT와 pg_dump뿐이다. pg_dump는 serializable-deferrable 읽기 전용 스냅샷을 사용한다. 비밀번호는 Docker CLI 인자/컨테이너 설정/env가 아니라 익명 stdin으로 전달하여 일시적 프로세스 메모리에서만 사용한다. 원격 읽기 컨테이너에도 Docker 로그 저장을 사용하지 않는다.
- 전체 논리 DB custom archive를 age 공개키로 스트리밍 암호화한다. 역할 이름 등 보조 메타데이터도 별도 `.metadata.age`로 암호화한다. 두 파일 모두 지정 SkyCleanSecureBackups 폴더에 보관한다. 평문 DB 덤프/메타데이터 파일을 만들지 않는다.
- DB 글로벌 역할 비밀번호, Supabase 서비스 설정, Storage 파일 바이너리는 이 논리 DB 백업 범위가 아니다. DB 안의 auth 데이터는 원본 pg_dump 범위에 포함되며, 원문을 로그에 출력하지 않는다.
- 복원은 별도 network=none/공개 포트 없음/read-only rootfs/tmpfs/로그 비활성 컨테이너에만 수행한다. 소스 비밀번호와 비밀키를 복원 컨테이너에 마운트하지 않는다.
- archive에는 원본 소유권/권한 메타데이터를 유지한다. 로컬 검증에서만 --no-owner/--no-privileges 및 NOLOGIN 역할로 복원하므로 운영 보안 권한의 완전 동일성을 검증하지는 않는다. 복원은 --single-transaction/--exit-on-error를 사용한다.
- 복호화 메타데이터/스트림 해시 일치, pg_restore 종료 코드 0, public 테이블 집합 동일 여부를 확인한다. 이 검증은 운영 시점 이후 바뀐 행까지 비교하지 않으며, RPO/RTO 전체를 검증하는 것도 아니다.
- 종료 시 생성한 읽기/복원 컨테이너와 볼륨을 정확한 이름으로 제거하고 부재를 확인한다. 오류 발생 시에도 ciphertext는 삭제하지 않고 미검증 상태로 보존한다. 창 강제 종료 시 finally 정리를 보장하지 않으므로, 요약이 없으면 재실행 대신 정리를 요청한다.
- stdout/stderr/명령 인자/환경변수 원문은 로그에 저장하지 않는다. 결과는 enum 오류 분류와 종료 코드/성공 boolean/암호화 파일 경로·해시만 담는 `.supabase-local/production-backup-summary-<UUID>.json`이다. 이 결과는 Git에서 무시된다.

준비 검증: 구문/ESLint 및 접속 대상·UTF-8 프레이밍 검증 7개 통과. Windows PowerShell 5.1의 실제 PSCredential → GetNetworkCredential().Password → ConvertTo-Json → UTF-8 바이트 → .NET ProcessStartInfo 익명 stdin → Node의 운영용 공통 입력 함수까지, 한글/따옴표/역슬래시/기호가 포함된 **가짜 값**으로 정확한 전달을 확인했다. 비밀번호가 프로세스 인자에 없고 원문 출력이 없음을 확인했다.

추가로 운영용과 동일한 셸 래퍼를 network=none 임시 컨테이너에서 실행했다. pg_dump/psql 대신 가짜 클라이언트가 전달된 PGHOST/PGUSER/PGPORT와 합성 비밀번호의 해시, 읽기 전용/TLS 설정만 비교하도록 하여 통과했다. 실제 DB 접속은 없었고 비밀번호 원문을 출력하지 않았다. 이 검사에서 사용한 합성 SecureString 생성은 테스트 내부에서만 사용했으며 실제 비밀번호에는 AsPlainText 입력을 사용하지 않는다. 실제 DB 자격증명을 사용한 백업 실행은 아직 미완료다.

자격증명 전달 경로는 다음과 같다: 대표 PC의 PSCredential 메모리 → Node 자식의 익명 표준입력(UTF-8 JSON) → 검증된 메모리 Buffer → Docker 클라이언트 익명 stdin → 일시적 셸 프로세스 환경 → psql/pg_dump. 비밀번호는 명령줄 인자, Docker 컨테이너 설정 환경변수, 로그, 파일명, Git 파일에 들어가지 않는다. PostgreSQL 클라이언트에 필요한 PGPASSWORD는 컨테이너 내부 일시적 프로세스 메모리에만 존재하며 Docker --env로 설정하지 않는다.

## 같은 PC에 키·백업을 보관하는 위험

폴더를 분리하고 사용자 전용 ACL을 설정해도 같은 사용자 권한 탈취, 악성코드, 관리자 접근, PC/디스크 분실·고장·랜섬웨어에서 키와 백업을 동시에 잃거나 노출할 수 있다. 현재 PC만 보관한다는 대표의 결정을 따르며 USB/클라우드/다른 PC 복제는 하지 않는다. 이 제한을 복구 보장으로 표현하지 않는다.

## 이후 개발 게이트

backup success=true와 cleanupVerified=true를 확인한 뒤에만 새 개발 브랜치를 만들고 합성 개발 DB로 AI 일정 직원 → 총괄실장 → 매출 직원 순서로 진행한다. 실제 고객 백업/복원 데이터를 개발 DB 또는 Vercel Preview에 넣지 않는다. 홈페이지/SEO/CRM 기능을 보존하고 운영 적용은 별도 승인 대상으로 남긴다.
