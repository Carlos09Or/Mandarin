// Free-order stroke quiz: each stroke the learner draws is matched against ALL remaining
// strokes of the character (shape + position, either direction), so the stroke order does
// not matter. Hanzi Writer's own quiz only accepts the official order, so this is a small
// standalone recognizer that reuses Hanzi Writer's character data and coordinate system.
//
// Character coordinates: 1024-unit box, y pointing up (from y = -124 to 900).
(function () {
  const SAMPLES = 24;

  function length(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return total;
  }

  /** Resamples a polyline to `n` points evenly spaced along its length. */
  function resample(points, n = SAMPLES) {
    if (points.length === 1) return Array.from({ length: n }, () => points[0]);
    const total = length(points);
    if (total === 0) return Array.from({ length: n }, () => points[0]);
    const step = total / (n - 1);
    const out = [points[0]];
    let carried = 0;
    for (let i = 1; i < points.length && out.length < n; i++) {
      let [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      let seg = Math.hypot(bx - ax, by - ay);
      while (carried + seg >= step && out.length < n) {
        const t = (step - carried) / seg;
        ax += (bx - ax) * t;
        ay += (by - ay) * t;
        out.push([ax, ay]);
        seg = Math.hypot(bx - ax, by - ay);
        carried = 0;
      }
      carried += seg;
    }
    while (out.length < n) out.push(points[points.length - 1]);
    return out;
  }

  function meanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
    return sum / a.length;
  }

  const centroid = (pts) => pts.reduce((acc, p) => [acc[0] + p[0] / pts.length, acc[1] + p[1] / pts.length], [0, 0]);
  const centered = (pts) => {
    const [cx, cy] = centroid(pts);
    return pts.map(([x, y]) => [x - cx, y - cy]);
  };

  /**
   * Compares a drawn stroke with a reference median (character units), in two separate parts:
   *  - shape: mean distance after centering both strokes (either direction),
   *  - offset: distance between their centers (position on the box).
   * Very short strokes (dots) are compared by position only.
   */
  function strokeDistance(drawn, median) {
    const lenD = length(drawn);
    const lenM = length(median);
    const [dx, dy] = centroid(drawn);
    const [mx, my] = centroid(median);
    const offset = Math.hypot(dx - mx, dy - my);
    if (lenM < 60 || lenD < 40) return { shape: 0, offset, ratio: 1 };
    const rd = centered(resample(drawn));
    const rm = centered(resample(median));
    const forward = meanDistance(rd, rm);
    const backward = meanDistance(rd, [...rm].reverse());
    return { shape: Math.min(forward, backward), offset, ratio: lenD / lenM, reversed: backward < forward };
  }

  // Tolerances in character units (box = 1024), calibrated on the 174 characters of the 150
  // HSK 1 words: ~96% of well-formed strokes accepted (shifted up to ±90 units, ±10% size,
  // either direction, any order); 100% of scribbles, ~92% of strokes placed far away and
  // ~77% of wrongly shaped strokes rejected. `leniency` scales both.
  const SHAPE_TOLERANCE = 80;
  const OFFSET_TOLERANCE = 130;

  /** Best remaining stroke for a drawn stroke, or null if none is close enough in shape AND position. */
  function matchStroke(drawn, medians, remaining, leniency = 1, tolerances = {}) {
    const maxShape = (tolerances.shape ?? SHAPE_TOLERANCE) * leniency;
    const maxOffset = (tolerances.offset ?? OFFSET_TOLERANCE) * leniency;
    let best = null;
    for (const i of remaining) {
      const { shape, offset, ratio } = strokeDistance(drawn, medians[i]);
      if (ratio < 0.35 || ratio > 2.6 || shape > maxShape || offset > maxOffset) continue;
      const score = shape + offset * 0.6;
      if (!best || score < best.score) best = { index: i, score, shape, offset };
    }
    return best;
  }

  /**
   * Interactive free-order quiz drawn in its own SVG layer inside `host`.
   * Callbacks: onCorrectStroke({strokeNum, strokesRemaining}), onMistake({totalMistakes}), onComplete({totalMistakes}).
   */
  class FreeOrderQuiz {
    constructor(host, data, { size, padding, showOutline = true, leniency = 1, colors = {}, onCorrectStroke, onMistake, onComplete } = {}) {
      this.data = data;
      this.size = size;
      this.leniency = leniency;
      this.remaining = new Set(data.strokes.map((_, i) => i));
      this.mistakes = 0;
      this.callbacks = { onCorrectStroke, onMistake, onComplete };
      this.colors = { stroke: '#4e1217', outline: '#eadbd8', drawing: '#b72d36', hint: '#df7c83', ...colors };
      const t = HanziWriter.getScalingTransform(size, size, padding);
      this.t = t;

      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('class', 'freeOrderQuiz');
      svg.style.cssText = 'position:absolute;inset:0;touch-action:none;display:block';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('transform', t.transform);
      this.paths = data.strokes.map((d) => {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', showOutline ? this.colors.outline : 'transparent');
        p.style.transition = 'fill .25s ease';
        g.appendChild(p);
        return p;
      });
      svg.appendChild(g);
      this.ink = document.createElementNS(ns, 'polyline');
      this.ink.setAttribute('fill', 'none');
      this.ink.setAttribute('stroke', this.colors.drawing);
      this.ink.setAttribute('stroke-width', Math.max(8, Math.round(size * 0.035)));
      this.ink.setAttribute('stroke-linecap', 'round');
      this.ink.setAttribute('stroke-linejoin', 'round');
      this.ink.style.transition = 'opacity .25s ease';
      svg.appendChild(this.ink);
      this.svg = svg;
      host.appendChild(svg);
      this.showOutline = showOutline;
      this.bind();
    }

    /** Screen point → character coordinates (inverse of Hanzi Writer's scaling transform). */
    toChar(e) {
      const r = this.svg.getBoundingClientRect();
      const ex = ((e.clientX - r.left) / r.width) * this.size;
      const ey = ((e.clientY - r.top) / r.height) * this.size;
      return [(ex - this.t.x) / this.t.scale, (this.size - this.t.y - ey) / this.t.scale];
    }

    bind() {
      let drawing = null;
      let screen = [];
      const r = () => this.svg.getBoundingClientRect();
      const local = (e) => [((e.clientX - r().left) / r().width) * this.size, ((e.clientY - r().top) / r().height) * this.size];
      this.svg.addEventListener('pointerdown', (e) => {
        if (!this.remaining.size) return;
        e.preventDefault();
        this.svg.setPointerCapture(e.pointerId);
        drawing = { id: e.pointerId, points: [this.toChar(e)] };
        screen = [local(e)];
        this.ink.style.opacity = '1';
        this.ink.setAttribute('points', screen.map((p) => p.join(',')).join(' '));
      });
      this.svg.addEventListener('pointermove', (e) => {
        if (!drawing || e.pointerId !== drawing.id) return;
        const batch = e.getCoalescedEvents?.() || [];
        for (const ev of batch.length ? batch : [e]) {
          drawing.points.push(this.toChar(ev));
          screen.push(local(ev));
        }
        this.ink.setAttribute('points', screen.map((p) => p.join(',')).join(' '));
      });
      const end = (e) => {
        if (!drawing || e.pointerId !== drawing.id) return;
        const pts = drawing.points;
        drawing = null;
        this.ink.style.opacity = '0';
        if (pts.length < 2 && e.type === 'pointercancel') return;
        this.judge(pts);
      };
      this.svg.addEventListener('pointerup', end);
      this.svg.addEventListener('pointercancel', end);
    }

    judge(points) {
      const match = matchStroke(points, this.data.medians, this.remaining, this.leniency);
      if (!match) {
        this.mistakes++;
        this.callbacks.onMistake?.({ totalMistakes: this.mistakes });
        return;
      }
      this.remaining.delete(match.index);
      this.paths[match.index].setAttribute('fill', this.colors.stroke);
      this.callbacks.onCorrectStroke?.({ strokeNum: match.index, strokesRemaining: this.remaining.size });
      if (!this.remaining.size) this.callbacks.onComplete?.({ totalMistakes: this.mistakes });
    }

    /** Briefly highlights one remaining stroke (the next one in the official order). */
    hint() {
      const next = [...this.remaining].sort((a, b) => a - b)[0];
      if (next === undefined) return;
      const p = this.paths[next];
      p.setAttribute('fill', this.colors.hint);
      setTimeout(() => this.remaining.has(next) && p.setAttribute('fill', this.showOutline ? this.colors.outline : 'transparent'), 900);
    }

    destroy() {
      this.svg.remove();
    }
  }

  window.FreeOrderQuiz = FreeOrderQuiz;
  window.FreeOrderMatch = { resample, strokeDistance, matchStroke };
})();
