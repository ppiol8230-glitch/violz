/* VIOLZ — main.js : header state, mobile menu, scroll reveal */
(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");

  /* header: transparent → solid on scroll */
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 24) header.classList.add("solid");
    else header.classList.remove("solid");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* mobile menu */
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".main-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* reveal on scroll */
  var els = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && els.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  /* hero stroke-draw: set pathLength & stagger */
  document.querySelectorAll(".draw").forEach(function (svg) {
    var shapes = svg.querySelectorAll("path, line, circle, ellipse");
    shapes.forEach(function (p, i) {
      p.setAttribute("pathLength", "1");
      p.style.animationDelay = (0.08 * i) + "s";
    });
  });

  /* language switcher: remember the visitor's own choice for a year */
  document.querySelectorAll("[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      document.cookie = "violz_lang=" + a.getAttribute("data-lang") +
        "; path=/; max-age=31536000; samesite=lax";
    });
  });

  /* atelier music: autoplay where allowed, otherwise begin on the first gesture */
  var music = document.createElement("audio");
  var musicToggle = document.createElement("button");
  var musicMutedKey = "violz_music_muted";
  var musicTimeKey = "violz_music_time";
  var language = (document.documentElement.lang || "ko").toLowerCase();
  var musicLabels = language.indexOf("en") === 0
    ? { on: "Turn music off", off: "Play music" }
    : language.indexOf("zh") === 0
      ? { on: "关闭音乐", off: "播放音乐" }
      : { on: "음악 끄기", off: "음악 켜기" };

  function readMusicSetting(key) {
    try { return window.sessionStorage.getItem(key); }
    catch (error) { return null; }
  }

  function saveMusicSetting(key, value) {
    try { window.sessionStorage.setItem(key, value); }
    catch (error) { /* storage may be unavailable in private browsing */ }
  }

  function renderMusicToggle() {
    var isPlaying = !music.paused;
    var label = isPlaying ? musicLabels.on : musicLabels.off;
    musicToggle.classList.toggle("is-playing", isPlaying);
    musicToggle.setAttribute("aria-pressed", isPlaying ? "true" : "false");
    musicToggle.setAttribute("aria-label", label);
    musicToggle.setAttribute("title", label);
    musicToggle.innerHTML = '<span class="music-toggle-icon" aria-hidden="true">' +
      (isPlaying ? "♪" : "♩") + '</span><span class="music-toggle-label">' + label + "</span>";
  }

  music.src = "/audio/welcome-guide.mp3";
  music.preload = "auto";
  music.loop = true;
  music.autoplay = true;
  music.playsInline = true;
  music.volume = 0.1;
  music.hidden = true;
  music.setAttribute("aria-hidden", "true");

  musicToggle.type = "button";
  musicToggle.className = "music-toggle";
  document.body.appendChild(music);
  document.body.appendChild(musicToggle);
  renderMusicToggle();

  var savedMusicTime = Number(readMusicSetting(musicTimeKey));
  music.addEventListener("loadedmetadata", function () {
    if (Number.isFinite(savedMusicTime) && savedMusicTime > 0 && music.duration) {
      music.currentTime = savedMusicTime % music.duration;
    }
  }, { once: true });

  function disarmMusicGesture() {
    document.removeEventListener("pointerdown", unlockMusic, true);
    document.removeEventListener("touchstart", unlockMusic, true);
    document.removeEventListener("keydown", unlockMusic, true);
  }

  function startMusic() {
    music.volume = 0.1;
    var result = music.play();
    if (result && typeof result.then === "function") {
      return result.then(function () {
        disarmMusicGesture();
        renderMusicToggle();
        return true;
      }).catch(function () {
        renderMusicToggle();
        return false;
      });
    }
    renderMusicToggle();
    return Promise.resolve(!music.paused);
  }

  function unlockMusic(event) {
    if (event.target && event.target.closest && event.target.closest(".music-toggle")) return;
    if (readMusicSetting(musicMutedKey) === "1") {
      disarmMusicGesture();
      return;
    }
    startMusic();
  }

  function armMusicGesture() {
    document.addEventListener("pointerdown", unlockMusic, true);
    document.addEventListener("touchstart", unlockMusic, true);
    document.addEventListener("keydown", unlockMusic, true);
  }

  music.addEventListener("play", renderMusicToggle);
  music.addEventListener("pause", renderMusicToggle);
  musicToggle.addEventListener("click", function () {
    if (music.paused) {
      saveMusicSetting(musicMutedKey, "0");
      startMusic();
    } else {
      music.pause();
      saveMusicSetting(musicMutedKey, "1");
    }
  });

  window.addEventListener("pagehide", function () {
    if (Number.isFinite(music.currentTime)) {
      saveMusicSetting(musicTimeKey, String(music.currentTime));
    }
  });

  if (readMusicSetting(musicMutedKey) !== "1") {
    startMusic().then(function (started) {
      if (!started) armMusicGesture();
    });
  }

  /* footer year */
  document.querySelectorAll(".js-year").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* contact form: send through the Worker and keep the visitor's address as Reply-To */
  document.querySelectorAll("[data-contact-form]").forEach(function (form) {
    var submit = form.querySelector("[type=submit]");
    var status = form.querySelector(".form-status");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      status.className = "form-status";
      status.textContent = form.dataset.sending;
      submit.disabled = true;

      var data = Object.fromEntries(new FormData(form).entries());
      data.language = form.dataset.lang || "ko";

      try {
        var response = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.ok) throw new Error(result.error || "send_failed");
        form.reset();
        status.className = "form-status success";
        status.textContent = form.dataset.success;
      } catch (error) {
        status.className = "form-status error";
        status.textContent = error.message === "rate_limited"
          ? form.dataset.rateLimit
          : form.dataset.error;
      } finally {
        submit.disabled = false;
      }
    });
  });
})();
