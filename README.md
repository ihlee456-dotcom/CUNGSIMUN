# 컨택싱어 웹앱 (GitHub Pages)

**컨택싱어(Contact Singer)** — 싱어 · 공연장 · 관객이 서로 컨택하는 라이브 공연 플랫폼(베타 서비스)을 화면마다 한 페이지씩 만든 웹앱입니다. 서버 없이 GitHub Pages에 그대로 올리면 동작합니다.

- 사이트 주소: **https://ihlee456-dotcom.github.io/CUNGSIMUN/**
- 시작 화면(`index.html`)에서 라이브바 사장님 · 손님 · 가수 중 프로필을 고르고 간단한 정보를 넣으면, ‘정보 받는 중’ 1~100%(5초) 뒤 그 프로필에 맞는 홈(`home.html`)이 열립니다.
- 휴대폰: 앱처럼 아래 탭 메뉴로 이동 / PC: 가운데 앱 화면 + 왼쪽에 전체 화면 메뉴
- 공연 현황판 · 예약 · 파트너 센터의 날짜는 **오늘 날짜 기준으로 자동** 바뀌고, 지난 공연은 숨겨집니다.

## 깃허브에 올리는 방법 (ihlee456-dotcom)

### 1. 저장소 이름 바꾸기 — 꼭 해 주세요
지금 저장소 이름 `충심문`을 그대로 쓰면 주소가 `https://ihlee456-dotcom.github.io/충심문/`처럼 길어지고, 검색엔진이 `robots.txt` · `sitemap.xml` · `llms.txt`를 찾지 못합니다.

1. 저장소 위쪽 메뉴의 **설정(Settings)** → **일반(General)**
2. **Repository name** 칸에 `ihlee456-dotcom.github.io` 입력 → **Rename**
3. 이제 사이트 주소는 `https://ihlee456-dotcom.github.io/` 가 됩니다.

### 2. 파일 올리기
1. 압축(zip)을 풀고, 풀린 폴더 **안에 있는 것 전부**(파일 + `assets` · `admin` 폴더)를 준비합니다. 폴더 자체가 아니라 그 안의 내용물입니다.
2. 저장소 **코드(Code)** 탭 → **Add file** → **Upload files**
3. 준비한 파일과 폴더를 한꺼번에 끌어다 놓습니다. 예전에 올린 같은 이름 파일(`index.html` 등)은 자동으로 새 파일로 바뀝니다.
4. 아래 **Commit changes** 클릭

### 3. 사이트 켜기
1. **설정(Settings)** → 왼쪽 메뉴 **Pages**
2. *Source*: `Deploy from a branch` / *Branch*: `main`, 폴더 `/(root)` → **Save**
3. 1~3분 뒤 `https://ihlee456-dotcom.github.io/` 접속. 위쪽에 주소가 표시되면 완료입니다.

> 이전에 올린 `청시문` 버전 파일 중 이름이 다른 파일이 남아 있으면 지워도 됩니다. 이번 버전은 위 목록의 파일만 씁니다.
> 나만의 도메인(예: `contactsinger.kr`)을 쓰고 싶으면 알려주세요. 주소를 바꿔 다시 만들어 드립니다.

## 화면 (페이지) 목록

| 파일 | 화면 | 검색 |
|---|---|---|
| `index.html` | 시작 화면 · 여러 가수의 무대 영상(14초 하이라이트) 위에서 넷플릭스처럼 프로필(라이브바 사장님 / 손님 / 가수) 고르기 → 정보 입력 → 정보 받는 중 1~100% (5초) | 검색 노출 |
| `home.html` | 홈 · 고른 프로필에 맞는 화면만 보여 줌 (사장님 / 손님 / 가수), 역할별 무대 영상 배너 · 공연 영상 카드 | 검색 노출 |
| `clip.html` | 공연 영상 (행2PM8PM 실제 공연 3개를 위아래로 넘겨 보기, 소리 켜기, 좋아요 · 공유 · 팔로우, 오늘 공연 예약) | 노출 안 함 |
| `booking.html` | 예약 (실제 공연 일정에서 날짜 · 공연 선택, 인원, 방문 인증, 대관 견적) | 검색 노출 |
| `tip.html` | 현장 팁 (받을 뮤지션 · 금액 고르기 → 계좌이체 안내 · 계좌번호 복사 → 입금 확인 문자 자동 작성, 100% 뮤지션 전달, 카드 · 간편결제 준비 중) | 노출 안 함 |
| `feed.html` | 피드 (클립 · 음원 게시물, 등급 뱃지 댓글, 추천/팔로잉/근처 공연장) | 노출 안 함 |
| `artist.html` | 싱어 프로필 · 팬 등급 · 혜택 · 팬 랭킹 | 노출 안 함 |
| `match.html` | 싱어용 AI 무대 컨택 | 노출 안 함 |
| `artist-register.html` | 싱어 프로필 등록 폼 | 검색 노출 |
| `venue-register.html` | 매장 등록 폼 (주소 검색 포함) | 검색 노출 |
| `venue-match.html` | 공연장용 AI 싱어 컨택 | 노출 안 함 |
| `partner.html` | 공연장 파트너 센터 (컨택 요청 수락 · 다가오는 무대 · 정산) | 노출 안 함 |
| `schedule.html` | 행2PM8PM 전체 공연 일정 (공연마다 구조화 데이터) | 검색 노출 |
| `about.html` | 서비스 소개 · 팬 등급표 · 자주 묻는 질문 | 검색 노출 |
| `admin/index.html` | 예전 관리자 주소 (이제 별도 관리자 사이트를 써요 · 안내만 표시) | 노출 안 함 |

