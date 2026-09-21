(function () {
  "use strict";

  var script = document.currentScript;
  var lang = (script && script.dataset.lang) || "ko";
  var base = (script && script.dataset.base) || "/gallery";
  var copies = {
    ko: {
      untitled: "무제",
      collection: "Instrument Archive",
      view: "작품 보기",
      back: "갤러리 목록으로",
      notes: "Instrument Notes · 악기 기록",
      missing: "요청하신 작품을 찾을 수 없습니다.",
      error: "갤러리를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      photo: "사진"
    },
    en: {
      untitled: "Untitled",
      collection: "Instrument Archive",
      view: "View instrument",
      back: "Back to gallery",
      notes: "Instrument Notes",
      missing: "This instrument could not be found.",
      error: "The gallery could not be loaded. Please try again shortly.",
      photo: "Photograph"
    },
    zh: {
      untitled: "无题",
      collection: "Instrument Archive",
      view: "查看作品",
      back: "返回作品列表",
      notes: "Instrument Notes · 乐器记录",
      missing: "找不到所请求的作品。",
      error: "无法加载作品，请稍后再试。",
      photo: "照片"
    }
  };
  var copy = copies[lang] || copies.ko;

  var notes = document.getElementById("notes");
  var section = document.getElementById("notes-sec");
  var sectionHead = document.getElementById("notes-head");
  var placeholder = document.getElementById("ph-photos");
  var selectedId = new URLSearchParams(window.location.search).get("post");

  if (selectedId) document.body.classList.add("gallery-detail-view");

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function imageUrl(key) {
    return "/api/img/" + encodeURIComponent(key);
  }

  function detailUrl(id) {
    return base + "?post=" + encodeURIComponent(id);
  }

  function bodyHtml(body) {
    return esc(body).split(/\n{2,}/).map(function (paragraph) {
      return "<p>" + paragraph.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  function preserveDetailAcrossLanguages(id) {
    document.querySelectorAll(".lang-sw a").forEach(function (link) {
      var url = new URL(link.href, window.location.origin);
      url.searchParams.set("post", id);
      link.href = url.pathname + url.search;
    });
  }

  function renderIndex(posts) {
    notes.className = "gallery-index";
    notes.innerHTML = posts.map(function (post, index) {
      var title = post.title || copy.untitled;
      var cover = (post.images || [])[0];
      var visual = cover
        ? '<img src="' + imageUrl(cover) + '" alt="' + esc(title) + '" loading="lazy" decoding="async">'
        : '<span class="gallery-card-empty" aria-hidden="true">VIOLZ</span>';

      return '<a class="gallery-card" href="' + detailUrl(post.id) + '">' +
        '<span class="gallery-card-cover">' + visual + "</span>" +
        '<span class="gallery-card-copy">' +
          '<span class="gallery-card-kicker">' + esc(copy.collection) + " · " + String(index + 1).padStart(2, "0") + "</span>" +
          '<span class="gallery-card-title">' + esc(title) + "</span>" +
          '<span class="gallery-card-view">' + esc(copy.view) + '<i aria-hidden="true">→</i></span>' +
        "</span>" +
      "</a>";
    }).join("");
  }

  function renderDetail(post) {
    var title = post.title || copy.untitled;
    var images = (post.images || []).map(function (key, index) {
      return '<figure class="gallery-detail-photo">' +
        '<a href="' + imageUrl(key) + '" target="_blank" rel="noopener">' +
          '<img src="' + imageUrl(key) + '" alt="' + esc(title) + " — " + esc(copy.photo) + " " + (index + 1) + '" ' +
            (index ? 'loading="lazy" ' : 'fetchpriority="high" ') + 'decoding="async">' +
        "</a>" +
      "</figure>";
    }).join("");
    document.body.classList.add("gallery-detail-view");
    sectionHead.hidden = true;
    preserveDetailAcrossLanguages(post.id);
    document.title = title + " | VIOLZ";
    notes.className = "gallery-detail";
    notes.innerHTML =
      '<a class="gallery-back" href="' + base + '"><i aria-hidden="true">←</i>' + esc(copy.back) + "</a>" +
      "<article>" +
        '<header class="gallery-detail-head">' +
          '<p class="overline">' + esc(copy.collection) + "</p>" +
          "<h2>" + esc(title) + "</h2>" +
        "</header>" +
        (images ? '<div class="gallery-detail-images">' + images + "</div>" : "") +
        (post.body ? '<div class="gallery-detail-copy"><p class="overline">' + esc(copy.notes) + "</p>" + bodyHtml(post.body) + "</div>" : "") +
      "</article>" +
      '<a class="gallery-back gallery-back-bottom" href="' + base + '"><i aria-hidden="true">←</i>' + esc(copy.back) + "</a>";
  }

  function renderMessage(message) {
    document.body.classList.add("gallery-detail-view");
    sectionHead.hidden = true;
    notes.className = "gallery-message";
    notes.innerHTML = "<p>" + esc(message) + '</p><a class="gallery-back" href="' + base + '"><i aria-hidden="true">←</i>' + esc(copy.back) + "</a>";
  }

  fetch("/api/posts")
    .then(function (response) {
      if (!response.ok) throw new Error("gallery request failed");
      return response.json();
    })
    .then(function (data) {
      var posts = Array.isArray(data.posts) ? data.posts : [];
      if (!posts.length && !selectedId) return;

      placeholder.hidden = true;
      section.hidden = false;

      if (!selectedId) {
        renderIndex(posts);
        return;
      }

      var selected = posts.find(function (post) { return post.id === selectedId; });
      if (!selected) {
        renderMessage(copy.missing);
        return;
      }
      renderDetail(selected);
    })
    .catch(function () {
      if (!selectedId) return;
      placeholder.hidden = true;
      section.hidden = false;
      renderMessage(copy.error);
    });
})();
