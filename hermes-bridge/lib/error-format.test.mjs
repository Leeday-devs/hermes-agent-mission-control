import { test } from "node:test";
import assert from "node:assert/strict";
import { formatProcessError } from "./error-format.mjs";

test("prefers stderr content over the generic 'Command failed' echo", () => {
  const err = {
    message: 'Command failed: hermes -z "do it"\nError: invalid board name',
    stderr: "Error: invalid board name\n",
  };
  const out = formatProcessError(err);
  assert.match(out, /invalid board name/);
  assert.doesNotMatch(out, /Command failed/);
});

test("falls back to the message with the 'Command failed' echo stripped when stderr is empty", () => {
  const err = {
    message: 'Command failed: hermes -z "do it"\nsomething went wrong down here',
    stderr: "",
  };
  const out = formatProcessError(err);
  assert.match(out, /something went wrong down here/);
  assert.doesNotMatch(out, /Command failed/);
});

test("redacts KEY=VALUE style secrets (e.g. DATABASE_URL, tokens)", () => {
  const err = {
    stderr: "connecting with DATABASE_URL=postgres://db-user:db-password@db.internal:5432/hq\nauth failed",
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /db-password/);
  assert.match(out, /auth failed/);
  assert.match(out, /\[redacted\]/);
});

test("redacts credentials embedded in URLs", () => {
  const err = { stderr: "fetch failed: https://alice:s3cr3t@api.example.com/v1/run" };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /s3cr3t/);
  assert.doesNotMatch(out, /alice:s3cr3t/);
});

test("redacts an Authorization: Bearer token", () => {
  const err = {
    stderr: "request failed: 401\nAuthorization: Bearer sk-abc123xyz\nauth required",
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /sk-abc123xyz/);
  assert.match(out, /\[redacted\]/);
  assert.match(out, /auth required/);
});

test("redacts a JSON apiKey value", () => {
  const err = {
    stderr: '{"apiKey":"sk-live-abcdef123456","status":"error"}\nrequest rejected',
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /sk-live-abcdef123456/);
  assert.match(out, /\[redacted\]/);
  assert.match(out, /request rejected/);
});

test("redacts a JSON token value", () => {
  const err = {
    stderr: '{"token": "abc.def.ghijkl"}\nrequest rejected',
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /abc\.def\.ghijkl/);
  assert.match(out, /\[redacted\]/);
});

test("redacts a --token CLI flag value", () => {
  const err = {
    stderr: "running: hermes push --token abcd1234efgh --board x\nauthentication rejected",
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /abcd1234efgh/);
  assert.match(out, /\[redacted\]/);
  assert.match(out, /authentication rejected/);
});

test("redacts a --password CLI flag value", () => {
  const err = {
    stderr: "login --password Sup3rSecret! failed\nbad credentials",
  };
  const out = formatProcessError(err);
  assert.doesNotMatch(out, /Sup3rSecret!/);
  assert.match(out, /\[redacted\]/);
  assert.match(out, /bad credentials/);
});

test("drops stack-trace noise but keeps the actionable error line", () => {
  const err = {
    stderr:
      "TypeError: cannot read board\n" +
      "    at Object.<anonymous> (/usr/local/lib/hermes/cli.js:42:11)\n" +
      "    at Module._compile (node:internal/modules/cjs/loader:1105:14)",
  };
  const out = formatProcessError(err);
  assert.match(out, /TypeError: cannot read board/);
  assert.doesNotMatch(out, /at Object\.<anonymous>/);
  assert.doesNotMatch(out, /at Module\._compile/);
});

test("falls back to message content when nonempty stderr contains only stack frames", () => {
  const err = {
    message: 'Command failed: hermes -z "run"\nTypeError: cannot read board',
    stderr:
      "    at Object.<anonymous> (/usr/local/lib/hermes/cli.js:42:11)\n" +
      "    at Module._compile (node:internal/modules/cjs/loader:1105:14)",
  };
  const out = formatProcessError(err);
  assert.match(out, /TypeError: cannot read board/);
  assert.doesNotMatch(out, /at Object\.<anonymous>/);
  assert.doesNotMatch(out, /at Module\._compile/);
  assert.doesNotMatch(out, /Command failed:/);
});

test("reports a timeout/signal kill clearly when there is no useful stderr", () => {
  const err = {
    message: 'Command failed: hermes -z "long task"',
    stderr: "",
    killed: true,
    signal: "SIGTERM",
  };
  const out = formatProcessError(err);
  assert.match(out, /SIGTERM/);
  assert.doesNotMatch(out, /Command failed/);
});

test("caps the output length", () => {
  const err = { stderr: "x".repeat(2000) };
  const out = formatProcessError(err, { maxLength: 200 });
  assert.ok(out.length <= 200);
});

test("falls back to a generic message when there is nothing usable", () => {
  const out = formatProcessError({});
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("never throws on non-Error input", () => {
  assert.doesNotThrow(() => formatProcessError(null));
  assert.doesNotThrow(() => formatProcessError(undefined));
  assert.doesNotThrow(() => formatProcessError("plain string failure"));
  assert.match(formatProcessError("plain string failure"), /plain string failure/);
});

test("includes the exit code when present, for actionable diagnosis", () => {
  const err = { stderr: "permission denied", code: 126 };
  const out = formatProcessError(err);
  assert.match(out, /permission denied/);
  assert.match(out, /126/);
});
