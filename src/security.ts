import { open } from "node:fs/promises";
import type { SecurityCode, SecurityFinding, SkillFile } from "./types.js";

const MAX_SCAN_BYTES = 512 * 1024;
const MAX_MATCHES_PER_RULE_PER_FILE = 3;
const SCAN_CONCURRENCY = 16;

interface SecurityRule {
  code: SecurityCode;
  severity: "error" | "warning" | "info";
  pattern: RegExp;
  message: string;
  guard?: (match: string, line: string) => boolean;
}

const PLACEHOLDER_HINTS = [
  "example",
  "sample",
  "placeholder",
  "your",
  "xxxx",
  "....",
  "<",
  ">",
  "redacted",
  "changeme",
  "dummy",
  "abc123",
  "123456",
  "password123",
  "letmein",
];

function looksLikePlaceholder(match: string): boolean {
  const lower = match.toLowerCase();
  if (PLACEHOLDER_HINTS.some((hint) => lower.includes(hint))) return true;
  const distinct = new Set(lower.replace(/[^a-z0-9]/g, "")).size;
  return distinct < 6;
}

function realSecret(match: string): boolean {
  return !looksLikePlaceholder(match);
}

const RULES: SecurityRule[] = [
  {
    code: "remote-exec",
    severity: "error",
    pattern: /\b(?:curl|wget)\b[^\n|]{0,200}\|\s*(?:sudo\s+)?(?:env\s+)?(?:ba|z|fi|da)?sh\b|\b(?:iwr|irm|invoke-(?:webrequest|restmethod))\b[^\n|]{0,120}\|\s*iex\b/i,
    message: "Downloads and pipes a remote script into a shell",
  },
  {
    code: "eval-remote",
    severity: "warning",
    pattern: /\b(?:eval|source)\s+["'`]?\$\(\s*(?:curl|wget)\b|\b(?:bash|sh|zsh|source)\s+<\(\s*(?:curl|wget)\b/i,
    message: "Evaluates a script fetched from the network",
  },
  {
    code: "credential",
    severity: "error",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    message: "Possible AWS access key ID",
    guard: realSecret,
  },
  {
    code: "credential",
    severity: "error",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    message: "Possible GitHub token",
    guard: realSecret,
  },
  {
    code: "credential",
    severity: "error",
    pattern: /\bsk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{24,}\b/,
    message: "Possible API secret key",
    guard: realSecret,
  },
  {
    code: "credential",
    severity: "error",
    pattern: /\bsk_live_[A-Za-z0-9]{10,}\b/,
    message: "Possible Stripe live secret key",
    guard: realSecret,
  },
  {
    code: "credential",
    severity: "error",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
    message: "Possible Slack token",
    guard: realSecret,
  },
  {
    code: "credential",
    severity: "error",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    message: "Embedded private key block",
  },
  {
    code: "credential",
    severity: "info",
    pattern: /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
    message: "Hardcoded credential-style assignment (often a docs example)",
    guard: realSecret,
  },
  {
    code: "sensitive-file",
    severity: "warning",
    pattern: /~\/\.ssh\b|\.ssh\/id_[a-z0-9]+|\.aws\/credentials\b|\/etc\/(?:passwd|shadow)\b|\.netrc\b|security\s+find-(?:generic|internet)-password/i,
    message: "References credential or key files on disk",
  },
  {
    code: "prompt-injection",
    severity: "warning",
    pattern:
      /ignore\s+(?:all\s+)?(?:previous|prior|earlier|above)\s+instructions|disregard\s+(?:all\s+)?(?:previous|prior|earlier)\s+(?:instructions|rules)|do\s+not\s+(?:tell|inform|notify|reveal\s+(?:this\s+)?to|mention\s+(?:this\s+)?to)\s+the\s+user|without\s+(?:telling|informing|notifying|asking)\s+the\s+user|hide\s+(?:this|it|these\s+actions?)\s+from\s+the\s+user|keep\s+this\s+(?:hidden|secret)\s+from\s+the\s+user/i,
    message: "Instruction tries to override agent behavior or hide actions from the user",
  },
  {
    code: "exfiltration",
    severity: "warning",
    pattern: /\b(?:send|post|upload|forward|transmit|exfiltrate|share)\b/i,
    message: "Instruction to transmit secrets or environment data over the network",
    guard: (_match, line) =>
      /\b(?:\.env\b|credentials?|secrets?|tokens?|api[\s_-]?keys?|passwords?|private\s+keys?|environment\s+variables?)\b/i.test(line) &&
      /https?:\/\/|\bwebhook\b|\bendpoint\b|\bremote\s+server\b/i.test(line),
  },
  {
    code: "permission-bypass",
    severity: "warning",
    pattern: /--dangerously-skip-permissions\b|--yolo\b|--trust-all-tools\b|--no-sandbox\b|--allow-all\b/,
    message: "Instructs the agent to bypass permission prompts or sandboxing",
  },
  {
    code: "destructive",
    severity: "warning",
    pattern: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(?:\/(?=[\s"'`]|$)|~\/?(?=[\s"'`]|$)|"?\$HOME\b)|:\(\)\s*\{\s*:\|:&\s*\};?:/,
    message: "Destructive filesystem command targeting home or root",
  },
  {
    code: "obfuscation",
    severity: "info",
    pattern: /[A-Za-z0-9+/]{300,}={0,2}/,
    message: "Long base64-like blob (possible obfuscated payload)",
  },
];

async function readCapped(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const bytes = Math.min(size, MAX_SCAN_BYTES);
    if (bytes === 0) return "";
    const buffer = Buffer.alloc(bytes);
    await handle.read(buffer, 0, bytes, 0);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

export function scanText(text: string, path: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const counts = new Map<SecurityRule, number>();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    for (const rule of RULES) {
      if ((counts.get(rule) ?? 0) >= MAX_MATCHES_PER_RULE_PER_FILE) continue;
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (rule.guard && !rule.guard(match[0], line)) continue;
      counts.set(rule, (counts.get(rule) ?? 0) + 1);
      findings.push({
        code: rule.code,
        severity: rule.severity,
        message: rule.message,
        path,
        line: index + 1,
        excerpt: line.trim().slice(0, 120),
      });
    }
  }
  return findings;
}

export async function scanSecurity(files: SkillFile[]): Promise<SecurityFinding[]> {
  const queue = [...files];
  const findings: SecurityFinding[] = [];
  async function worker(): Promise<void> {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      let text: string;
      try {
        text = await readCapped(file.path);
      } catch {
        continue;
      }
      findings.push(...scanText(text, file.path));
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, queue.length || 1) }, worker));
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path) || a.line - b.line,
  );
  return findings;
}
