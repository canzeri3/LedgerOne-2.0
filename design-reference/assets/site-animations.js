/* =============================================================
   LedgerOne · Motion controller
   -------------------------------------------------------------
   Scans the rendered React tree once, tags off-screen elements
   with `.l1-reveal`, and uses an IntersectionObserver to add
   `.is-in` as they scroll into view. Above-the-fold elements
   are left alone (their entrance is the hero animation).
   No external libraries.
   ============================================================= */
(function () {
  if (typeof window === 'undefined') return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // Selectors to reveal as they scroll into view.
  var REVEAL_SELECTORS = [
    '.l1-section-head',
    '.l1-feat',
    '.l1-flow-step',
    '.l1-case',
    '.l1-trust-cell',
    '.l1-trust',
    '.l1-agent-block',
    '.l1-terminal',
    '.l1-strip',
    '.l1-closing-cta',
    '.l1-spec',
    '.l1-cases-card',
    '.l1-footer-grid',
    '.l1-pricing-card',
    '.l1-faq-item'
  ].join(',');

  // Grouped selectors: items inside these parents get a staggered delay.
  var STAGGER_GROUPS = [
    '.l1-feat-grid',
    '.l1-flow',
    '.l1-cases',
    '.l1-trust-grid',
    '.l1-specs',
    '.l1-cases-grid',
    '.l1-pricing-grid'
  ];

  function tagAndObserve() {
    var root = document.getElementById('root');
    if (!root) return;
    var els = root.querySelectorAll(REVEAL_SELECTORS);
    if (!els.length) return;

    var vh = window.innerHeight || document.documentElement.clientHeight;
    var threshold = vh * 0.88; // anything below this gets the reveal treatment
    var toObserve = [];

    els.forEach(function (el) {
      // Skip if already tagged (idempotent).
      if (el.classList.contains('l1-reveal')) return;
      var rect = el.getBoundingClientRect();
      // Only animate elements that are below the initial fold so
      // above-the-fold content never flickers.
      if (rect.top >= threshold) {
        el.classList.add('l1-reveal');
        toObserve.push(el);
      }
    });

    // Apply per-group stagger so cards cascade rather than land in unison.
    STAGGER_GROUPS.forEach(function (groupSel) {
      root.querySelectorAll(groupSel).forEach(function (grid) {
        var items = grid.querySelectorAll('.l1-reveal');
        items.forEach(function (item, i) {
          // 70ms stagger, capped so long lists don't drag.
          item.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
        });
      });
    });

    if (!('IntersectionObserver' in window)) {
      // No observer available — reveal everything immediately.
      toObserve.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });

    toObserve.forEach(function (el) { obs.observe(el); });
  }

  /* -----------------------------------------------------------------
     Count-up animation for big numbers.
     Each target's text is parsed into prefix + number + suffix; the
     number ticks from 0 to its target with easeOutCubic when the
     element scrolls into view, formatted with the original decimals,
     thousands separators, and sign.
     ----------------------------------------------------------------- */
  var COUNTUP_SELECTORS = [
    '.l1-featured .stat .v',
    '.lp-kpi .val',
    '.l1-case-stat .v'
  ].join(',');

  function animateCountUp(el) {
    var raw = (el.textContent || '').trim();
    // Find first numeric token (allowing leading − or - sign).
    var match = raw.match(/[−-]?\d[\d,]*(?:\.\d+)?/);
    if (!match) return; // non-numeric value (e.g. "Zero", "SOC 2") — leave it.
    var rawNum = match[0];
    var idx = raw.indexOf(rawNum);
    var prefix = raw.slice(0, idx);
    var suffix = raw.slice(idx + rawNum.length);
    // Skip if the prefix is dominated by letters ("SOC 2", "Type II", etc.) —
    // we only count up when the number is the headline content.
    if (/[A-Za-z]/.test(prefix)) return;
    var origSignChar = (rawNum.charAt(0) === '−' || rawNum.charAt(0) === '-')
      ? rawNum.charAt(0) : '';
    var cleaned = rawNum.replace(/,/g, '').replace(/−/g, '-');
    var target = parseFloat(cleaned);
    if (!isFinite(target)) return;
    if (target === 0) return; // nothing to count to.

    var dotIdx = cleaned.indexOf('.');
    var decimals = dotIdx >= 0 ? cleaned.length - dotIdx - 1 : 0;
    var hasCommas = rawNum.indexOf(',') >= 0;
    var negative = target < 0;
    var absTarget = Math.abs(target);

    function format(v) {
      var s = v.toFixed(decimals);
      if (hasCommas) {
        var parts = s.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        s = parts.join('.');
      }
      return prefix + (negative ? (origSignChar || '−') : '') + s + suffix;
    }

    // Lock width so tabular numbers don't reflow the card during the tick.
    var w = el.getBoundingClientRect().width;
    if (w) {
      el.style.minWidth = w + 'px';
      el.style.display = el.style.display || 'inline-block';
    }

    var duration = 1300;
    var startTs = null;
    function tick(ts) {
      if (startTs === null) startTs = ts;
      var t = Math.min(1, (ts - startTs) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(absTarget * eased);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = format(absTarget);
      }
    }

    el.textContent = format(0);
    requestAnimationFrame(tick);
  }

  function setupCountUps() {
    var root = document.getElementById('root');
    if (!root) return;
    var els = root.querySelectorAll(COUNTUP_SELECTORS);
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach(animateCountUp);
      return;
    }

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCountUp(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    els.forEach(function (el) { obs.observe(el); });
  }

  // Wait until React has mounted the tree before scanning.
  function waitForRender(attempt) {
    attempt = attempt || 0;
    var root = document.getElementById('root');
    if (root && root.firstElementChild) {
      // Give layout one tick to settle so getBoundingClientRect is accurate.
      requestAnimationFrame(function () {
        tagAndObserve();
        setupCountUps();
        setupSmoothSnap();
      });
      return;
    }
    if (attempt > 240) return; // ~4s ceiling
    requestAnimationFrame(function () { waitForRender(attempt + 1); });
  }

  /* -----------------------------------------------------------------
     Smooth snap controller — slow, eased section-to-section scroll.
     Active on pages tagged `body.l1-snap`. Every wheel/PageUp/PageDown
     gesture locks onto the next section with an easeInOutCubic curve.
     Touch drags fall through to native scrolling.
     ----------------------------------------------------------------- */
  function setupSmoothSnap() {
    if (!document.body.classList.contains('l1-snap')) return;
    if (window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var html = document.documentElement;
    html.classList.add('l1-snap-js');

    var navOffset = 72;

    // Only these labels are snap targets.
    var SNAP_LABELS = [
      '01 Hero',
      '03 Features',
      '04 How it works',
      '05 AI agent',
      '06 Use cases',
      '07 Trust',
      'Closing CTA'
    ];

    function getStops() {
      var stops = [];
      SNAP_LABELS.forEach(function (label) {
        var el = document.querySelector('[data-screen-label="' + label + '"]');
        if (!el) return;
        var top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - navOffset);
        stops.push(top);
      });
      stops.sort(function (a, b) { return a - b; });
      return stops;
    }

    var stops = getStops();
    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { stops = getStops(); }, 80);
    }, { passive: true });

    // Find the snap target ahead of (below) `y`, if any.
    function nextStopBelow(y) {
      for (var i = 0; i < stops.length; i++) {
        if (stops[i] > y + 2) return stops[i];
      }
      return null;
    }
    // Find the snap target at-or-just-above `y`.
    function lastStopAtOrAbove(y) {
      var match = null;
      for (var i = 0; i < stops.length; i++) {
        if (stops[i] <= y + 2) match = stops[i];
      }
      return match;
    }

    var animating = false;
    var animStart = 0, animFrom = 0, animTo = 0, animDur = 0, rafId = 0;

    // easeOutCubic — starts fast (matches the user's incoming velocity)
    // and decelerates into the target. Feels like the scroll naturally
    // glides to a stop on the section line.
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function step(ts) {
      if (!animating) return;
      var t = Math.min(1, (ts - animStart) / animDur);
      var y = animFrom + (animTo - animFrom) * easeOutCubic(t);
      window.scrollTo(0, y);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        animating = false;
      }
    }

    function scrollToY(target, durationOverride) {
      var current = window.scrollY;
      var dist = Math.abs(target - current);
      if (dist < 2) return;
      animFrom = current;
      animTo = target;
      animDur = durationOverride || Math.max(550, Math.min(1100, 400 + dist * 0.55));
      animStart = performance.now();
      animating = true;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(step);
    }

    function cancelAnim() {
      if (animating) {
        animating = false;
        cancelAnimationFrame(rafId);
      }
    }

    /* -------- Velocity-aware engagement --------
       We never preventDefault on wheel. Let the user scroll natively
       at their own speed. Watch for the scroll to settle (no wheel
       events for ~120ms) — and ONLY then, if they're inside the
       engagement zone around a snap target, ease them onto it,
       starting from the current position with easeOutCubic so it
       feels like a continuation of their gesture, not a sudden grab.
    */
    var ENGAGE_RANGE = 360;     // px below a target where snap engages
    var OVERSHOOT_RANGE = 420;  // px past a target where snap pulls back
    var IDLE_MS = 130;          // wheel-idle threshold to consider settled
    var idleT = null;
    var lastWheelTs = 0;
    var lastScrollY = window.scrollY;
    var lastScrollTs = performance.now();
    var velocity = 0;           // px per ms, signed (positive = downward)
    var lastDir = 0;

    function trySnap() {
      if (animating) return;
      // Only snap-lock for downward gestures.
      if (lastDir < 0) return;

      if (!stops.length) stops = getStops();
      var y = window.scrollY;
      var nextTop = nextStopBelow(y);
      var aboveTop = lastStopAtOrAbove(y);
      var lastStop = stops.length ? stops[stops.length - 1] : null;

      // If we're slightly past a section's start (overshoot zone), gently
      // pull back. If we're approaching the next section's start (engage
      // zone), lock onto it. Otherwise leave the user alone.
      //
      // BUT — once the user has scrolled past the final snap target
      // (Closing CTA), leave them alone. No pullback. That way they can
      // continue down to the footer without being yanked back up.
      var target = null;
      if (nextTop !== null && (nextTop - y) <= ENGAGE_RANGE) {
        target = nextTop;
      } else if (aboveTop !== null && (y - aboveTop) <= OVERSHOOT_RANGE
                 && aboveTop !== 0
                 && aboveTop !== lastStop) {
        target = aboveTop;
      }
      if (target === null) return;

      // Duration scales with both distance and incoming velocity so
      // fast scrolls glide quickly to the lock and slow scrolls feel
      // weighted. |velocity| is px/ms.
      var dist = Math.abs(target - y);
      var v = Math.abs(velocity);
      // Higher velocity → shorter duration (snappier finish).
      var dur = dist / Math.max(0.6, v * 1.2 + 0.4);
      dur = Math.max(420, Math.min(1100, dur));
      scrollToY(target, dur);
    }

    function scheduleSettle() {
      if (idleT) clearTimeout(idleT);
      idleT = setTimeout(function () {
        idleT = null;
        trySnap();
      }, IDLE_MS);
    }

    // Wheel: just track direction & schedule settle. NEVER preventDefault.
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 3) return;
      lastWheelTs = performance.now();
      lastDir = e.deltaY > 0 ? 1 : -1;
      // If user starts scrolling while an animation is running, hand control back.
      if (animating) cancelAnim();
      scheduleSettle();
    }, { passive: true });

    // Track velocity from actual scroll position so we have an accurate
    // measure even when CSS / inertial scroll keeps moving the page.
    window.addEventListener('scroll', function () {
      var now = performance.now();
      var dy = window.scrollY - lastScrollY;
      var dt = now - lastScrollTs;
      if (dt > 0) {
        // Exponential smoothing so single jumpy frames don't dominate.
        var instant = dy / dt; // px/ms, signed
        velocity = velocity * 0.5 + instant * 0.5;
      }
      lastScrollY = window.scrollY;
      lastScrollTs = now;
      // Schedule settle on any scroll change, not only wheel — so
      // trackpad inertia tails are honoured too. Only treat it as
      // "wheel-like" if we've actually seen a wheel event recently.
      if (now - lastWheelTs < 800) scheduleSettle();
    }, { passive: true });

    function onTouchStart() { cancelAnim(); }

    function onKey(e) {
      if (!stops.length) stops = getStops();
      var target = nextStopBelow(window.scrollY);
      if (e.key === 'PageDown' || (e.key === 'ArrowDown' && (e.shiftKey || e.altKey)) ||
          (e.key === ' ' && !e.shiftKey)) {
        if (target !== null) { e.preventDefault(); scrollToY(target, 800); }
      } else if (e.key === 'End') {
        e.preventDefault();
        scrollToY(stops[stops.length - 1], 1000);
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', function (e) {
      if (e.button !== 0) cancelAnim();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { waitForRender(0); });
  } else {
    waitForRender(0);
  }
})();

/* =============================================================
   Hero laptop · open-on-scroll
   Independent of the reveal controller above so it has its own
   reduced-motion gate: when motion is reduced (or this never runs)
   the laptop stays OPEN by default — it is never left shut.
   ============================================================= */
(function () {
  if (typeof window === 'undefined') return;
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  function arm(laptop) {
    // Snap to the closed state without any transition...
    laptop.classList.add('no-anim', 'is-armed');
    // ...force a reflow so the closed transform is committed...
    void laptop.offsetWidth;
    // ...then re-enable transitions for the swing.
    laptop.classList.remove('no-anim');

    function open() {
      // Brief beat in the closed pose, then the lid swings up.
      setTimeout(function () { laptop.classList.add('is-open'); }, 220);
    }

    if (!('IntersectionObserver' in window)) { open(); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          open();
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35 });
    obs.observe(laptop);
  }

  function findLaptop(attempts) {
    var laptop = document.querySelector('.l1-laptop');
    if (laptop) { arm(laptop); return; }
    if (attempts > 60) return; // ~6s of React-render polling, then give up
    setTimeout(function () { findLaptop(attempts + 1); }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { findLaptop(0); });
  } else {
    findLaptop(0);
  }
})();
