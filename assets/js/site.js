/* ==========================================================================
   Clear View Pressure Washing & Auto Detail — site behaviour
   --------------------------------------------------------------------------
   Vanilla, no dependencies, loaded with `defer` so it never blocks rendering.
   Everything here degrades gracefully: with JavaScript disabled the page is
   still fully readable, navigable and callable.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
     Footer year
     ---------------------------------------------------------------------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ----------------------------------------------------------------------
     Header: gains a background once the page leaves the hero
     ---------------------------------------------------------------------- */
  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-stuck', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ----------------------------------------------------------------------
     Mobile menu
     ---------------------------------------------------------------------- */
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('mobile-menu');

  if (toggle && menu) {
    var closeTimer = null;

    var openMenu = function () {
      window.clearTimeout(closeTimer);
      menu.hidden = false;
      // Let the browser paint the hidden state once before transitioning to
      // the open one. A double rAF avoids the forced synchronous layout that
      // reading offsetHeight would cause.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { menu.classList.add('is-open'); });
      });
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
      var first = menu.querySelector('a, button');
      if (first) first.focus();
    };

    var closeMenu = function (returnFocus) {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
      closeTimer = window.setTimeout(function () { menu.hidden = true; },
        reduceMotion ? 0 : 420);
      if (returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') closeMenu(true);
      else openMenu();
    });

    // close on link click (all links are same-page anchors)
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;

      if (e.key === 'Escape') { closeMenu(true); return; }

      // keep Tab inside the open menu
      if (e.key === 'Tab') {
        var items = menu.querySelectorAll('a, button');
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // if the viewport grows past the desktop breakpoint, drop the overlay
    window.matchMedia('(min-width: 62rem)').addEventListener('change', function (ev) {
      if (ev.matches && !menu.hidden) closeMenu(false);
    });
  }

  /* ----------------------------------------------------------------------
     Hero video
     The <video> carries `autoplay`, so this is only a safety net for
     browsers that decline to start it with preload="none". Under
     prefers-reduced-motion the element is display:none and we never touch it.
     ---------------------------------------------------------------------- */
  // Phones get the static washed-in frame instead of the reveal, so the clip
  // is never fetched there - see the matching media query in styles.css.
  var heroIsStill = window.matchMedia('(max-width: 47.99rem)').matches;

  var hero = document.querySelector('.hero__video');
  if (hero && !reduceMotion && !heroIsStill) {
    // Only reveal the video once it can actually play, so the hero never
    // flashes an empty box over the poster.
    var reveal = function () { hero.classList.add('is-ready'); };
    if (hero.readyState >= 3) reveal();
    else hero.addEventListener('canplay', reveal, { once: true });

    // Start loading only after the page has settled, so the loop never
    // competes with the poster for bandwidth during first paint.
    window.addEventListener('load', function () {
      hero.load();
      var p = hero.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* poster stays */ });
    });

    // Pause/play control. WCAG 2.2.2 requires a way to stop motion that
    // auto-starts and runs longer than five seconds; this loop repeats
    // indefinitely, so prefers-reduced-motion alone is not sufficient.
    var motionBtn = document.getElementById('hero-motion');
    if (motionBtn) {
      motionBtn.hidden = false;
      var heroSection = document.querySelector('.hero');
      motionBtn.addEventListener('click', function () {
        // once the reveal has finished the video sits at its end; replay it
        if (hero.ended) hero.currentTime = 0;
        var paused = hero.paused;
        if (paused) hero.play();
        else hero.pause();
        // the CSS push-in is separate from playback, so stop it too
        heroSection.classList.toggle('is-paused', !paused);
        motionBtn.setAttribute('aria-pressed', paused ? 'false' : 'true');
        motionBtn.setAttribute('aria-label',
          paused ? 'Pause the background video' : 'Play the background video');
      });
    }
  }

  /* ----------------------------------------------------------------------
     Before / after slider
     Keyboard (arrow keys) drives the native range input directly, which
     still works fine. A native <input type="range"> only starts a drag when
     the touch begins exactly on its rendered thumb, not anywhere on the
     track - so on a photo this size, most taps/drags on mobile did nothing.

     A first attempt drove this with Pointer Events + setPointerCapture, but
     that API has real cross-browser gaps (particularly capturing on an
     ancestor rather than the original touch target), and it did not fix the
     problem on a real phone. This uses plain touchstart/touchmove/touchend
     (the approach every production before/after-slider library actually
     uses), with the range input made fully inert to touch/mouse so nothing
     can compete with it for the gesture.
     ---------------------------------------------------------------------- */
  var ba = document.getElementById('ba');
  var baRange = document.getElementById('ba-range');
  if (ba && baRange) {
    var sync = function () { ba.style.setProperty('--pos', baRange.value + '%'); };
    baRange.addEventListener('input', sync);
    sync();

    var dragging = false;
    var setFromClientX = function (clientX) {
      var rect = ba.getBoundingClientRect();
      var pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      baRange.value = String(pct);
      sync();
    };

    // Touch: bound on document for move/end so the drag keeps tracking even
    // if the finger slides outside the box, and preventDefault stops both
    // page scroll and any native slider gesture from ever engaging.
    ba.addEventListener('touchstart', function (e) {
      dragging = true;
      setFromClientX(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      setFromClientX(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', function () { dragging = false; });
    document.addEventListener('touchcancel', function () { dragging = false; });

    // Mouse: same drag-anywhere behaviour, for consistency with touch.
    ba.addEventListener('mousedown', function (e) {
      dragging = true;
      setFromClientX(e.clientX);
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      setFromClientX(e.clientX);
    });
    document.addEventListener('mouseup', function () { dragging = false; });
  }

  /* ----------------------------------------------------------------------
     Scroll reveal — transform + opacity only, so it never triggers layout
     ---------------------------------------------------------------------- */
  var revealables = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------------------------
     Quote form
     Validation is honest: it checks the fields, moves focus to the first
     problem, and describes the error in text next to the field (never with
     colour alone). Submission posts to data-endpoint if one is configured.
     ---------------------------------------------------------------------- */
  var form = document.getElementById('quote-form');
  if (form) {
    var status = document.getElementById('form-status');

    var setError = function (field, hasError) {
      field.closest('.field').classList.toggle('is-invalid', hasError);
      field.setAttribute('aria-invalid', hasError ? 'true' : 'false');
    };

    var validateField = function (field) {
      var value = field.value.trim();
      var ok = value.length > 0;

      if (ok && field.type === 'tel') {
        // count digits rather than pattern-matching: people write numbers in
        // all sorts of ways and a US number has 10 (or 11 with the leading 1)
        var digits = value.replace(/\D/g, '');
        ok = digits.length >= 10 && digits.length <= 11;
      }
      setError(field, !ok);
      return ok;
    };

    var required = form.querySelectorAll('[required]');

    // re-validate a field once it has been corrected
    required.forEach(function (field) {
      field.addEventListener('blur', function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.closest('.field').classList.contains('is-invalid')) validateField(field);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      status.removeAttribute('data-state');

      var firstBad = null;
      required.forEach(function (field) {
        if (!validateField(field) && !firstBad) firstBad = field;
      });

      if (firstBad) {
        firstBad.focus();
        status.setAttribute('data-state', 'error');
        status.textContent = 'Please check the highlighted fields above.';
        return;
      }

      // honeypot — silently accept and discard
      if (form.querySelector('[name="company"]').value !== '') return;

      var endpoint = form.getAttribute('data-endpoint');

      if (!endpoint) {
        // No endpoint wired up yet. Never pretend the message was sent.
        status.setAttribute('data-state', 'error');
        status.textContent =
          'This form is not connected yet. Please call (904) 312-1236 and we will get straight to it.';
        return;
      }

      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = 'Sending…';

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed');
          form.reset();
          status.setAttribute('data-state', 'ok');
          status.textContent =
            'Thank you. We have your details and will call you back shortly.';
        })
        .catch(function () {
          status.setAttribute('data-state', 'error');
          status.textContent =
            'Sorry, that did not go through. Please call (904) 312-1236 instead.';
        })
        .finally(function () { button.disabled = false; });
    });
  }
})();
