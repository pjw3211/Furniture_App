// Mid-century living room furniture, built from numbers.
//
// ES module. createFurniture() is a
// factory that takes three.js pieces and returns the furniture types.
//
// Every builder works in inches in the three.js frame: X = width (left to
// right), Y = up, Z = depth with the front of the piece facing +Z. The
// origin is on the floor, centred under the piece. A builder returns a list
// of { geo, mat } where mat is one of "wood", "fabric", "accent", "brass",
// "dark".
export function createFurniture(THREE, deps) {
  const { toCreasedNormals, RoundedBoxGeometry } = deps;
  const D2R = THREE.MathUtils.degToRad;

  // ------------------------------------------------------------------
  //  Geometry helpers
  // ------------------------------------------------------------------
  class Soup {
    constructor() { this.p = []; }
    tri(a, b, c, out) {
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) [b, c] = [c, b];
      this.p.push(...a, ...b, ...c);
    }
    loft(rings, centres) {
      for (let r = 0; r < rings.length - 1; r++) {
        const A = rings[r], B = rings[r + 1], n = A.length, c = centres[r];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, out = [A[i][0] - c[0], 0, A[i][2] - c[2]];
          this.tri(A[i], A[j], B[j], out);
          this.tri(A[i], B[j], B[i], out);
        }
      }
      this.cap(rings[0], -1);
      this.cap(rings[rings.length - 1], +1);
    }
    cap(ring, dir) {
      const contour = ring.map(p => new THREE.Vector2(p[0], p[2]));
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, []))
        this.tri(ring[i], ring[j], ring[k], [0, dir, 0]);
    }
    box(x0, x1, y0, y1, z0, z1) {
      if (x0 > x1) [x0, x1] = [x1, x0];
      if (y0 > y1) [y0, y1] = [y1, y0];
      if (z0 > z1) [z0, z1] = [z1, z0];
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], v = (x, y, z) => [x, y, z];
      const faces = [
        [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)],
        [v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)],
        [v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)],
        [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
        [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)],
        [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)],
      ];
      for (const f of faces) {
        const fc = f.reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4, m[2] + p[2] / 4], [0, 0, 0]);
        const out = [fc[0] - c[0], fc[1] - c[1], fc[2] - c[2]];
        this.tri(f[0], f[1], f[2], out); this.tri(f[0], f[2], f[3], out);
      }
    }
    geometry(crease = 32) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
      return toCreasedNormals(g, D2R(crease));
    }
  }

  // Merge geometries into one with position + normal only.
  function merge(list) {
    const pos = [], nor = [];
    for (const g0 of list) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }

  // Rounded box centred at (x, y, z); optional tilt about X (degrees,
  // positive leans the top toward -Z) around its own bottom edge.
  function rbox(w, h, d, r, x, y, z, tilt = 0) {
    r = Math.max(0.05, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
    const g = new RoundedBoxGeometry(w, h, d, 4, r);
    if (tilt) {
      g.translate(0, h / 2, 0);
      g.rotateX(-D2R(tilt));
      g.translate(0, -h / 2, 0);
    }
    g.translate(x, y, z);
    return g;
  }

  function section(kind, size, n = 40) {
    if (kind === "round") {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = 2 * Math.PI * i / n;
        pts.push([size / 2 * Math.cos(t), size / 2 * Math.sin(t)]);
      }
      return pts;
    }
    const h = size / 2;
    return [[h, h], [-h, h], [-h, -h], [h, -h]];
  }

  // A tapered leg from the floor to `topY`. (sx, sz) = corner signs used for
  // splay direction and for keeping square legs' outside faces vertical.
  function leg(soup, kind, cx, cz, topY, top, foot, splayDeg, sx, sz, diag) {
    const off = topY * Math.tan(D2R(splayDeg));
    const dl = Math.hypot(diag[0], diag[1]) || 1;
    let fx = cx + sx * off * Math.abs(diag[0]) / dl, fz = cz + sz * off * Math.abs(diag[1]) / dl;
    if (kind === "square") { fx += sx * (top - foot) / 2; fz += sz * (top - foot) / 2; }
    const ringF = section(kind, foot).map(([x, z]) => [fx + x, 0, fz + z]);
    const ringT = section(kind, top).map(([x, z]) => [cx + x, topY, cz + z]);
    soup.loft([ringF, ringT], [[fx, 0, fz], [cx, 0, cz]]);
    return { fx, fz };
  }

  function taperDeg(kind, top, foot, h) {
    const inward = kind === "square" ? top - foot : (top - foot) / 2;
    return THREE.MathUtils.radToDeg(Math.atan2(inward, h));
  }

  // ------------------------------------------------------------------
  //  Tables (coffee table, side table)
  // ------------------------------------------------------------------
  const RING = 160;
  function outline(s, a, b, inset) {
    a -= inset; b -= inset;
    const pts = [];
    if (s.top_mode === "se") {
      for (let i = 0; i < RING; i++) {
        const t = 2 * Math.PI * i / RING, c = Math.cos(t), si = Math.sin(t);
        pts.push([a * Math.sign(c) * Math.abs(c) ** (2 / s.se_n), b * Math.sign(si) * Math.abs(si) ** (2 / s.se_n)]);
      }
    } else {
      const r = Math.max(Math.min(s.corner_r - inset, a, b), 0.02), k = RING / 4;
      for (let q = 0; q < 4; q++) {
        const sx = q === 0 || q === 3 ? 1 : -1, sy = q < 2 ? 1 : -1;
        for (let j = 0; j < k; j++) {
          const t = (q + j / (k - 1)) * Math.PI / 2;
          pts.push([sx * (a - r) + r * Math.cos(t), sy * (b - r) + r * Math.sin(t)]);
        }
      }
    }
    return pts;
  }
  function insideTop(s, x, y, inset) {
    const a = s.table_l / 2 - inset, b = s.table_w / 2 - inset;
    x = Math.abs(x); y = Math.abs(y);
    if (s.top_mode === "se") return (x / a) ** s.se_n + (y / b) ** s.se_n <= 1;
    const r = Math.max(Math.min(s.corner_r - inset, a, b), 0);
    if (x > a || y > b) return false;
    const cx = a - r, cy = b - r;
    return x <= cx || y <= cy || Math.hypot(x - cx, y - cy) <= r;
  }
  function railGeometry(len_half, h, t, rise) {
    const pts = [[len_half, 0], [-len_half, 0], [-len_half, -h]];
    if (rise > 0.01) {
      const R = (len_half ** 2 + rise ** 2) / (2 * rise), cy = -h + rise - R;
      for (let i = 1; i < 40; i++) {
        const x = -len_half + 2 * len_half * i / 40;
        pts.push([x, cy + Math.sqrt(R * R - x * x)]);
      }
    }
    pts.push([len_half, -h]);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    return g;
  }
  const TEN = { t: 0.375, h: 1.25, d: 0.75 };

  function tableDerive(s) {
    const d = {};
    d.apron_top = s.table_h - s.top_t;
    d.head_h = Math.max(3, s.apron_h);
    d.head_z0 = d.apron_top - d.head_h;
    d.leg_cx = s.table_l / 2 - s.inset_x;
    d.leg_cy = s.table_w / 2 - s.inset_y;
    d.long_half = d.leg_cx - s.leg_sq / 2;
    d.short_half = d.leg_cy - s.leg_sq / 2;
    d.rail_y = d.leg_cy + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
    d.rail_x = d.leg_cx + s.leg_sq / 2 - s.apron_set - s.apron_t / 2;
    const off = d.head_z0 * Math.tan(D2R(s.splay_ang)), diag = Math.hypot(d.leg_cx, d.leg_cy);
    d.splay_dx = off * d.leg_cx / diag; d.splay_dy = off * d.leg_cy / diag;
    d.taper_deg = taperDeg(s.leg_section, s.leg_sq, s.foot, d.head_z0);
    return d;
  }
  function tableClamp(s) {
    s.foot = Math.min(s.foot, s.leg_sq);
    s.apron_set = Math.max(0, Math.min(s.apron_set, s.leg_sq - s.apron_t));
    s.apron_h = Math.min(s.apron_h, s.table_h - s.top_t - 4);
    s.arch_rise = Math.min(s.arch_rise, s.apron_h * 0.6);
    s.edge_r = Math.min(s.edge_r, s.top_t / 2 - 0.01);
    s.corner_r = Math.min(s.corner_r, Math.min(s.table_w, s.table_l) / 2 - 0.5);
    s.inset_x = Math.min(s.inset_x, s.table_l / 2 - s.leg_sq - 2);
    s.inset_y = Math.min(s.inset_y, s.table_w / 2 - s.leg_sq - 2);
    s.shelf_h = Math.min(s.shelf_h, s.table_h - s.top_t - s.apron_h - 2);
  }
  function tableBuild(s) {
    const d = tableDerive(s);
    // top: stack of rings offset by bevel and round-overs
    const t = s.top_t, r = Math.max(0, Math.min(s.edge_r, t / 2 - 0.01)), tb = Math.tan(D2R(s.top_bevel));
    const levels = new Set([0, t]);
    if (r > 0.001) for (let i = 0; i <= 8; i++) { levels.add(r * i / 8); levels.add(t - r + r * i / 8); }
    const off = y => {
      let o = (t - y) * tb;
      if (r > 0.001) {
        if (y > t - r) o += r - Math.sqrt(Math.max(0, r * r - (y - (t - r)) ** 2));
        if (y < r) o += r - Math.sqrt(Math.max(0, r * r - (r - y) ** 2));
      }
      return o;
    };
    const rings = [...levels].sort((a, b) => a - b).map(y =>
      outline(s, s.table_l / 2, s.table_w / 2, off(y)).map(([x, z]) => [x, d.apron_top + y, z]));
    const ts = new Soup(); ts.loft(rings, rings.map(() => [0, 0, 0]));
    const top = ts.geometry(40);

    // legs with square heads
    const ls = new Soup();
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const cx = sx * d.leg_cx, cz = sz * d.leg_cy;
      leg(ls, s.leg_section, cx, cz, d.head_z0, s.leg_sq, s.foot, s.splay_ang, sx, sz, [d.leg_cx, d.leg_cy]);
      const h = s.leg_sq / 2;
      ls.box(cx - h, cx + h, d.head_z0, d.apron_top, cz - h, cz + h);
    }
    const legs = ls.geometry(s.leg_section === "round" ? 30 : 20);

    // aprons with tenons
    const parts = [];
    for (const sz of [1, -1]) {
      const g = railGeometry(d.long_half, s.apron_h, s.apron_t, s.arch_rise);
      g.translate(0, d.apron_top, sz * d.rail_y); parts.push(g);
    }
    for (const sx of [1, -1]) {
      const g = railGeometry(d.short_half, s.apron_h, s.apron_t, s.arch_rise * 0.6);
      g.rotateY(Math.PI / 2); g.translate(sx * d.rail_x, d.apron_top, 0); parts.push(g);
    }
    const tn = new Soup(), y0 = d.apron_top - s.apron_h / 2 - TEN.h / 2, y1 = y0 + TEN.h;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const xe = sx * d.long_half, ze = sz * d.rail_y;
      tn.box(xe, xe + sx * TEN.d, y0, y1, ze - TEN.t / 2, ze + TEN.t / 2);
      const xr = sx * d.rail_x, zr = sz * d.short_half;
      tn.box(xr - TEN.t / 2, xr + TEN.t / 2, y0, y1, zr, zr + sz * TEN.d);
    }
    parts.push(tn.geometry());
    const out = [
      { geo: top, mat: "wood", part: "top" },
      { geo: legs, mat: "wood", part: "legs" },
      { geo: merge(parts), mat: "wood", part: "aprons" },
    ];
    if (s.shelf) {
      // lower shelf between the legs, on cleats (not shown)
      const sh = new Soup(), y = s.shelf_h;
      sh.box(-d.long_half, d.long_half, y - 0.75, y, -d.short_half, d.short_half);
      out.push({ geo: sh.geometry(), mat: "wood", part: "shelf" });
    }
    return { parts: out, info: [`Taper ${d.taper_deg.toFixed(1)}°`,
      `Leg centres ${(2 * d.leg_cx).toFixed(1)} × ${(2 * d.leg_cy).toFixed(1)} in`] };
  }
  function tableFit(s) {
    const d = tableDerive(s), probs = [];
    const under = s.top_t * Math.tan(D2R(s.top_bevel)) + s.edge_r, h = s.leg_sq / 2;
    const headOk = [[d.leg_cx + h, d.leg_cy + h], [d.leg_cx + h, d.leg_cy - h], [d.leg_cx - h, d.leg_cy + h]]
      .every(([x, y]) => insideTop(s, x, y, under));
    if (!headOk) probs.push("The tops of the legs stick out past the edge of the top.");
    let fx = d.leg_cx + d.splay_dx, fy = d.leg_cy + d.splay_dy;
    if (s.leg_section === "square") { fx += (s.leg_sq - s.foot) / 2; fy += (s.leg_sq - s.foot) / 2; }
    const fr = s.foot / 2;
    if (headOk && ![[fx + fr, fy], [fx, fy + fr], [fx + fr * .7, fy + fr * .7]].every(([x, y]) => insideTop(s, x, y, 0)))
      probs.push("The feet land outside the outline of the top.");
    if (d.long_half < 3 || d.short_half < 3) probs.push("The legs are very close together.");
    return probs;
  }
  function tableFix(s) {
    for (let i = 0; i < 200 && tableFit(s).length; i++) {
      s.inset_x = Math.min(s.inset_x + 0.25, s.table_l / 2 - s.leg_sq - 2);
      s.inset_y = Math.min(s.inset_y + 0.125, s.table_w / 2 - s.leg_sq - 2);
      tableClamp(s);
    }
  }

  const TOP_PRESETS = [
    { id: "bevel", name: "Bevelled edge", p: { top_mode: "rect", corner_r: 0, top_bevel: 18.5, edge_r: 0 } },
    { id: "rounded", name: "Rounded", p: { top_mode: "rect", corner_r: 4, top_bevel: 0, edge_r: 0.125 } },
    { id: "se", name: "Superellipse", p: { top_mode: "se", se_n: 2.5, top_bevel: 0, edge_r: 0.125 } },
  ];
  const LEG_PRESETS = [
    { id: "square", name: "Square tapered", p: { leg_section: "square", foot: 1, splay_ang: 0 } },
    { id: "round", name: "Round tapered", p: { leg_section: "round", foot: 0.875, splay_ang: 0 } },
    { id: "splayed", name: "Splayed", p: { leg_section: "round", foot: 0.875, splay_ang: 8 } },
  ];
  const APRON_PRESETS = [
    { id: "straight", name: "Straight", p: { apron_h: 3, arch_rise: 0 } },
    { id: "arched", name: "Arched", p: { apron_h: 3, arch_rise: 1.25 } },
    { id: "slim", name: "Slim", p: { apron_h: 1.5, arch_rise: 0 } },
  ];
  const tableGroups = (sizeMax) => [
    { title: "Overall size", sliders: [
      ["table_l", "Length", sizeMax[0], sizeMax[1], 0.5, "in"],
      ["table_w", "Width", sizeMax[2], sizeMax[3], 0.5, "in"],
      ["table_h", "Height", 12, 30, 0.25, "in"],
      ["inset_x", "Legs in from the ends", 1.5, 16, 0.25, "in"],
      ["inset_y", "Legs in from the sides", 1.5, 10, 0.25, "in"]] },
    { title: "Top", presets: TOP_PRESETS, sliders: [
      ["top_mode", "Outline", [["rect", "Rectangle"], ["se", "Superellipse"]]],
      ["corner_r", "Corner radius", 0, 12, 0.125, "in", s => s.top_mode === "rect"],
      ["se_n", "Roundness (2 = oval, 6 = nearly square)", 2, 6, 0.05, "", s => s.top_mode === "se"],
      ["top_t", "Thickness", 0.625, 2, 0.0625, "in"],
      ["top_bevel", "Edge bevel (undercut)", 0, 30, 0.5, "°"],
      ["edge_r", "Edge round-over", 0, 0.5, 0.0625, "in"]] },
    { title: "Legs", presets: LEG_PRESETS, focus: "leg", sliders: [
      ["leg_section", "Section", [["square", "Square"], ["round", "Round"]]],
      ["leg_sq", "Thickness at the top", 1.125, 2.5, 0.0625, "in"],
      ["foot", "Foot size", 0.5, 2.5, 0.0625, "in", null, s => ({ max: s.leg_sq })],
      ["splay_ang", "Splay angle", 0, 15, 0.5, "°"]] },
    { title: "Aprons", presets: APRON_PRESETS, sliders: [
      ["apron_h", "Height", 1.5, 5, 0.125, "in"],
      ["apron_t", "Thickness", 0.625, 1.25, 0.0625, "in"],
      ["apron_set", "Set back from leg face", 0, 0.75, 0.0625, "in"],
      ["arch_rise", "Arch rise", 0, 3, 0.0625, "in", null, s => ({ max: Math.floor(s.apron_h * 0.6 * 16) / 16 })]] },
    { title: "Lower shelf", sliders: [
      ["shelf", "Shelf", [[0, "None"], [1, "Shelf"]]],
      ["shelf_h", "Shelf height", 3, 16, 0.25, "in", s => !!s.shelf]] },
  ];
  const TABLE_BASE = {
    top_mode: "rect", top_t: 1, corner_r: 0, se_n: 2.5, top_bevel: 18.5, edge_r: 0,
    leg_section: "square", leg_sq: 1.75, foot: 1, splay_ang: 0,
    apron_h: 3, apron_t: 0.75, apron_set: 0.25, arch_rise: 0, shelf: 0, shelf_h: 6,
  };

  // ------------------------------------------------------------------
  //  Seating (sofa, lounge chair)
  // ------------------------------------------------------------------
  function seatDerive(s) {
    const d = {};
    d.armW = s.arm_style === "track" ? s.arm_w : s.arm_style === "wood" ? 2.25 : 0;
    d.frameTop = s.leg_h + s.frame_h;
    d.seatT = Math.max(2, s.seat_h - d.frameTop);
    d.backT = s.back_t;
    d.innerW = s.width - 2 * d.armW;
    return d;
  }
  function seatClamp(s) {
    s.seat_h = Math.max(s.seat_h, s.leg_h + s.frame_h + 2);
    s.back_h = Math.max(s.back_h, s.seat_h + 8);
    s.foot = Math.min(s.foot, s.leg_top);
    s.arm_h = Math.max(s.arm_h, s.seat_h + 3);
    s.arm_h = Math.min(s.arm_h, s.back_h);
    s.width = Math.max(s.width, s.cushions * 18 + 2 * (s.arm_style === "track" ? s.arm_w : 2.25));
  }
  function seatBuild(s) {
    const d = seatDerive(s), W = s.width, D = s.depth;
    const wood = [], fabric = [];
    // legs at the corners of the frame
    const ls = new Soup(), lx = W / 2 - s.leg_in, lz = D / 2 - s.leg_in;
    for (const sx of [1, -1]) for (const sz of [1, -1])
      leg(ls, s.leg_section, sx * lx, sz * lz, s.leg_h, s.leg_top, s.foot, s.splay_ang, sx, sz, [lx, lz]);
    wood.push(ls.geometry(s.leg_section === "round" ? 30 : 20));
    // wooden base frame
    const fr = new Soup();
    fr.box(-W / 2, W / 2, s.leg_h, d.frameTop, -D / 2, D / 2);
    wood.push(fr.geometry());
    // back: upholstered panel leaning back by the recline angle
    const backH = s.back_h - d.frameTop;
    const zBack = -D / 2 + d.backT / 2;
    fabric.push(rbox(W - 2 * d.armW, backH, d.backT, 1.2, 0, d.frameTop + backH / 2, zBack, s.recline));
    // seat cushions
    const seatD = D - d.backT - 1, gap = 0.25;
    const cw = (d.innerW - gap * (s.cushions - 1)) / s.cushions;
    for (let i = 0; i < s.cushions; i++) {
      const x = -d.innerW / 2 + cw / 2 + i * (cw + gap);
      fabric.push(rbox(cw, d.seatT, seatD, Math.min(1.5, d.seatT / 2.2), x,
        d.frameTop + d.seatT / 2, D / 2 - seatD / 2));
    }
    // back cushions, leaning with the back
    if (s.back_cushions) {
      const bcH = Math.min(backH - d.seatT, s.back_h - s.seat_h - 1), bcT = 5;
      const lean = Math.tan(D2R(s.recline));
      for (let i = 0; i < s.cushions; i++) {
        const x = -d.innerW / 2 + cw / 2 + i * (cw + gap);
        const y0 = s.seat_h, zb = -D / 2 + d.backT + bcT / 2 - (y0 - d.frameTop) * lean;
        fabric.push(rbox(cw, bcH, bcT, 1.6, x, y0 + bcH / 2, zb + 0.2, s.recline));
      }
    }
    // arms
    if (s.arm_style === "track") {
      for (const sx of [1, -1])
        fabric.push(rbox(d.armW, s.arm_h - d.frameTop, D, 1.2, sx * (W / 2 - d.armW / 2),
          d.frameTop + (s.arm_h - d.frameTop) / 2, 0));
    } else if (s.arm_style === "wood") {
      // Danish open arm: armrest on a front post, carried back to the back
      const ar = new Soup(), aw = 2.25, at = 1;
      for (const sx of [1, -1]) {
        const x = sx * (W / 2 - aw / 2);
        ar.box(x - aw / 2, x + aw / 2, s.arm_h - at, s.arm_h, -D / 2 + 1, D / 2 - 0.5);
        ar.box(x - 0.6, x + 0.6, d.frameTop, s.arm_h - at, D / 2 - 3.5, D / 2 - 1.5);
        ar.box(x - 0.6, x + 0.6, d.frameTop, s.arm_h - at, -D / 2 + 1, -D / 2 + 3);
      }
      wood.push(ar.geometry());
    }
    return { parts: [{ geo: merge(wood), mat: "wood" }, { geo: merge(fabric), mat: "fabric" }],
      info: [`Seat depth ${(D - d.backT - 1).toFixed(1)} in`, `Leg taper ${taperDeg(s.leg_section, s.leg_top, s.foot, s.leg_h).toFixed(1)}°`] };
  }
  const seatGroups = (wRange) => [
    { title: "Overall size", sliders: [
      ["width", "Width", wRange[0], wRange[1], 0.5, "in"],
      ["depth", "Depth", 26, 40, 0.5, "in"],
      ["seat_h", "Seat height", 14, 20, 0.25, "in"],
      ["back_h", "Back height", 24, 40, 0.5, "in"],
      ["recline", "Back recline", 0, 25, 0.5, "°"]] },
    { title: "Arms", presets: [
      { id: "track", name: "Track arms", p: { arm_style: "track" } },
      { id: "wood", name: "Wood arms", p: { arm_style: "wood" } },
      { id: "none", name: "Armless", p: { arm_style: "none" } }], sliders: [
      ["arm_style", "Style", [["track", "Track"], ["wood", "Wood"], ["none", "None"]]],
      ["arm_h", "Arm height", 18, 30, 0.25, "in", s => s.arm_style !== "none"],
      ["arm_w", "Arm width", 3, 9, 0.25, "in", s => s.arm_style === "track"]] },
    { title: "Cushions", sliders: [
      ["cushions", "Seat cushions", 1, 4, 1, ""],
      ["back_cushions", "Back cushions", [[1, "Yes"], [0, "No"]]],
      ["back_t", "Back thickness", 3, 8, 0.25, "in"]] },
    { title: "Base and legs", presets: [
      { id: "tapered", name: "Tapered", p: { leg_section: "round", leg_h: 7, foot: 0.875, splay_ang: 0 } },
      { id: "splayed", name: "Splayed", p: { leg_section: "round", leg_h: 8, foot: 0.75, splay_ang: 12 } },
      { id: "square", name: "Square", p: { leg_section: "square", leg_h: 6, foot: 1.125, splay_ang: 0 } }],
      focus: "leg", sliders: [
      ["leg_section", "Section", [["square", "Square"], ["round", "Round"]]],
      ["leg_h", "Leg height", 3, 12, 0.25, "in"],
      ["leg_top", "Leg thickness at the top", 1.25, 2.5, 0.0625, "in"],
      ["foot", "Foot size", 0.5, 2.5, 0.0625, "in", null, s => ({ max: s.leg_top })],
      ["splay_ang", "Splay angle", 0, 18, 0.5, "°"],
      ["leg_in", "Legs in from the corners", 1, 6, 0.25, "in"],
      ["frame_h", "Wood frame height", 1.5, 5, 0.25, "in"]] },
  ];

  // ------------------------------------------------------------------
  //  Credenza / media console
  // ------------------------------------------------------------------
  function credenzaBuild(s) {
    const L = s.length, D = s.depth, H = s.height, t = s.case_t, y0 = s.leg_h;
    const wood = [], accent = [], brass = [], dark = [];
    const cs = new Soup();
    cs.box(-L / 2, L / 2, H - t, H, -D / 2, D / 2);                // top
    cs.box(-L / 2 + t, L / 2 - t, y0, y0 + t, -D / 2, D / 2 - t);  // bottom
    cs.box(-L / 2, -L / 2 + t, y0, H - t, -D / 2, D / 2);          // sides
    cs.box(L / 2 - t, L / 2, y0, H - t, -D / 2, D / 2);
    cs.box(-L / 2 + t, L / 2 - t, y0 + t, H - t, -D / 2, -D / 2 + 0.25); // back
    const n = s.bays, bay = (L - 2 * t - (n - 1) * t) / n;
    for (let i = 1; i < n; i++) {
      const x = -L / 2 + t + i * bay + (i - 1) * t;
      cs.box(x, x + t, y0 + t, H - t, -D / 2 + 0.25, D / 2 - 0.75);
    }
    // plinth or legs
    const ls = new Soup();
    if (s.leg_h > 0.1) {
      const lx = L / 2 - s.leg_in, lz = D / 2 - s.leg_in;
      for (const sx of [1, -1]) for (const sz of [1, -1])
        leg(ls, s.leg_section, sx * lx, sz * lz, y0, s.leg_top, s.foot, s.splay_ang, sx, sz, [lx, lz]);
    }
    wood.push(cs.geometry());
    if (ls.p.length) wood.push(ls.geometry(s.leg_section === "round" ? 30 : 20));
    // fronts, inset flush with a 1/16 in reveal
    const g = 1 / 16, fz0 = D / 2 - 0.75, fz1 = D / 2 - 0.02;
    const fy0 = y0 + t + g, fy1 = H - t - g;
    const fronts = new Soup(), pulls = new Soup(), backing = new Soup();
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + t + i * (bay + t) + g, x1 = x0 + bay - 2 * g;
      const drawers = s.front === "drawers" && (i === 0 || (n > 2 && i === n - 1));
      if (s.front === "slats" && !drawers) {
        backing.box(x0, x1, fy0, fy1, fz0 - 0.25, fz0);
        const sw = s.slat_w, gap = 0.3125, count = Math.max(2, Math.floor((x1 - x0 + gap) / (sw + gap)));
        const real = (x1 - x0 - gap * (count - 1)) / count;
        for (let k = 0; k < count; k++) {
          const sx0 = x0 + k * (real + gap);
          fronts.box(sx0, sx0 + real, fy0, fy1, fz0, fz1);
        }
      } else if (drawers) {
        const rows = 3, hh = (fy1 - fy0 - g * 2 * (rows - 1)) / rows;
        for (let r = 0; r < rows; r++) {
          const ya = fy0 + r * (hh + 2 * g), yb = ya + hh;
          fronts.box(x0, x1, ya, yb, fz0, fz1);
          if (s.pulls) pulls.box((x0 + x1) / 2 - 2, (x0 + x1) / 2 + 2, yb - 1.1, yb - 0.6, fz1, fz1 + 0.5);
        }
      } else {
        fronts.box(x0, x1, fy0, fy1, fz0, fz1);
        if (s.pulls) {
          const px = i % 2 === 0 ? x1 - 1.2 : x0 + 1.2;
          pulls.box(px - 0.25, px + 0.25, fy1 - 6, fy1 - 1.5, fz1, fz1 + 0.5);
        }
      }
    }
    (s.front_color === "wood" ? wood : accent).push(fronts.geometry());
    if (backing.p.length) dark.push(backing.geometry());
    if (pulls.p.length) brass.push(pulls.geometry());
    const out = [{ geo: merge(wood), mat: "wood" }];
    if (accent.length) out.push({ geo: merge(accent), mat: "accent" });
    if (brass.length) out.push({ geo: merge(brass), mat: "brass" });
    if (dark.length) out.push({ geo: merge(dark), mat: "dark" });
    return { parts: out, info: [`Bays ${bay.toFixed(1)} in wide`, `Inside height ${(H - y0 - 2 * t).toFixed(1)} in`] };
  }

  // ------------------------------------------------------------------
  //  Bookcase / shelving
  // ------------------------------------------------------------------
  function bookcaseBuild(s) {
    const W = s.width, H = s.height, D = s.depth, t = s.shelf_t, y0 = s.leg_h;
    const so = new Soup(), ls = new Soup();
    const n = s.shelves;                     // fixed shelves incl. top and bottom
    if (s.style === "case") {
      so.box(-W / 2, -W / 2 + t, y0, H, -D / 2, D / 2);
      so.box(W / 2 - t, W / 2, y0, H, -D / 2, D / 2);
      const inner = (H - y0 - t) / (n - 1);
      for (let i = 0; i < n; i++) {
        const y = y0 + i * inner;
        so.box(-W / 2 + t, W / 2 - t, y, y + t, -D / 2, D / 2);
      }
      if (s.back) so.box(-W / 2 + t, W / 2 - t, y0 + t, H - t, -D / 2, -D / 2 + 0.25);
    } else {
      // open frame: four posts, shelves between them (Danish ladder style)
      const p = s.post;
      for (const sx of [1, -1]) for (const sz of [1, -1])
        so.box(sx * W / 2, sx * (W / 2 - p), y0 > 0.1 ? y0 : 0, H, sz * D / 2, sz * (D / 2 - p));
      const inner = (H - (y0 > 0.1 ? y0 : 0) - 4 - t) / (n - 1);
      for (let i = 0; i < n; i++) {
        const y = (y0 > 0.1 ? y0 : 0) + 3 + i * inner;
        so.box(-W / 2 + p, W / 2 - p, y, y + t, -D / 2, D / 2);
      }
      for (const sx of [1, -1]) {      // side rails
        so.box(sx * W / 2, sx * (W / 2 - p * 0.75), H - 3, H - 1.5, -D / 2 + p, D / 2 - p);
        so.box(sx * W / 2, sx * (W / 2 - p * 0.75), (y0 > 0.1 ? y0 : 0) + 1, (y0 > 0.1 ? y0 : 0) + 2.5, -D / 2 + p, D / 2 - p);
      }
    }
    if (y0 > 0.1 && s.style === "case") {
      const lx = W / 2 - s.leg_in, lz = D / 2 - s.leg_in;
      for (const sx of [1, -1]) for (const sz of [1, -1])
        leg(ls, s.leg_section, sx * lx, sz * lz, y0, s.leg_top, s.foot, s.splay_ang, sx, sz, [lx, lz]);
    }
    const parts = [so.geometry()];
    if (ls.p.length) parts.push(ls.geometry(s.leg_section === "round" ? 30 : 20));
    return { parts: [{ geo: merge(parts), mat: "wood" }],
      info: [`Shelf spacing ${((H - y0) / (n - 1)).toFixed(1)} in`] };
  }

  // ------------------------------------------------------------------
  //  Types
  // ------------------------------------------------------------------
  const MATERIAL_GROUP = (fabric, accent) => ({ title: "Materials", materials: { fabric, accent } });

  const types = [
    {
      id: "coffee_table", name: "Coffee table", room: { wall: false },
      defaults: { ...TABLE_BASE, table_l: 48, table_w: 22, table_h: 16, inset_x: 5, inset_y: 3.5 },
      groups: [...tableGroups([30, 72, 16, 36]), MATERIAL_GROUP(false, false)],
      build: tableBuild, clamp: tableClamp, fit: tableFit, fix: tableFix,
    },
    {
      id: "side_table", name: "Side table", room: { wall: false },
      defaults: { ...TABLE_BASE, table_l: 20, table_w: 20, table_h: 22, inset_x: 3, inset_y: 3,
        top_mode: "se", se_n: 2, top_bevel: 0, edge_r: 0.125, leg_section: "round", leg_sq: 1.5,
        foot: 0.75, splay_ang: 6, apron_h: 2.5, shelf: 1, shelf_h: 8 },
      groups: [...tableGroups([14, 30, 14, 30]), MATERIAL_GROUP(false, false)],
      build: tableBuild, clamp: tableClamp, fit: tableFit, fix: tableFix,
    },
    {
      id: "sofa", name: "Sofa", room: { wall: true },
      defaults: { width: 84, depth: 34, seat_h: 17, back_h: 31, recline: 8, arm_style: "track", arm_h: 24,
        arm_w: 6, cushions: 3, back_cushions: 1, back_t: 5, leg_section: "round", leg_h: 7, leg_top: 1.75,
        foot: 0.875, splay_ang: 0, leg_in: 2.5, frame_h: 3, fabric: "mustard", finish: "walnut" },
      groups: [...seatGroups([48, 108]), MATERIAL_GROUP(true, false)],
      build: seatBuild, clamp: seatClamp,
    },
    {
      id: "lounge_chair", name: "Lounge chair", room: { wall: false },
      defaults: { width: 30, depth: 32, seat_h: 16, back_h: 31, recline: 16, arm_style: "wood", arm_h: 23,
        arm_w: 4, cushions: 1, back_cushions: 1, back_t: 3.5, leg_section: "round", leg_h: 8, leg_top: 1.625,
        foot: 0.75, splay_ang: 10, leg_in: 2, frame_h: 2.5, fabric: "olive", finish: "teak" },
      groups: [...seatGroups([24, 40]), MATERIAL_GROUP(true, false)],
      build: seatBuild, clamp: seatClamp,
    },
    {
      id: "credenza", name: "Credenza", room: { wall: true },
      defaults: { length: 64, depth: 18, height: 26, case_t: 0.75, bays: 3, front: "doors", slat_w: 1.25,
        pulls: 1, front_color: "wood", leg_h: 7, leg_section: "round", leg_top: 1.625, foot: 0.875,
        splay_ang: 6, leg_in: 2.5, accent: "white", finish: "walnut" },
      groups: [
        { title: "Overall size", sliders: [
          ["length", "Length", 30, 96, 0.5, "in"], ["depth", "Depth", 14, 24, 0.25, "in"],
          ["height", "Height", 18, 36, 0.25, "in"], ["case_t", "Panel thickness", 0.5, 1.25, 0.0625, "in"]] },
        { title: "Fronts", presets: [
          { id: "doors", name: "Doors", p: { front: "doors", front_color: "wood", pulls: 1 } },
          { id: "slats", name: "Slatted", p: { front: "slats", front_color: "wood", pulls: 0 } },
          { id: "drawers", name: "Drawers + doors", p: { front: "drawers", front_color: "accent", pulls: 1 } }],
          sliders: [
          ["front", "Style", [["doors", "Doors"], ["slats", "Slats"], ["drawers", "Drawers"]]],
          ["bays", "Bays", 2, 5, 1, ""],
          ["slat_w", "Slat width", 0.75, 2.5, 0.125, "in", s => s.front === "slats"],
          ["front_color", "Front colour", [["wood", "Wood"], ["accent", "Accent"]]],
          ["pulls", "Brass pulls", [[1, "Yes"], [0, "No"]]]] },
        { title: "Legs", presets: [
          { id: "tapered", name: "Tapered", p: { leg_section: "round", leg_h: 7, splay_ang: 0 } },
          { id: "splayed", name: "Splayed", p: { leg_section: "round", leg_h: 8, splay_ang: 10 } },
          { id: "plinth", name: "Low square", p: { leg_section: "square", leg_h: 4, splay_ang: 0 } }],
          focus: "leg", sliders: [
          ["leg_section", "Section", [["square", "Square"], ["round", "Round"]]],
          ["leg_h", "Leg height", 3, 14, 0.25, "in"],
          ["leg_top", "Leg thickness at the top", 1.25, 2.5, 0.0625, "in"],
          ["foot", "Foot size", 0.5, 2.5, 0.0625, "in", null, s => ({ max: s.leg_top })],
          ["splay_ang", "Splay angle", 0, 15, 0.5, "°"],
          ["leg_in", "Legs in from the corners", 1, 8, 0.25, "in"]] },
        MATERIAL_GROUP(false, true),
      ],
      build: credenzaBuild,
      clamp: s => { s.foot = Math.min(s.foot, s.leg_top); s.leg_h = Math.min(s.leg_h, s.height - 10); },
    },
    {
      id: "bookcase", name: "Bookcase", room: { wall: true },
      defaults: { width: 36, height: 60, depth: 12, shelf_t: 0.75, shelves: 5, style: "case", back: 1, post: 1.5,
        leg_h: 5, leg_section: "round", leg_top: 1.5, foot: 0.875, splay_ang: 4, leg_in: 2, finish: "teak" },
      groups: [
        { title: "Overall size", sliders: [
          ["width", "Width", 18, 96, 0.5, "in"], ["height", "Height", 24, 84, 0.5, "in"],
          ["depth", "Depth", 8, 18, 0.25, "in"]] },
        { title: "Style", presets: [
          { id: "case", name: "Case on legs", p: { style: "case", back: 1, leg_h: 5, shelves: 5 } },
          { id: "frame", name: "Open frame", p: { style: "frame", leg_h: 0, shelves: 5 } },
          { id: "low", name: "Low and wide", p: { style: "case", back: 1, leg_h: 6, shelves: 3, width: 60, height: 30 } }],
          sliders: [
          ["style", "Style", [["case", "Case"], ["frame", "Open frame"]]],
          ["shelves", "Shelves (incl. top and bottom)", 2, 8, 1, ""],
          ["shelf_t", "Shelf thickness", 0.5, 1.5, 0.0625, "in"],
          ["back", "Back panel", [[1, "Yes"], [0, "No"]], s => s.style === "case"],
          ["post", "Post size", 1, 2.5, 0.125, "in", s => s.style === "frame"]] },
        { title: "Legs", focus: "leg", sliders: [
          ["leg_h", "Leg height (0 = on the floor)", 0, 12, 0.25, "in"],
          ["leg_section", "Section", [["square", "Square"], ["round", "Round"]], s => s.style === "case" && s.leg_h > 0],
          ["foot", "Foot size", 0.5, 2, 0.0625, "in", s => s.style === "case" && s.leg_h > 0, s => ({ max: s.leg_top })],
          ["splay_ang", "Splay angle", 0, 12, 0.5, "°", s => s.style === "case" && s.leg_h > 0]] },
        MATERIAL_GROUP(false, false),
      ],
      build: bookcaseBuild,
      clamp: s => { s.foot = Math.min(s.foot, s.leg_top); s.leg_h = Math.min(s.leg_h, s.height / 3); },
    },
  ];
  for (const t of types) {
    t.defaults = { finish: "walnut", fabric: "mustard", accent: "white", ...t.defaults };
    t.clamp = t.clamp || (() => {});
    t.fit = t.fit || (() => []);
  }
  return { types, merge };
}
