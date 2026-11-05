# 컨택싱어 웹앱 (GitHub Pages)

**컨택싱어(Contact Singer)** 앱 목업을 화면마다 한 페이지씩 만든 웹앱입니다. 휴대폰에서는 앱처럼 아래 탭으로, PC에서는 가운데 앱 화면과 왼쪽 전체 메뉴로 움직입니다.

- 사이트 주소: **https://ihlee456-dotcom.github.io/CUNGSIMUN/**
- 첫 화면(`index.html`)이 앱 홈이에요. 처음 들어오면 컨택싱어 소개 팝업이 가볍게 떠요.

## 올리는 방법 — 폴더 없이 파일만 있어요

이 버전은 **모든 파일이 한 폴더에** 들어 있어서, 깃허브에서 폴더가 풀려도 그대로 동작합니다.

1. 압축을 풀고 `CUNGSIMUN` 폴더를 엽니다.
2. 안의 파일을 **전부 선택**(Ctrl+A)합니다.
3. 깃허브 저장소 **Code** 탭 → **Add file** → **Upload files** → 선택한 파일을 끌어다 놓기
4. **Commit changes**
5. 1~3분 뒤 https://ihlee456-dotcom.github.io/CUNGSIMUN/ 새로고침 (안 바뀌면 Ctrl+F5)

같은 이름 파일은 자동으로 새 파일로 바뀌니 지울 필요가 없습니다.

## 화면 (페이지)

| 파일 | 화면 |
|---|---|
| `index.html` | 홈 · 첫 방문 소개 팝업 · 역할 선택 · 공연 현황판 · 내 팬 등급 |
| `clip.html` | 공연 클립 |
| `booking.html` | 예약 (= 방문 인증) · 대관 견적 |
| `tip.html` | 현장 팁 |
| `feed.html` | 피드 |
| `artist.html` | 싱어 프로필 · 팬 등급 · 혜택 |
| `match.html` | 싱어용 AI 무대 컨택 |
| `artist-register.html` | 싱어 프로필 등록 |
| `venue-register.html` | 매장 등록 |
| `venue-match.html` | 공연장용 AI 싱어 컨택 |
| `partner.html` | 공연장 파트너 센터 |
| `schedule.html` | 행2PM8PM 공연 일정 |
| `about.html` | 서비스 소개 · FAQ |
| `admin.html` | 운영 관리자 (시안, 검색 노출 안 함) |

예시 싱어(새벽오렌지 등)가 나오는 화면은 검색에 노출되지 않게 막아 두었습니다.

## 검색엔진 등록

- 네이버 서치어드바이저: 사이트 `https://ihlee456-dotcom.github.io/CUNGSIMUN/` 등록 → HTML 태그로 소유 확인(`index.html` 위쪽 `naver-site-verification` 줄) → 사이트맵 `https://ihlee456-dotcom.github.io/CUNGSIMUN/sitemap.xml` 제출
- 구글 서치 콘솔: URL 접두어 `https://ihlee456-dotcom.github.io/CUNGSIMUN/` → HTML 태그 확인 → 사이트맵 제출
- 들어 있는 설정: 페이지별 제목 · 설명 · 공유 이미지, 구조화 데이터(Organization · Service · BarOrPub · MusicEvent 47건 · FAQPage · VideoObject), `llms.txt`, `sitemap.xml`

> 저장소 이름을 `ihlee456-dotcom.github.io`로 바꾸면 주소가 `https://ihlee456-dotcom.github.io/`로 짧아지고 `robots.txt` · `llms.txt`도 검색엔진이 바로 찾습니다. 바꾸시면 그 주소에 맞춘 파일을 다시 만들어 드려요.

## 관리자 (`admin.html`)

싱어 등록 · 매장 등록 · 현장 팁에서 입력한 내용이 같은 기기 · 같은 브라우저의 관리자 화면에 ‘검토 중’으로 들어옵니다(시연용). 서버가 없는 시안이라 실제 개인정보는 입력하지 마세요. 실제 운영에는 로그인과 서버 DB가 필요합니다.

최종 업데이트: 2026-11-05
