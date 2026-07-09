const fs = require('fs');

const INPUT = 'contours(5).svg';
const OUTPUT = 'static/image/contours-reduced.svg';

// Zoomed crop region inside the original 1433x792 canvas.
const CROP = {
  x: 330,
  y: 110,
  width: 760,
  height: 500,
};

const DECIMATION_STEP = 6;
const MAX_PATHS = 24;

const svg = fs.readFileSync(INPUT, 'utf8');
const rootMatch = svg.match(/<svg\s+[^>]*>/);
if (!rootMatch) {
  throw new Error('Could not find SVG root tag.');
}

const pathMatches = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)];
if (pathMatches.length === 0) {
  throw new Error('No <path .../> elements found.');
}

function parseNumbers(str) {
  const out = [];
  const matches = str.match(/-?\d*\.?\d+/g) || [];
  for (const m of matches) {
    out.push(Number.parseFloat(m));
  }
  return out;
}

function parsePathD(d) {
  const segments = d.match(/[MLZ][^MLZ]*/g) || [];
  const subpaths = [];
  let current = [];

  for (const seg of segments) {
    const cmd = seg[0];

    if (cmd === 'Z') {
      if (current.length > 1) {
        subpaths.push(current);
      }
      current = [];
      continue;
    }

    const nums = parseNumbers(seg.slice(1));
    if (nums.length < 2) {
      continue;
    }

    for (let i = 0; i + 1 < nums.length; i += 2) {
      const point = { x: nums[i], y: nums[i + 1] };
      if (cmd === 'M' && i === 0) {
        if (current.length > 1) {
          subpaths.push(current);
        }
        current = [point];
      } else {
        current.push(point);
      }
    }
  }

  if (current.length > 1) {
    subpaths.push(current);
  }

  return subpaths;
}

function clipSegmentToRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const checks = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];

  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
      continue;
    }

    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) {
        return null;
      }
      if (ratio > t0) {
        t0 = ratio;
      }
    } else {
      if (ratio < t0) {
        return null;
      }
      if (ratio < t1) {
        t1 = ratio;
      }
    }
  }

  if (t0 > t1) {
    return null;
  }

  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

function round1(num) {
  return Math.round(num * 10) / 10;
}

const candidatePaths = [];

function decimatePoints(points) {
  if (points.length <= 2) {
    return points;
  }

  const reduced = [points[0]];

  for (let i = DECIMATION_STEP; i < points.length - 1; i += DECIMATION_STEP) {
    reduced.push(points[i]);
  }

  reduced.push(points[points.length - 1]);
  return reduced;
}

for (const match of pathMatches) {
  const d = match[1];
  const subpaths = parsePathD(d);

  for (const subpath of subpaths) {
    let current = [];

    function flushCurrent() {
      if (current.length >= 2) {
        candidatePaths.push(decimatePoints(current));
      }
      current = [];
    }

    for (let i = 1; i < subpath.length; i += 1) {
      const segment = clipSegmentToRect(subpath[i - 1], subpath[i], CROP);
      if (!segment) {
        flushCurrent();
        continue;
      }

      const [start, end] = segment;

      if (current.length === 0) {
        current.push(start, end);
        continue;
      }

      const last = current[current.length - 1];
      const gap = Math.hypot(last.x - start.x, last.y - start.y);

      if (gap > 0.75) {
        flushCurrent();
        current.push(start, end);
      } else {
        if (gap > 0.01) {
          current.push(start);
        }
        current.push(end);
      }
    }

    flushCurrent();
  }
}

candidatePaths.sort((a, b) => b.length - a.length);
const selected = candidatePaths.slice(0, MAX_PATHS);

if (selected.length === 0) {
  throw new Error('Reducer produced zero paths. Try expanding crop or margin.');
}

const pathElements = selected.map((points) => {
  const d = points
    .map((p, index) => {
      const prefix = index === 0 ? 'M' : 'L';
      return `${prefix}${round1(p.x)},${round1(p.y)}`;
    })
    .join('');

  return `<path data-contour-path="" fill="none" stroke="#fffed5" stroke-width="0.9" d="${d}"/>`;
});

const outSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CROP.x} ${CROP.y} ${CROP.width} ${CROP.height}" preserveAspectRatio="xMidYMid slice" data-contours-svg="" aria-hidden="true">`,
  ...pathElements,
  '</svg>',
].join('');

fs.mkdirSync('static/image', { recursive: true });
fs.writeFileSync(OUTPUT, outSvg);

console.log(`Wrote ${OUTPUT}`);
console.log(`Input paths: ${pathMatches.length}`);
console.log(`Selected subpaths: ${selected.length}`);
console.log(`Output bytes: ${fs.statSync(OUTPUT).size}`);
