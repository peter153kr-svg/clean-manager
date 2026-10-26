# 별도 보안 업데이트 작업 계획 — 2026-10-25

## 범위와 판정

PR #1의 DB 검증과 분리해서 처리합니다. 이번 작업에서는 package.json/package-lock.json 및 설치된 의존성 버전을 변경하지 않았으며 `npm audit fix --force`를 실행하지 않았습니다.
`npm audit --json` 결과는 취약 **패키지 이름 6개**(high 5, critical 1)를 집계합니다. 보안 권고나 CVE가 총 6개라는 의미는 아닙니다. 동일 패키지의 중첩 설치와 여러 권고가 함께 집계됩니다.
설치 버전은 lockfile, 의존성 경로는 npm explain으로 확인했습니다. 외부 공격이나 운영 시스템 취약점 재현은 수행하지 않았습니다.

## 원인과 프로젝트 영향

| 패키지 / 설치 버전 | 유입 경로 | 원인·영향 | 프로젝트에서 확인한 노출 | 별도 작업의 수정 목표 |
| --- | --- | --- | --- | --- |
| next 16.3.1 / critical | 직접 production 의존성 | Windows 파일시스템 서버, 이미지 최적화·OG 이미지 처리, 일부 캐시 기능의 RCE, 캐시 정보 노출, Server Actions DoS 등 여러 권고 | App Router와 Server Actions 사용 확인. Cache Components 활성화·use cache·next/image·ImageResponse 사용은 소스에서 찾지 못함. Windows 로컬 서버는 개발 PC에 해당. Vercel의 OS·플랫폼 완화 여부는 운영에 접근하지 않아 미확인. 미사용 기능만으로 전체 안전을 보장하지 않음 | next 및 eslint-config-next 16.4.3을 검증 후보로 고정, 실행 당일 재감사 |
| sharp 0.35.3 / high | next의 optional production 의존성 | upstream libheif/librsvg 메모리 취약점. 일부 Linux 환경의 이미지 디코딩에서 RCE 가능 | 직접 sharp 호출과 next/image 컴포넌트는 없음. 프레임워크 이미지 처리 경로·배포 패키지 포함 여부는 보안 PR에서 확인 필요 | >=0.35.5 및 플랫폼 바이너리 재설치/검증 |
| brace-expansion 1.1.18, 5.0.9 / high | ESLint/minimatch 및 TypeScript ESLint/minimatch, 둘 다 dev | 악의적인 중괄호 패턴이 CPU 소진·재귀 스택 고갈 유발 | 앱이 사용자 입력을 이 패키지로 전달하는 경로 없음. lint/CI가 신뢰하지 않는 파일 패턴·설정을 처리할 때 영향 | 각 호환 major에서 >=1.1.21, >=5.0.12로 lock 갱신 |
| js-yaml 4.3.1 / high | ESLint의 @eslint/eslintrc, dev | 빈 YAML merge mapping 반복이 기존 제한을 우회해 CPU 소진 | 앱의 YAML 입력 처리 없음. 개발/CI 도구의 악성 설정 파일 처리 경로에 한정된 것으로 판단 | 호환 범위 내 >=4.3.2 |
| source-map-js 1.2.1 / high | Tailwind/PostCSS 및 Next 내부 PostCSS | indexed source map의 큰 section offset을 검사하지 않아 event loop 정지 | 외부 source map 업로드·실행 API는 없음. 주로 CSS 빌드/도구 입력이며 lockfile상 production 경로에도 존재 | >=1.2.2, CSS 빌드 결과 비교 |
| zod 4.4.3 / high | ESLint React hooks와 OpenAI SDK optional peer | 대형 배열의 검증 오류를 제한 없이 누적해 메모리 고갈 | 앱의 직접 Zod 파싱 없음. AI 생성 코드는 자체 JSON schema/검증 사용. SDK가 연결한 경로의 영향은 별도 회귀 점검 | >=4.6.6, SDK/AI 결과 검증 회귀 |

이 평가는 소스·lockfile을 근거로 한 도달 가능성 분석입니다. 패키지의 존재와 실제 악용 가능성은 구분하며, 미확인 배포 세부사항은 안전하다고 가정하지 않습니다.

## Next.js Critical 상세

