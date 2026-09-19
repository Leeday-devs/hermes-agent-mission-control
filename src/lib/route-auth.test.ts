import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedRequest } from "./route-auth";

function reqWith(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/hermes/crons", { headers });
}

test("dev bypass authorizes regardless of headers or session", async () => {
  const ok = await isAuthorizedRequest(reqWith(), {
    isDevelopment: true,
    getSession: async () => null,
  });
  assert.equal(ok, true);
});

test("a matching internal secret header authorizes without checking session", async () => {
  let sessionChecked = false;
  const ok = await isAuthorizedRequest(reqWith({ "x-internal-secret": "s3cret" }), {
    isDevelopment: false,
    internalSecret: "s3cret",
    getSession: async () => {
      sessionChecked = true;
      return null;
    },
  });
  assert.equal(ok, true);
  assert.equal(sessionChecked, false);
});

test("a missing or mismatched internal secret falls through to the session check", async () => {
  const noHeader = await isAuthorizedRequest(reqWith(), {
    isDevelopment: false,
    internalSecret: "s3cret",
    getSession: async () => null,
  });
  assert.equal(noHeader, false);

  const wrongHeader = await isAuthorizedRequest(reqWith({ "x-internal-secret": "nope" }), {
    isDevelopment: false,
    internalSecret: "s3cret",
    getSession: async () => null,
  });
  assert.equal(wrongHeader, false);
});

test("an empty configured internal secret never matches an empty header", async () => {
  const ok = await isAuthorizedRequest(reqWith({ "x-internal-secret": "" }), {
    isDevelopment: false,
    internalSecret: "",
    getSession: async () => null,
  });
  assert.equal(ok, false);
});

test("a live session authorizes when there is no internal secret match", async () => {
  const ok = await isAuthorizedRequest(reqWith(), {
    isDevelopment: false,
    internalSecret: "s3cret",
    getSession: async () => ({ user: { email: "leedaydevs@gmail.com" } }),
  });
  assert.equal(ok, true);
});

test("no session and no secret match is unauthorized", async () => {
  const ok = await isAuthorizedRequest(reqWith(), {
    isDevelopment: false,
    internalSecret: "s3cret",
    getSession: async () => null,
  });
  assert.equal(ok, false);
});
