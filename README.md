# VIOLZ — 비올즈 현악기 공방

수원의 현악기 공방 **비올즈(VIOLZ)** 공식 사이트.
제작자 **전경수(JUN KYUNGSOO)** — 바이올린·비올라·첼로 제작, 그리고
**비올론첼로 다 스팔라 · 비올라 다모레 · 비올라 다 감바** 전문 제작 + 수리·복원.

- **라이브: https://violz.org** (Cloudflare Workers 커스텀 도메인 · `violz.hspatrick.workers.dev`도 유효, www는 미설정)
- 순수 정적 사이트 (빌드 없음): HTML + CSS + Vanilla JS, 모든 일러스트는 자체 제작 SVG
- 배포: GitHub `main` push → Cloudflare (Workers Builds 또는 Pages) 자동 배포
- 배포 대상 파일은 **전부 `public/` 안에** 있어야 함 (`wrangler.toml`의 `[assets] directory=./public`)

## 구조

```
public/
├─ index.html        홈 (히어로 드로잉 애니메이션 · 소개 · 악기 · 특별제작 · 수리 티저)
├─ maker.html        제작자 전경수 — 제작 철학
├─ instruments.html  제작 악기 — 바이올린 · 비올라 · 첼로 + 제작 과정
├─ special.html      특별 제작 — 다 스팔라(#spalla) · 다모레(#damore) · 다 감바(#gamba)
├─ repair.html       수리 · 복원 — 서비스 6종 + 진행 순서
├─ gallery.html      갤러리 — 사진/영상 자리 (placeholder)
├─ contact.html      문의 · 오시는 길 (JSON-LD LocalBusiness 포함)
├─ 404.html
├─ css/style.css     전체 스타일 (디자인 토큰은 :root 변수)
├─ js/main.js        헤더 스크롤 · 모바일 메뉴 · 스크롤 리빌 · 드로잉 애니메이션
└─ img/*.svg         자체 제작 라인아트 (violin/viola/cello/spalla/damore/gamba/favicon)
```

## 갤러리 관리자 (사진·글 업로드)

- 관리 페이지: **`/admin.html`** (메뉴에 노출 안 됨, robots 차단). 비밀번호 로그인 → 사진+글 게시/삭제.
- 백엔드: `src/index.js` (Worker) — `/api/*` 처리, 나머지는 정적 서빙. 데이터는 **KV**에 저장
  (게시물 목록 `posts` + 이미지 `img:<uuid>`, 사진은 업로드 전 브라우저에서 1600px로 리사이즈).
- 갤러리(`gallery.html`)는 게시물이 1건 이상이면 자동으로 "공방의 기록" 섹션을 표시하고
  자리표시 그리드를 숨긴다. 게시물이 없으면 기존 그대로.

### 활성화 (Cloudflare 대시보드, 1회)

1. **KV 생성**: Storage & Databases → KV → Create namespace → 이름 `violz-gallery` → ID 복사
2. `wrangler.toml`의 `[[kv_namespaces]]` 주석 해제 + ID 붙여넣기 → push
3. **비밀번호 설정**: Workers & Pages → violz → Settings → Variables and Secrets →
   **Add secret** → 이름 `ADMIN_PASSWORD`, 값 = 원하는 관리자 비밀번호
4. `https://<도메인>/admin.html` 접속 → 로그인 → 게시

연결 전에는 사이트가 기존과 동일하게 동작한다(갤러리 API는 빈 목록 반환).

### 로컬 테스트

```bash
npx wrangler dev -c wrangler.local.toml --port 8790
```
`wrangler.local.toml`(git 미포함)이 로컬 KV 시뮬레이터를 쓰고, 비밀번호는 `.dev.vars`의 `ADMIN_PASSWORD`.

## 실제 콘텐츠로 교체할 자리 (TODO)

1. **사진**: `.frame` 안의 `<img src="img/*.svg">` + "Photo · Coming Soon"을 실제 사진으로 교체
   - index(제작자 1, 공방 1) · maker(초상 1) · gallery(6장)
2. **연주 영상**: `gallery.html`의 video placeholder 2개 → 유튜브 iframe 교체
   ```html
   <div style="aspect-ratio:16/9"><iframe src="https://www.youtube.com/embed/VIDEO_ID" ...></iframe></div>
   ```
3. **연락처**: `contact.html`의 Phone / E-mail / SNS "준비 중" 문구 + footer 주소, JSON-LD에 telephone/email 추가
4. **OG 이미지**: 실사진 확보 후 1200×630 PNG 만들어 각 페이지 `og:image` 메타 추가
5. **도메인**: Cloudflare 커스텀 도메인 연결 후 `robots.txt`에 Sitemap 줄 추가

## 로컬 확인

빌드가 없으므로 아무 정적 서버로 `public/`을 서빙하면 된다.
(파일을 직접 열면 `file://`에서 폰트/일부 기능이 제한될 수 있음)

```bash
python -m http.server 8080 -d public
```

## 배포 (GitHub → Cloudflare)

1. GitHub repo: `ppiol8230-glitch/violz` (main 브랜치)
2. Cloudflare 대시보드 → Workers & Pages → **Connect to Git** → 이 repo 선택
   - Workers Builds: `wrangler.toml` 그대로 인식 (assets-only, 빌드 명령 없음)
   - Pages를 쓸 경우: Build command 없음, Output directory = `public`
3. 이후 `git push origin main` 만으로 자동 배포