- [Windows 호스팅 RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36): 16.3.1은 영향 범위에 포함됩니다. 로컬 Windows 서버를 외부에 공개하지 않습니다.
- [typed array 캐시 RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): App Router Cache Components와 여러 typed array를 반환하는 use cache가 조건입니다. 현재 소스에 이 사용은 없지만 유지관리자는 해당 사용 여부와 관계없이 업데이트를 권고합니다.
- [SVG 이미지 최적화 RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): glibc Linux의 upstream 이미지 처리 조건에 따라 영향. sharp >=0.35.5가 필요합니다. Windows 호스팅 취약점과 별개의 경로입니다.
- 실제 사용하는 Server Actions에는 별도 DoS 권고도 있어 기능을 사용하지 않는다는 이유로 Next 업데이트를 생략하면 안 됩니다.

## 안전한 업데이트 순서 — 별도 보안 PR에서 실행

1. 별도 보안 브랜치에서 현재 lockfile·빌드·12개 단위/안전장치 테스트·31개 SQL 테스트·로컬 통합 테스트를 기준선으로 기록합니다. PR #1의 기능 변경과 합치지 않습니다.
2. 현재 npm 감사가 제시한 `next@16.4.3`과 `eslint-config-next@16.4.3`을 후보로 검증합니다. npm 메타데이터상 Node >=20.9.0, React/React DOM ^19, ESLint >=9 조건으로 현재 Node 24/React 19.2.8/ESLint 9 조합은 명시된 범위에 있습니다. 실제 Vercel Node 설정은 별도 확인이 필요합니다.
3. 유지관리자 변경 기록·새 로컬 Next 문서를 확인한 뒤 정확한 버전을 지정해 업데이트합니다. major 전체 업그레이드나 강제 자동 수정을 하지 않습니다.
4. sharp, brace-expansion 양쪽 major, js-yaml, source-map-js, zod는 각 부모가 허용하는 범위 안에서만 잠금 버전을 갱신합니다. 최신 버전으로의 무제한 갱신이나 검증 없는 overrides는 사용하지 않습니다.
5. 변경 lockfile의 모든 production/dev 전이 의존성을 검토하고 `npm ci`로 재현합니다. `npm audit --json`과 `npm audit --omit=dev --json`을 모두 비교합니다. 남은 권고는 영향·예외·기한을 명시합니다.
6. 아래 회귀 검증과 보호된 Preview 검증까지 통과한 별도 PR을 검토합니다. main 병합·운영 배포는 사용자 승인 없이 실행하지 않습니다.

## 필수 회귀 검증 및 완료 조건

- lint, TypeScript, production build, 단위/안전장치 테스트와 실제 로컬 DB 테스트 전부 통과.
- 개발 DB의 합성 고객/문의/작업/매출로 목록·상세·등록·편집·상태 변경·매출 계산 및 기존 FK 동작 확인. 운영 데이터는 사용하지 않음.
- 로그인·로그아웃·비로그인 리디렉션, 비밀번호 재설정 callback, 세션 쿠키 확인. 실제 이메일 발송은 하지 않음.
- 텔레그램 신규/수정/동시 중복/역순 수신 및 권한 차단, 홈페이지 문의 API 인증/중복 처리 검증.
- 미디어 업로드/조회/권한과 콘텐츠 생성의 JSON schema·오류 동작을 로컬 fixture·모의 AI 응답으로 검증. 외부 유료 API나 실제 채널 게시 없음.
- Tailwind/PostCSS CSS 결과와 반응형 주요 화면을 비교. 이미지 최적화 endpoint는 합성 fixture만 사용해 정상 동작/기본 차단 확인.
- Preview 로그인 보호 유지, 별도 테스트 DB 연결 확인. 운영 환경변수·DB·봇 설정 변경 없음.
- 불합격 시 배포하지 않고 해당 보안 브랜치에서만 수정/되돌림. 보안 수정의 완료를 DB 테스트 통과만으로 선언하지 않음.

## 원인별 근거

- [brace-expansion 유지관리자 권고](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr) 및 npm audit의 재귀 관련 추가 권고.
- [js-yaml 유지관리자 권고](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh).
- [sharp 유지관리자 권고](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) 및 libheif 권고.
- [source-map-js 1.2.2 릴리스](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).
- [Zod 수정 관련 유지관리자 변경](https://github.com/colinhacks/zod/commit/a0ebf97), 로컬 npm audit의 GHSA-mrhx-c7xc-m3w5 범위 정보.

별도 추적 작업: [GitHub 이슈 #2](https://github.com/peter153kr-svg/clean-manager/issues/2). 실제 보안 패키지 업데이트는 해당 작업의 별도 브랜치/PR에서 진행합니다.
