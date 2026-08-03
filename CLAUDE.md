# CLAUDE.md — 앱6 — 비올즈 VIOLZ 현악기 공방

> 이 repo 전용 상세 문서. 공통 규약·다른 앱 맥락·이 PC 로컬 검증 함정은 상위 `AI/CLAUDE.md` 에 있다.
> 지난 작업 이력은 `AI/docs/history/` 월별 파일 참고.
> Codex(GPT)도 이 파일을 읽는다 — `~/.codex/config.toml` 의 project_doc_fallback_filenames 설정.

### violz (앱6) — 비올즈 VIOLZ 현악기 공방
- **라이브: https://violz.org** (+ `violz.hspatrick.workers.dev`). ⚠️ **www 서브도메인 미등록**(대시보드에서 추가 권장). repo `ppiol8230-glitch/violz`.
- **누구/무엇**: 유저의 **아버지 전경수(Jun Kyungsoo)** 제작자, 경기도 수원 공방. **바로크 고악기 전문**이 정체성 —
  비올론첼로 다 스팔라 · 비올라 다모레 · 비올족(다 감바). 바이올린·비올라·첼로도 만들지만 경쟁이 많아 사이트에서는 후순위.
- **파일 구조**
  ```
  public/            ko 7페이지: index/maker/special/instruments/repair/gallery/contact (+404, admin)
  public/en/         en 7페이지     public/zh/   zh 7페이지 (Noto Sans/Serif SC 폰트)
  public/css/style.css  public/js/main.js  public/img/*.svg + maker.jpg
  src/index.js       Worker — 언어 라우팅 + 갤러리 API(/api/*)
  ```
  ⚠️ 언어판이 하위 폴더라 **모든 자산·내부 링크는 절대경로**(`/css/style.css`, `/maker`)여야 한다.
- **페이지 성격**: special=고악기 3종 상세(각 악기 아래 유튜브 소리 감상 임베드 — **제작자 악기가 아니므로 "비올즈 악기로 연주" 같은 표현 절대 금지**, 캡션은 "소리 감상 — OO의 울림"),
  instruments=바이올린족, maker=제작자(사진 `img/maker.jpg`), repair=**평생 관리**(직접 제작 악기 한정 정책을 강점으로 서술), gallery=사진/영상+관리자 게시물, contact=주소·전화·이메일·지도.
- **연락처(공개)**: 경기도 수원시 정조로 579, 2층 202호 / 010-4332-2665 / fiddle@kakao.com / Instagram `@viols_strings`.
- **카피 확정(2026-07-29)**: 영문명은 **서양식 어순 `Kyungsoo Jun`**(JSON-LD 포함, en/contact의 alternateName만 Jun Kyungsoo). 신앙 카피 있음(홈·maker Soli Deo Gloria·special 수난곡 연결) — ⚠️ **'교회에서 연주했다'는 이력 표현 금지**(사실 아님, '종교음악에 마음을 두어 온'까지만). maker 본문·히어로 소개문은 유저 확정 문안('십수 년째/십수 해 동안'). 타이포: 제목 700·keep-all·manifesto는 justify·모바일 내비 전환 920px.
- **카피 원칙**: 조용한 자기소개 톤. **CTA 버튼 남발·통계 타일·지어낸 인용구 금지**(전부 제거함). 없는 것(수상·학력)을 언급하는 방어적 문구 금지.
  제작 대수·사사/독학 이력 비공개. 가격은 "문의". 방문은 "언제나 환영, 오시기 전에 연락 한 번만" 톤.
- **다국어**: `pickLang()` = 쿠키 `violz_lang` > 국가(KR·미확인→ko / CN·HK·MO·TW·SG→zh / 그 외→en). ko는 리다이렉트 없음, 나머지 302.
  **크롤러(`CRAWLER` 정규식)는 분기 제외** — Googlebot이 미국에서 크롤링해 영문판만 색인되는 것을 막기 위함. 언어판 관계는 hreflang 4종으로 알림.
- **갤러리 관리자**: `/admin` → `ADMIN_PASSWORD`(대시보드 Secret) 로그인 → 사진·글 게시/삭제. KV `GALLERY_KV`(id `332581da...`)에 `posts` + `img:<uuid>`.
  API: `POST /api/login` · `GET /api/posts` · `POST /api/posts` · `DELETE /api/posts/<id>` · `GET /api/img/<key>` · `GET /api/geo`.
- **⚠️⚠️ 반드시 기억할 함정 — `run_worker_first`**: `wrangler.toml`의 `[assets]`에 이 배열이 있으면 **목록에 없는 경로는 Worker가 아예 실행되지 않는다**(정적 자산 계층이 먼저 응답).
  이 세션에서 두 번 당함: ①페이지 경로를 안 넣어 국가 분기가 무동작 ②`/api/*`를 안 넣어 **갤러리 API 전체가 404**(로그인·게시·이미지 전부 죽음).
  **새 경로/새 API를 추가하면 이 목록도 반드시 함께 갱신할 것.**
- **로컬 검증**: `npx wrangler dev -c wrangler.local.toml --port 87xx` (git 미포함 `wrangler.local.toml` + `.dev.vars`의 `ADMIN_PASSWORD`, 로컬 KV 시뮬레이터).
  국가 테스트는 `curl -H "cf-ipcountry: US"`로 (**프로덕션에서는 Cloudflare가 이 헤더를 덮어써서 위조 불가** — 라이브 검증은 쿠키로 리다이렉트 기구만 확인).
- **SEO**: canonical·og:url·hreflang 4종(전 페이지), sitemap 21 URL, robots에 `/admin` 차단. 크롤러가 읽는 본문 2,958자(3개 앱 중 유일하게 정상).

