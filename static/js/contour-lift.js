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

    const scrollContainers = Array.from(surface.querySelectorAll("[data-contour-scroll]"));

    const paths = Array.from(svg.querySelectorAll("path"));
    if (paths.length === 0) {
      return;
    }

    const coarsePointer =
      window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    const maxLift = 0;
    const radiusScale = coarsePointer ? 1.02 : 0.82;
    const baseOpacity = 0.62;
    const contactPulseColor = "#F79628";
    const contactPulseDuration = coarsePointer ? 0.9 : 0.8;
    const contactPulseWidthBoost = coarsePointer ? 0.9 : 1.1;
    const maxSamplesPerPath = coarsePointer ? 34 : 42;
    const mouseSmoothing = 0.13;
    const touchSmoothing = 0.15;
    const touchScrollCooldownMs = 320;
    const mouseMoveEpsilon = 1.2;
    const touchMoveEpsilon = 1.6;
    const touchMoveThrottleMs = 16;
    const lineResponse = coarsePointer ? 0.14 : 0.16;
    const touchInertiaDecay = 0.93;
    const touchInertiaMinSpeed = 70;
    const touchInertiaMaxMs = 420;
    const pulseDebounceMs = coarsePointer ? 800 : 300;
    const segmentVelocityBase = coarsePointer ? 138 : 165;
    const segmentVelocityDamping = 0.992;
    const segmentStrengthDamping = 0.955;
    const segmentLengthGrowthPerSecond = coarsePointer ? 18 : 24;
    const segmentLocalLift = coarsePointer ? 6.8 : 7.4;
    const minSegmentSpeed = coarsePointer ? 10 : 8;
    const segmentStrengthGain = coarsePointer ? 1.22 : 1;
    const segmentOpacityFloor = coarsePointer ? 0.36 : 0.3;
    const segmentOpacityScale = coarsePointer ? 0.86 : 0.8;

    let needsRecalc = true;
    let sampledPoints = [];
    let pathLengths = [];

    const setters = paths.map((path) => ({
      y: window.gsap.quickSetter(path, "y"),
    }));

    const overlayPaths = paths.map((path) => {
      const overlay = path.cloneNode(true);
      overlay.setAttribute("data-contour-segment-overlay", "");
      overlay.setAttribute("stroke", "#fffed5");
      overlay.setAttribute("stroke-opacity", "0");
      overlay.setAttribute("fill", "none");
      overlay.style.pointerEvents = "none";
      path.parentNode.appendChild(overlay);
      return overlay;
    });

    const overlaySettersY = overlayPaths.map((path) => window.gsap.quickSetter(path, "y"));
    const segmentPulses = paths.map(() => []);

    const lineState = paths.map(() => ({
      y: 0,
    }));

    const originalStrokeColors = paths.map((path) => {
      const strokeAttr = path.getAttribute("stroke");
      if (strokeAttr) {
        return strokeAttr;
      }

      const computedStroke = getComputedStyle(path).stroke;
      if (computedStroke && computedStroke !== "none") {
        return computedStroke;
      }

      return "#fffed5";
    });

    const originalStrokeWidths = paths.map((path) => {
      const attrWidth = Number.parseFloat(path.getAttribute("stroke-width") || "");
      const computedWidth = Number.parseFloat(getComputedStyle(path).strokeWidth || "");

      if (Number.isFinite(attrWidth)) {
        return attrWidth;
      }

      if (Number.isFinite(computedWidth)) {
        return computedWidth;
      }

      return 0.9;
    });

    window.gsap.set(paths, {
      transformBox: "fill-box",
      transformOrigin: "50% 50%",
      strokeOpacity: baseOpacity,
    });
    window.gsap.set(overlayPaths, {
      transformBox: "fill-box",
      transformOrigin: "50% 50%",
    });

    function distanceToSegment(px, py, ax, ay, bx, by) {
      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;
      const lengthSq = abx * abx + aby * aby;

      if (lengthSq === 0) {
        return Math.hypot(px - ax, py - ay);
      }

      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSq));
      const closestX = ax + abx * t;
      const closestY = ay + aby * t;
      return Math.hypot(px - closestX, py - closestY);
    }

    function distanceToPolyline(points, x, y) {
      if (points.length < 2) {
        const only = points[0];
        return only ? Math.hypot(x - only.x, y - only.y) : Number.POSITIVE_INFINITY;
      }

      let minDistance = Number.POSITIVE_INFINITY;

      for (let index = 1; index < points.length; index += 1) {
        const prev = points[index - 1];
        const current = points[index];
        const distance = distanceToSegment(x, y, prev.x, prev.y, current.x, current.y);

        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      return minDistance;
    }

    function cacheSampledPoints() {
      pathLengths = paths.map((path) => {
        try {
          return path.getTotalLength();
        } catch {
          return 1;
        }
      });

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
            const lengthAt = Math.min(totalLength, step * index);
            const point = path.getPointAtLength(lengthAt);
            const screenPoint = point.matrixTransform(ctm);
            samples.push({ x: screenPoint.x, y: screenPoint.y, length: lengthAt });
          }
        } catch {
          const rect = path.getBoundingClientRect();
          samples.push({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            length: 0,
          });
        }

        return samples;
      });

      needsRecalc = false;
    }

    function nearestPathAndLength(x, y) {
      if (needsRecalc) {
        cacheSampledPoints();
      }

      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      let nearestLength = 0;

      for (let index = 0; index < sampledPoints.length; index += 1) {
        const points = sampledPoints[index];
        const distance = distanceToPolyline(points, x, y);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;

          let sampleIndex = 0;
          let sampleDistance = Number.POSITIVE_INFINITY;
          for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
            const point = points[pointIndex];
            const current = Math.hypot(point.x - x, point.y - y);
            if (current < sampleDistance) {
              sampleDistance = current;
              sampleIndex = pointIndex;
            }
          }

          nearestLength = points[sampleIndex] ? points[sampleIndex].length : 0;
        }
      }

      return { nearestIndex, nearestDistance, nearestLength };
    }

    function injectSegmentImpulse(x, y, velocityX, velocityY) {
      const speed = Math.hypot(velocityX, velocityY);
      if (speed < minSegmentSpeed) {
        return;
      }

      const nearest = nearestPathAndLength(x, y);
      if (nearest.nearestIndex < 0) {
        return;
      }

      const baseIndex = nearest.nearestIndex;
      const baseLength = Math.max(1, pathLengths[baseIndex] || 1);
      const normalized = nearest.nearestLength / baseLength;
      const direction = Math.abs(velocityX) >= Math.abs(velocityY)
        ? Math.sign(velocityX || 1)
        : Math.sign(velocityY || 1);

      for (let offset = -2; offset <= 2; offset += 1) {
        const targetIndex = baseIndex + offset;
        if (targetIndex < 0 || targetIndex >= segmentPulses.length) {
          continue;
        }

        const falloff = Math.pow(0.62, Math.abs(offset));
        const targetLength = Math.max(1, pathLengths[targetIndex] || 1);
        const center = Math.max(0, Math.min(targetLength, normalized * targetLength));
        const strength = Math.min(1.45, (speed / 420) * falloff * segmentStrengthGain);

        segmentPulses[targetIndex].push({
          center,
          velocity: direction * segmentVelocityBase * (0.85 + 0.15 * falloff),
          length: Math.max(28, Math.min(targetLength * 0.38, (coarsePointer ? 46 : 60) + speed * 0.045)),
          strength,
        });
      }

      scheduleRender();
    }

    function renderSegmentImpulses(deltaSeconds) {
      let animating = false;

      for (let index = 0; index < segmentPulses.length; index += 1) {
        const pulses = segmentPulses[index];
        const pathLength = Math.max(1, pathLengths[index] || 1);
        const remaining = [];

        for (let pulseIndex = 0; pulseIndex < pulses.length; pulseIndex += 1) {
          const pulse = pulses[pulseIndex];

          pulse.center += pulse.velocity * deltaSeconds;
          if (pulse.center < 0) {
            pulse.center = 0;
            pulse.velocity = Math.abs(pulse.velocity) * 0.72;
          } else if (pulse.center > pathLength) {
            pulse.center = pathLength;
            pulse.velocity = -Math.abs(pulse.velocity) * 0.72;
          }

          pulse.velocity *= segmentVelocityDamping;
          pulse.strength *= Math.pow(segmentStrengthDamping, Math.max(1, deltaSeconds * 60));
          pulse.length = Math.min(pathLength * 0.48, pulse.length + segmentLengthGrowthPerSecond * deltaSeconds);

          if (pulse.strength > 0.015) {
            remaining.push(pulse);
            animating = true;
          }
        }

        segmentPulses[index] = remaining;

        if (remaining.length === 0) {
          overlayPaths[index].style.strokeOpacity = "0";
          overlaySettersY[index](0);
          continue;
        }

        let dominant = remaining[0];
        for (let pulseIndex = 1; pulseIndex < remaining.length; pulseIndex += 1) {
          if (remaining[pulseIndex].strength > dominant.strength) {
            dominant = remaining[pulseIndex];
          }
        }

        const dashLength = Math.max(22, Math.min(pathLength * 0.48, dominant.length));
        const maxStart = Math.max(0, pathLength - dashLength);
        const dashStart = Math.max(0, Math.min(maxStart, dominant.center - dashLength * 0.5));
        const dashOffset = -dashStart;
        const localShift = -Math.sign(dominant.velocity || 1) * dominant.strength * segmentLocalLift;

        overlayPaths[index].setAttribute("stroke", originalStrokeColors[index]);
        overlayPaths[index].setAttribute("stroke-width", `${(originalStrokeWidths[index] + dominant.strength * 1.15).toFixed(3)}`);
        overlayPaths[index].style.strokeOpacity = `${Math.min(0.98, segmentOpacityFloor + dominant.strength * segmentOpacityScale).toFixed(3)}`;
        overlayPaths[index].setAttribute("stroke-dasharray", `${dashLength.toFixed(2)} ${(pathLength + dashLength).toFixed(2)}`);
        overlayPaths[index].setAttribute("stroke-dashoffset", `${dashOffset.toFixed(2)}`);
        overlaySettersY[index](localShift);
      }

      return animating;
    }

    function pulseNearestLine(x, y) {
      if (needsRecalc) {
        cacheSampledPoints();
      }

      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < sampledPoints.length; index += 1) {
        const points = sampledPoints[index];
        const distance = distanceToPolyline(points, x, y);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }

      if (nearestIndex < 0) {
        return;
      }

      const path = paths[nearestIndex];
      const originalStroke = originalStrokeColors[nearestIndex];
      const originalWidth = originalStrokeWidths[nearestIndex];

      // Only kill stroke-related tweens, not transform tweens
      window.gsap.killTweensOf(path, "stroke,strokeOpacity,strokeWidth");
      
      window.gsap.set(path, {
        stroke: contactPulseColor,
        strokeOpacity: 1,
        strokeWidth: originalWidth + contactPulseWidthBoost,
      });
      window.gsap.to(path, {
        duration: contactPulseDuration,
        ease: "power2.out",
        stroke: originalStroke,
        strokeOpacity: baseOpacity,
        strokeWidth: originalWidth,
        overwrite: "auto",
      });

      state.lastPulseTs = performance.now();
    }

    function relaxPaths() {
      let settled = true;

      for (let index = 0; index < setters.length; index += 1) {
        const set = setters[index];
        const stateItem = lineState[index];

        stateItem.y += (0 - stateItem.y) * lineResponse;

        if (Math.abs(stateItem.y) < 0.01) {
          stateItem.y = 0;
        }

        if (stateItem.y !== 0) {
          settled = false;
        }

        set.y(stateItem.y);
      }

      return settled;
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
      hasTouchTarget: false,
      touchActive: false,
      scrollLockUntil: 0,
      lastTouchMoveTs: 0,
      lastTouchX: 0,
      lastTouchY: 0,
      lastTouchEventTs: 0,
      touchVelocityX: 0,
      touchVelocityY: 0,
      touchInertiaActive: false,
      touchInertiaUntil: 0,
      lastPulseTs: 0,
      pointerDownTs: 0,
      lastPointerX: 0,
      lastPointerY: 0,
      lastPointerTs: 0,
      lastFrameTs: 0,
    };

    function render() {
      state.frameQueued = false;
      const now = performance.now();
      const deltaSeconds = state.lastFrameTs > 0 ? Math.min(0.05, (now - state.lastFrameTs) / 1000) : 1 / 60;
      state.lastFrameTs = now;

      if (needsRecalc) {
        cacheSampledPoints();
      }

      if (state.touchInertiaActive) {
        if (now >= state.touchInertiaUntil) {
          state.touchInertiaActive = false;
          state.touchVelocityX = 0;
          state.touchVelocityY = 0;
          clearActivePoint();
        } else {
          const svgRect = svg.getBoundingClientRect();
          state.touchVelocityX *= touchInertiaDecay;
          state.touchVelocityY *= touchInertiaDecay;

          const inertiaSpeed = Math.hypot(state.touchVelocityX, state.touchVelocityY);
          if (inertiaSpeed < touchInertiaMinSpeed * 0.35) {
            state.touchInertiaActive = false;
            clearActivePoint();
          } else {
            const nextX = Math.min(
              svgRect.right,
              Math.max(svgRect.left, state.targetX + state.touchVelocityX / 60)
            );
            const nextY = Math.min(
              svgRect.bottom,
              Math.max(svgRect.top, state.targetY + state.touchVelocityY / 60)
            );
            setActivePoint(nextX, nextY, true);
          }
        }
      }

      if (!state.active) {
        const settled = relaxPaths();
        const impulseAnimating = renderSegmentImpulses(deltaSeconds);
        if (!settled || impulseAnimating) {
          scheduleRender();
        }
        return;
      }

      const pointerType = state.pointerType || "mouse";
      const smoothing = pointerType === "mouse" ? mouseSmoothing : touchSmoothing;

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

      let needsAnotherFrame = false;

      for (let index = 0; index < setters.length; index += 1) {
        const set = setters[index];
        const points = sampledPoints[index];
        const distance = distanceToPolyline(points, state.currentX, state.currentY);

        const strength = Math.max(0, 1 - distance / radius);
        const eased = strength * strength * (2 - strength);
        const stateItem = lineState[index];
        const targetY = -maxLift * eased;

        stateItem.y += (targetY - stateItem.y) * lineResponse;

        if (Math.abs(targetY - stateItem.y) > 0.015) {
          needsAnotherFrame = true;
        }

        set.y(stateItem.y);
      }

      const impulseAnimating = renderSegmentImpulses(deltaSeconds);

      const remaining = Math.hypot(state.targetX - state.currentX, state.targetY - state.currentY);
      if (remaining > 0.25 || needsAnotherFrame || impulseAnimating) {
        scheduleRender();
      }
    }

    function scheduleRender() {
      if (state.frameQueued) {
        return;
      }

      state.frameQueued = true;
      requestAnimationFrame(render);
    }

    function setActivePoint(x, y, force = false) {
      state.active = true;

      if (!force && state.hasCurrentPoint) {
        const jitter = Math.hypot(x - state.targetX, y - state.targetY);
        const epsilon = state.pointerType === "touch" ? touchMoveEpsilon : mouseMoveEpsilon;

        if (jitter < epsilon) {
          return;
        }
      }

      state.targetX = x;
      state.targetY = y;
      if (state.pointerType === "touch") {
        state.hasTouchTarget = true;
      }

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
      state.hasTouchTarget = false;
      scheduleRender();
    }

    function onPointerMove(event) {
      if (!state.pointerType) {
        state.pointerType = event.pointerType || "mouse";
      }

      const now = performance.now();
      const pointerDt = Math.max(1, now - state.lastPointerTs);
      const pointerVelocityX = ((event.clientX - state.lastPointerX) / pointerDt) * 1000;
      const pointerVelocityY = ((event.clientY - state.lastPointerY) / pointerDt) * 1000;
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      state.lastPointerTs = now;

      if (state.pointerType === "touch") {
        if (!state.touchActive) {
          return;
        }

        // Allow updates for the first 100ms after pointer down, even if scroll locked
        const timeSinceDown = performance.now() - state.pointerDownTs;
        if (timeSinceDown > 100 && performance.now() < state.scrollLockUntil) {
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

        if (now - state.lastTouchMoveTs < touchMoveThrottleMs) {
          return;
        }
        state.lastTouchMoveTs = now;

        const dt = Math.max(1, now - state.lastTouchEventTs);
        state.touchVelocityX = ((event.clientX - state.lastTouchX) / dt) * 1000;
        state.touchVelocityY = ((event.clientY - state.lastTouchY) / dt) * 1000;
        state.lastTouchX = event.clientX;
        state.lastTouchY = event.clientY;
        state.lastTouchEventTs = now;

        injectSegmentImpulse(event.clientX, event.clientY, state.touchVelocityX, state.touchVelocityY);
      } else {
        injectSegmentImpulse(event.clientX, event.clientY, pointerVelocityX, pointerVelocityY);
      }

      setActivePoint(event.clientX, event.clientY);
    }

    function onPointerDown(event) {
      state.pointerType = event.pointerType || "";
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.suppressUntilPointerUp = false;
      state.lastPointerX = event.clientX;
      state.lastPointerY = event.clientY;
      state.lastPointerTs = performance.now();

      if (state.pointerType === "touch") {
        state.touchActive = true;
        const now = performance.now();
        state.pointerDownTs = now;
        state.lastTouchMoveTs = now;
        state.lastTouchEventTs = now;
        state.lastTouchX = event.clientX;
        state.lastTouchY = event.clientY;
        state.touchVelocityX = 0;
        state.touchVelocityY = 0;
        state.touchInertiaActive = false;
        state.hasTouchTarget = false;

        // Block pointer down during scroll lock to prevent race conditions
        if (now < state.scrollLockUntil) {
          return;
        }
        // No pulse on touch — just use movement-based segment impulses
      } else {
        // Desktop click pulse removed; movement drives the effect.
      }

      setActivePoint(event.clientX, event.clientY, true);
    }

    function onPointerEnd() {
      const isTouch = state.pointerType === "touch";
      const speed = Math.hypot(state.touchVelocityX, state.touchVelocityY);
      const wasSuppressed = state.suppressUntilPointerUp;

      state.suppressUntilPointerUp = false;
      state.touchActive = false;

      if (isTouch && !wasSuppressed && speed > touchInertiaMinSpeed) {
        state.touchInertiaActive = true;
        state.touchInertiaUntil = performance.now() + touchInertiaMaxMs;
        state.pointerType = "touch";
        state.active = true;
        scheduleRender();
        return;
      }

      state.touchInertiaActive = false;
      state.touchVelocityX = 0;
      state.touchVelocityY = 0;
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

    const handleScroll = () => {
      needsRecalc = true;

      if (state.pointerType === "touch" || state.touchActive) {
        state.scrollLockUntil = performance.now() + touchScrollCooldownMs;
        state.suppressUntilPointerUp = true;
        state.touchInertiaActive = false;
        state.touchVelocityX = 0;
        state.touchVelocityY = 0;
        // Don't clear the effect during scroll — let it relax naturally
      }
    };

    if (scrollContainers.length > 0) {
      for (const container of scrollContainers) {
        container.addEventListener("scroll", handleScroll, { passive: true });
      }
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }

    scheduleRender();
  }

  for (const surface of surfaces) {
    bindSurface(surface);
  }
})();
