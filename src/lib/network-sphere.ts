// ─── Network globe math ────────────────────────────────────
// Pure geometry helpers for the 3D globe: a deterministic sphere
// layout, the rotation needed to bring a point to face the camera,
// and a deterministic decorative starfield. No DOM/canvas here —
// keeps the math testable independent of rendering.

export type Vec3 = { x: number; y: number; z: number };

export function fibonacciSphereLayout(ids: string[]): Map<string, Vec3> {
  const sorted = [...ids].sort();
  const n = sorted.length;
  const map = new Map<string, Vec3>();
  if (n === 0) return map;
  const offset = 2 / n;
  const increment = Math.PI * (3 - Math.sqrt(5));
  sorted.forEach((id, i) => {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    map.set(id, { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r });
  });
  return map;
}

// The yaw (y) then pitch (x) rotation that, applied in that order to
// v, brings it to (0, 0, 1) — centered on screen and closest to the
// camera. Used to animate the globe to "face" a selected node.
export function rotationToFace(v: Vec3): { y: number; x: number } {
  const hyp = Math.sqrt(v.x * v.x + v.z * v.z);
  return {
    y: Math.atan2(-v.x, v.z),
    x: Math.atan2(v.y, hyp),
  };
}

export interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}

// A small deterministic PRNG (LCG) so the starfield is stable across
// renders and reduced-motion safe (nothing here ever animates).
export function generateStarfield(count: number, seed = 1): Star[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: rand(), y: rand(), r: 0.4 + rand() * 1.1, a: 0.15 + rand() * 0.5 });
  }
  return stars;
}