**노출 안 함**으로 둔 화면은 예시 싱어(새벽오렌지 등)와 예시 수치가 나오는 화면입니다. 이 내용이 네이버 · 구글 · AI 답변에 사실처럼 퍼지지 않도록 `noindex`를 걸었고, 링크로 들어오면 정상적으로 보입니다.

## 그 밖의 파일

| 파일 | 역할 |
|---|---|
| `app.css`, `app.js` | 모든 화면이 함께 쓰는 디자인과 동작 |
| `data.js` | 행2PM8PM 공연 일정 데이터 (현황판 · 예약 · 파트너 센터가 사용) |
| `robots.txt` | 구글 · 네이버(Yeti) · 다음 · 빙 · ChatGPT · Claude · Perplexity 등 수집 허용, `/admin/` 제외 |
| `sitemap.xml` | 검색 노출 페이지 7개 (이미지 · 영상 포함) |
| `llms.txt` | AI 검색(GEO)용 요약 — 이름의 뜻, 서비스 구조, 공연 일정, FAQ, 페이지 안내 |
| `site.webmanifest`, `favicon.ico`, `` | 홈 화면에 추가 시 앱 아이콘, 공유 이미지, 공연 영상(`stage-mix.mp4` 하이라이트, `live-*.mp4` 전체 영상, `prev-*.mp4` 카드 미리보기) |
| `404.html`, `.nojekyll` | 없는 주소 안내, GitHub Pages가 파일을 그대로 쓰게 하는 설정 |

## 검색엔진 등록 (사이트가 열린 뒤)

### 네이버 서치어드바이저 (searchadvisor.naver.com)
1. 웹마스터 도구 → 사이트 등록에 `https://ihlee456-dotcom.github.io/CUNGSIMUN/` 입력
2. 소유 확인 → **HTML 태그** 방식 → 받은 코드를 `index.html` 위쪽의 `naver-site-verification` 줄에 넣고 주석(`<!--` `-->`)을 지운 뒤 다시 업로드 → 확인
3. 요청 → **사이트맵 제출**: `https://ihlee456-dotcom.github.io/CUNGSIMUN/sitemap.xml`
4. 요청 → **웹 페이지 수집**: `https://ihlee456-dotcom.github.io/CUNGSIMUN/`, `https://ihlee456-dotcom.github.io/CUNGSIMUN/home.html`, `https://ihlee456-dotcom.github.io/CUNGSIMUN/schedule.html`

### 구글 서치 콘솔 (search.google.com/search-console)
1. 속성 추가 → URL 접두어에 `https://ihlee456-dotcom.github.io/CUNGSIMUN/`
2. **HTML 태그** 코드를 `google-site-verification` 줄에 넣고 주석을 지운 뒤 업로드 → 확인
3. Sitemaps 메뉴에 `sitemap.xml` 제출
4. URL 검사 → 첫 화면 · `schedule.html` → **색인 생성 요청**
5. [리치 결과 테스트](https://search.google.com/test/rich-results)로 `about.html`(FAQ), `schedule.html`(공연 이벤트) 확인

### 빙 웹마스터 도구 (bing.com/webmasters)
구글 서치 콘솔에서 가져오기를 하면 끝납니다. ChatGPT 검색 · Copilot이 빙 색인을 써서 AI 노출에 도움이 됩니다.

## 들어 있는 SEO · AEO · GEO 설정

- **SEO**: 페이지마다 다른 제목 · 설명 · 키워드, canonical, hreflang(ko-KR), Open Graph · 트위터 카드, 시맨틱 HTML, 이동 경로(BreadcrumbList), 사이트맵
- **AEO**: 질문형 제목(“컨택싱어라는 이름은 무슨 뜻인가요?” 등)과 바로 아래 답변, FAQ 10개 + `FAQPage`, 요일별 공연 시간표 · 팬 등급 혜택 표
- **GEO**: `llms.txt`, AI 크롤러 허용 `robots.txt`, 이름의 뜻(`DefinedTerm`), `Organization` · `Service` · `BarOrPub` · `MusicEvent`(공연 47건) · `VideoObject` 구조화 데이터, 운영자 · 주소 · 최종 업데이트 날짜

## 서버(Supabase) 연결과 관리자 사이트

- 시작 화면의 사장님 · 손님 · 가수 정보, 상세 프로필 · 매장 등록(사진 · 사업자등록증 포함)은 **Supabase 데이터베이스**에 저장돼요. 연결 정보는 `config.js` 에 있어요(공개용 키만).
- 팝업 · 공지 배너 · 점검 모드 · 기능 켜기/끄기는 앱이 열릴 때마다 데이터베이스에서 읽어 와요. 관리자 사이트에서 바꾸면 이 저장소를 다시 올리지 않아도 바로 반영돼요.
- 관리자 화면은 **별도 저장소(contactsinger-admin)** 로 운영해요. 로그인한 관리자만 정보를 볼 수 있어요.
- **예약 · 대관 견적**은 데이터베이스에 신청으로 들어가고, 관리자가 확정하거나 답변하면 손님 앱 ‘내 예약’에 바로 보여요.
- **컨택 요청**(가수 → 라이브바, 라이브바 → 가수)은 승인된 회원끼리 주고받고, 수락하면 서로의 연락처가 보여요. 모든 기록은 관리자 사이트에 쌓여요.
- 현장 팁 기록(입금자명 · 금액)은 이 기기에만 저장돼요. 실제 입금 확인은 문자로 받아요.
- 서버에 닿지 못하면(오프라인, 미리보기 화면) 등록 내용은 이 기기에만 남기고 안내 문구를 보여 줘요.

## 앞으로 바꿀 것

- **공연 일정**: 새 달 일정을 주시면 `data.js` · 일정 페이지 · 구조화 데이터 · llms.txt를 함께 갱신해 드려요.

최종 업데이트: 2026-11-05
