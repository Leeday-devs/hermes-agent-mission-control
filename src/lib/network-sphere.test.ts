import { test } from "node:test";
import assert from "node:assert/strict";
import { fibonacciSphereLayout, rotationToFace, generateStarfield } from "./network-sphere";

function magnitude(v: { x: number; y: number; z: number }) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

test("fibonacciSphereLayout returns an empty map for no ids", () => {
  const layout = fibonacciSphereLayout([]);
  assert.equal(layout.size, 0);
});

test("fibonacciSphereLayout places every id on the unit sphere", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const layout = fibonacciSphereLayout(ids);
  assert.equal(layout.size, ids.length);
  for (const id of ids) {
    const v = layout.get(id)!;
    assert.ok(Math.abs(magnitude(v) - 1) < 1e-9, `${id} should be on the unit sphere`);
  }
});

test("fibonacciSphereLayout is deterministic regardless of input order", () => {
  const a = fibonacciSphereLayout(["x", "y", "z"]);
  const b = fibonacciSphereLayout(["z", "x", "y"]);
  for (const id of ["x", "y", "z"]) {
    assert.deepEqual(a.get(id), b.get(id));
  }
});

test("rotationToFace returns zero rotation when a point already faces the camera", () => {
  const r = rotationToFace({ x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(r.y) < 1e-9);
  assert.ok(Math.abs(r.x) < 1e-9);
});

test("rotationToFace derives a yaw that brings a point on the x-axis to center", () => {
  const r = rotationToFace({ x: 1, y: 0, z: 0 });
  assert.ok(Math.abs(r.y - -Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(r.x) < 1e-9);
});

test("rotationToFace derives a pitch that brings a point on the y-axis to center", () => {
  const r = rotationToFace({ x: 0, y: 1, z: 0 });
  assert.ok(Math.abs(r.y) < 1e-9);
  assert.ok(Math.abs(r.x - Math.PI / 2) < 1e-9);
});

test("generateStarfield is deterministic for a given seed and count", () => {
  const a = generateStarfield(20, 7);
  const b = generateStarfield(20, 7);
  assert.deepEqual(a, b);
  assert.equal(a.length, 20);
  for (const star of a) {
    assert.ok(star.x >= 0 && star.x < 1);
    assert.ok(star.y >= 0 && star.y < 1);
    assert.ok(star.r > 0);
    assert.ok(star.a > 0 && star.a <= 1);
  }
});
