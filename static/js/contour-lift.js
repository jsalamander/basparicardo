(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !window.gsap) {
    return;
  }

  const surfaces = document.querySelectorAll("[data-contour-surface]");
  if (surfaces.length === 0) {
    return;
  }

  function bindSurface(surface) {
    const svg = surface.querySelector("[data-contours-svg]");
    if (!svg) {
      return;
    }

    const paths = Array.from(svg.querySelectorAll("path"));
    if (paths.length === 0) {
      return;
    }

    const coarsePointer =
      window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const maxLift = coarsePointer ? 5 : 7;
    const radiusScale = coarsePointer ? 0.65 : 0.5;
    const baseOpacity = 0.36;
    const peakOpacity = 0.9;
    const maxSamplesPerPath = coarsePointer ? 34 : 42;
    const transformDuration = coarsePointer ? 0.4 : 0.55;
    const opacityDuration = coarsePointer ? 0.45 : 0.6;
    const mouseSmoothing = 0.18;
    const touchScrollCooldownMs = 320;

    let needsRecalc = true;
    let sampledPoints = [];

    const setters = paths.map((path) => ({
      y: window.gsap.quickTo(path, "y", { duration: transformDuration, ease: "power2.out" }),
      scaleX: window.gsap.quickTo(path, "scaleX", {
        duration: transformDuration,
        ease: "power2.out",
      }),
      scaleY: window.gsap.quickTo(path, "scaleY", {
        duration: transformDuration,
        ease: "power2.out",
      }),
      opacity: window.gsap.quickTo(path, "strokeOpacity", {
        duration: opacityDuration,
        ease: "power2.out",
      }),
    }));

    window.gsap.set(paths, {
      transformBox: "fill-box",
      transformOrigin: "50% 50%",
      strokeOpacity: baseOpacity,
      willChange: "transform,stroke-opacity",
    });

    function cacheSampledPoints() {
      sampledPoints = paths.map((path) => {
        const samples = [];

        try {
          const totalLength = path.getTotalLength();
          const sampleCount = Math.max(12, Math.min(maxSamplesPerPath, Math.ceil(totalLength / 28)));
          const step = sampleCount > 1 ? totalLength / (sampleCount - 1) : totalLength;
          const ctm = path.getScreenCTM();

          if (!ctm) {
            throw new Error("Missing screen matrix");
          }

          for (let index = 0; index < sampleCount; index += 1) {
            const point = path.getPointAtLength(Math.min(totalLength, step * index));
            const screenPoint = point.matrixTransform(ctm);
            samples.push({ x: screenPoint.x, y: screenPoint.y });
          }
        } catch {
          const rect = path.getBoundingClientRect();
          samples.push({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }

        return samples;
      });

      needsRecalc = false;
    }

    function relaxPaths() {
      for (const set of setters) {
        set.y(0);
        set.scaleX(1);
        set.scaleY(1);
        set.opacity(baseOpacity);
      }
    }

    const state = {
      active: false,
      x: 0,
      y: 0,
      frameQueued: false,
      pointerType: "",
      startX: 0,
      startY: 0,
      suppressUntilPointerUp: false,
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
      hasCurrentPoint: false,
      touchActive: false,
      scrollLockUntil: 0,
    };

    function render() {
      state.frameQueued = false;

      if (needsRecalc) {
        cacheSampledPoints();
      }

      if (!state.active) {
        relaxPaths();
        return;
      }

      const pointerType = state.pointerType || "mouse";
      const smoothing = pointerType === "mouse" ? mouseSmoothing : 1;

      if (!state.hasCurrentPoint) {
        state.currentX = state.targetX;
        state.currentY = state.targetY;
        state.hasCurrentPoint = true;
      } else {
        state.currentX += (state.targetX - state.currentX) * smoothing;
        state.currentY += (state.targetY - state.currentY) * smoothing;
      }

      const svgRect = svg.getBoundingClientRect();
      const radius = Math.max(120, Math.min(svgRect.width, svgRect.height) * radiusScale);

      for (let index = 0; index < setters.length; index += 1) {
        const set = setters[index];
        const points = sampledPoints[index];
        let distance = Number.POSITIVE_INFINITY;

        for (const point of points) {
          const dx = state.currentX - point.x;
          const dy = state.currentY - point.y;
          const nextDistance = Math.hypot(dx, dy);

          if (nextDistance < distance) {
            distance = nextDistance;
          }
        }

        const strength = Math.max(0, 1 - distance / radius);
        const eased = strength * strength * (2 - strength);
        const scale = 1 + 0.03 * eased;

        set.y(-maxLift * eased);
        set.scaleX(scale);
        set.scaleY(scale);
        set.opacity(baseOpacity + (peakOpacity - baseOpacity) * eased);
      }

      if (pointerType === "mouse") {
        const remaining = Math.hypot(state.targetX - state.currentX, state.targetY - state.currentY);

        if (remaining > 0.4) {
          scheduleRender();
        }
      }
    }

    function scheduleRender() {
      if (state.frameQueued) {
        return;
      }

      state.frameQueued = true;
      requestAnimationFrame(render);
    }

    function setActivePoint(x, y) {
      state.active = true;
      state.targetX = x;
      state.targetY = y;

      if (!state.hasCurrentPoint) {
        state.currentX = x;
        state.currentY = y;
        state.hasCurrentPoint = true;
      }

      scheduleRender();
    }

    function clearActivePoint() {
      state.active = false;
      state.hasCurrentPoint = false;
      scheduleRender();
    }

    function onPointerMove(event) {
      if (!state.pointerType) {
        state.pointerType = event.pointerType || "mouse";
      }

      if (state.pointerType === "touch") {
        if (!state.touchActive) {
          return;
        }

        if (performance.now() < state.scrollLockUntil) {
          return;
        }

        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        const verticalScrollIntent = Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2;

        if (verticalScrollIntent) {
          state.suppressUntilPointerUp = true;
          clearActivePoint();
          return;
        }

        if (state.suppressUntilPointerUp) {
          return;
        }
      }

      setActivePoint(event.clientX, event.clientY);
    }

    function onPointerDown(event) {
      state.pointerType = event.pointerType || "";
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.suppressUntilPointerUp = false;

      if (state.pointerType === "touch") {
        state.touchActive = true;

        if (performance.now() < state.scrollLockUntil) {
          return;
        }
      }

      setActivePoint(event.clientX, event.clientY);
    }

    function onPointerEnd() {
      state.suppressUntilPointerUp = false;
      state.touchActive = false;
      state.pointerType = "";
      clearActivePoint();
    }

    surface.addEventListener("pointermove", onPointerMove, { passive: true });
    surface.addEventListener("pointerdown", onPointerDown, { passive: true });
    surface.addEventListener("pointerleave", onPointerEnd, { passive: true });
    surface.addEventListener("pointercancel", onPointerEnd, { passive: true });
    surface.addEventListener("pointerup", onPointerEnd, { passive: true });

    window.addEventListener(
      "resize",
      () => {
        needsRecalc = true;
        scheduleRender();
      },
      { passive: true }
    );

    window.addEventListener(
      "scroll",
      () => {
        needsRecalc = true;

        if (state.pointerType === "touch" || state.touchActive) {
          state.scrollLockUntil = performance.now() + touchScrollCooldownMs;
          state.suppressUntilPointerUp = true;
          clearActivePoint();
        }
      },
      { passive: true }
    );

    scheduleRender();
  }

  for (const surface of surfaces) {
    bindSurface(surface);
  }
})();
