# 청시문 웹사이트 (GitHub Pages)

인디 뮤지션과 라이브 공연장을 잇는 **청시문** 소개 사이트입니다. 서버 없이 GitHub Pages에 그대로 올리면 동작합니다.

## 들어 있는 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 메인 페이지 (소개 · 이용 방법 · 앱 화면 · 공연 일정 · 팬 등급 · FAQ · 사전 등록) |
| `robots.txt` | 구글 · 네이버(Yeti) · 다음 · 빙 · ChatGPT · Claude · Perplexity 등 검색/AI 봇 수집 허용 |
| `sitemap.xml` | 사이트맵 (이미지 · 영상 포함) |
| `llms.txt` | AI 검색(GEO)용 요약 문서 — 서비스 정의, 공연 일정, FAQ |
| `site.webmanifest`, `favicon.ico`, `assets/` | 아이콘, 공유 이미지(OG), 공연 클립 영상 |
| `404.html` | 없는 주소로 들어왔을 때 보이는 페이지 |
| `.nojekyll` | GitHub Pages가 파일을 그대로 쓰도록 하는 설정 |

## 1단계 — 저장소 만들기 (중요)

`robots.txt`, `sitemap.xml`, `llms.txt`는 **사이트 주소의 맨 앞(루트)** 에 있어야 검색엔진이 읽습니다. 그래서 저장소 이름을 꼭 이렇게 만드세요.

- 저장소 이름: **`내깃허브아이디.github.io`** (예: 아이디가 `hang2pm8pm`이면 `hang2pm8pm.github.io`)
- 사이트 주소: `https://내깃허브아이디.github.io/`

> 나만의 도메인(예: `cheongsimun.kr`)을 쓰면 브랜드와 검색 노출에 더 좋습니다. 이 경우 저장소 루트에 `CNAME` 파일을 만들고 도메인 한 줄만 적은 뒤, 도메인 업체에서 DNS를 GitHub Pages로 연결하세요.

## 2단계 — 파일 올리고 사이트 켜기

1. 저장소 화면에서 **Add file → Upload files**를 누르고, 이 폴더 안의 파일과 `assets` 폴더를 통째로 끌어다 놓습니다. (`.nojekyll`도 함께)
2. **Commit changes**를 누릅니다.
3. **Settings → Pages**에서 *Source*를 `Deploy from a branch`, *Branch*를 `main` / `/(root)`로 저장합니다.
4. 1~2분 뒤 `https://내깃허브아이디.github.io/`에서 사이트가 열립니다.

## 3단계 — 사이트 주소 맞추기

지금 파일에는 사이트 주소가 `https://YOUR-GITHUB-ID.github.io/` 로 들어 있습니다. 실제 주소를 Claude에게 알려주시면 모든 파일(canonical, 공유 이미지, 구조화 데이터, sitemap, robots, llms.txt)의 주소를 한 번에 바꿔 드려요.
직접 바꾸려면 모든 파일에서 `https://YOUR-GITHUB-ID.github.io/` 를 실제 주소로 찾아 바꾸기 하면 됩니다.

## 4단계 — 검색엔진 등록

### 네이버 서치어드바이저 (searchadvisor.naver.com)
1. 웹마스터 도구 → 사이트 등록에 사이트 주소 입력
2. 소유 확인에서 **HTML 태그** 방식을 고르고, 받은 코드를 `index.html` 상단의 `naver-site-verification` 줄에 넣고 주석(`<!-- -->`)을 풉니다 → 다시 업로드 → 확인
3. 요청 → **사이트맵 제출**: `https://YOUR-GITHUB-ID.github.io/sitemap.xml`
4. 요청 → **웹 페이지 수집**: 메인 주소 입력
5. 검증 → robots.txt 에서 수집 허용 확인

### 구글 서치 콘솔 (search.google.com/search-console)
1. 속성 추가 → URL 접두어에 사이트 주소 입력
2. **HTML 태그** 방식으로 받은 코드를 `google-site-verification` 줄에 넣고 주석을 풉니다 → 업로드 → 확인
3. Sitemaps 메뉴에 `sitemap.xml` 제출
4. URL 검사 → 메인 주소 → **색인 생성 요청**
5. [리치 결과 테스트](https://search.google.com/test/rich-results)로 FAQ · 공연(이벤트) · 영상 구조화 데이터가 인식되는지 확인

### 빙 웹마스터 도구 (bing.com/webmasters)
구글 서치 콘솔에서 가져오기를 하면 1분 만에 끝납니다. ChatGPT 검색 · Copilot이 빙 색인을 쓰기 때문에 AI 노출에 도움이 됩니다.

## 들어 있는 SEO · AEO · GEO 설정

- **SEO**: 제목 · 설명 · 키워드 메타, canonical, hreflang(ko-KR), Open Graph · 트위터 카드(공유 미리보기), 시맨틱 HTML(h1~h3, section, nav), 이미지 · 영상 대체텍스트, 사이트맵, 빠른 로딩(외부 라이브러리 없음)
- **AEO (답변 엔진 최적화)**: 질문형 제목("청시문은 무엇인가요?")과 바로 아래 한 문단 답변, FAQ 9개 + `FAQPage` 구조화 데이터, 요일별 공연 시간처럼 바로 인용 가능한 표
- **GEO (생성형 AI 최적화)**: `llms.txt` 요약 문서, AI 크롤러 허용 `robots.txt`, 서비스 정의 문장 · 핵심 정보 표, 운영자 · 공연장 · 주소 같은 출처 정보, 최종 업데이트 날짜, `Organization` · `Service` · `BarOrPub` · `MusicEvent`(공연 47건) · `VideoObject` 구조화 데이터

## 앞으로 바꿀 것

- **사전 등록 링크**: 구글폼이나 카카오톡 채널 링크가 생기면 알려주세요. 지금은 버튼이 "사전 등록 곧 오픈"으로 보입니다.
- **공연 일정**: 새 달 일정을 주시면 페이지 · 구조화 데이터 · llms.txt를 함께 갱신해 드려요. 지난 날짜는 페이지에서 자동으로 숨겨집니다.
- **공유 이미지**: `assets/og-image.png` (1200×630)를 바꾸면 카톡 · 페이스북 공유 미리보기가 바뀝니다.

최종 업데이트: 2026-11-04
