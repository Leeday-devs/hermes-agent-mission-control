// Turns a child-process failure (execFile/exec rejection, or any
// Error-shaped value) into a safe, concise diagnostic string suitable for
// persisting to AgentRequest.error, AgentEvent.detail, and logs.
//
// execFile (promisified) rejects with an Error whose `.message` is the
// unhelpful "Command failed: <argv echo>\n<stderr>" — operators can't
// diagnose a failure from that alone. This prefers the real `.stderr`,
// strips the "Command failed" echo, drops stack-trace noise, redacts
// anything that looks like an env value/secret, and caps the result.

const DEFAULT_MAX_LENGTH = 700;
const MAX_LINES = 6;

const COMMAND_FAILED_RE = /^Command failed:.*$/;
const STACK_FRAME_RE = /^\s*at\s/;

// KEY=VALUE / KEY: VALUE where the key looks like a credential.
const SENSITIVE_KV_RE =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIAL|AUTH|COOKIE|DATABASE_URL|DSN)[A-Za-z0-9_]*)\s*[:=]\s*(\S+)/gi;
// scheme://user:pass@host
const URL_CREDENTIALS_RE = /(:\/\/)([^/\s:@]+):([^/\s:@]+)@/g;
// Authorization: Bearer <token> header dumps
const AUTH_BEARER_RE = /\b(authorization\s*:\s*bearer\s+)(\S+)/gi;
// "apiKey": "value" / "token": "value" (JSON-quoted key/value pairs)
const JSON_SENSITIVE_RE =
  /("(?:[A-Za-z0-9_]*(?:api[-_]?key|token)[A-Za-z0-9_]*)"\s*:\s*)"([^"]*)"/gi;
// --token/--password CLI flags (space- or "="-separated)
const CLI_FLAG_SECRET_RE = /(--(?:token|password)[= ])(\S+)/gi;

function redactSecrets(line) {
  return line
    .replace(URL_CREDENTIALS_RE, "$1[redacted]@")
    .replace(AUTH_BEARER_RE, "$1[redacted]")
    .replace(JSON_SENSITIVE_RE, '$1"[redacted]"')
    .replace(CLI_FLAG_SECRET_RE, "$1[redacted]")
    .replace(SENSITIVE_KV_RE, "$1=[redacted]");
}

function actionableLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !COMMAND_FAILED_RE.test(l) && !STACK_FRAME_RE.test(l))
    .map(redactSecrets);
}

function signalDiagnosis(err) {
  if (err.signal) {
    return err.killed
      ? `Command timed out and was killed (signal ${err.signal})`
      : `Command terminated by signal ${err.signal}`;
  }
  return "";
}

export function formatProcessError(error, { maxLength = DEFAULT_MAX_LENGTH } = {}) {
  let lines = [];
  let code;

  if (error && typeof error === "object") {
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const message = typeof error.message === "string" ? error.message : "";
    code = typeof error.code === "number" ? error.code : undefined;

    lines = actionableLines(stderr);
    if (lines.length === 0 && message) {
      // stderr was present but held only noise (e.g. stack frames); the
      // message may still carry the real reason.
      lines = actionableLines(message);
    }
    if (lines.length === 0) {
      const signal = signalDiagnosis(error);
      if (signal) lines = [signal];
    }
  } else if (typeof error === "string") {
    lines = actionableLines(error);
  }

  if (lines.length === 0) {
    lines = ["Command failed (no further details available)"];
  }

  if (code !== undefined) lines.push(`[exit ${code}]`);

  let out = lines.slice(0, MAX_LINES).join("\n");
  if (out.length > maxLength) {
    out = `${out.slice(0, Math.max(0, maxLength - 1))}…`;
  }
  return out;
}
