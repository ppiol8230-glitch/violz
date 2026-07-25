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

  /* footer year */
  document.querySelectorAll(".js-year").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
