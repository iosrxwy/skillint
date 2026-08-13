import { createInterface } from "node:readline";
import { discover } from "./discover.js";
import { doctor, healthScore, summarizeTokens } from "./doctor.js";
import { planPrune } from "./prune.js";
import { scanRemoteRepo } from "./remote.js";
import { scanSecurity } from "./security.js";
import { trashCommand } from "./trash.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "skill_checkup",
    description:
      "Scan every installed agent skill (Cursor, Claude Code, Codex, Grok, Gemini, Copilot, and more) and return a health summary: counts, token estimates, duplicates, and top problems. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory to include (defaults to the server's cwd)" },
      },
    },
  },
  {
    name: "skill_audit",
    description:
      "Security-scan every installed skill for dangerous patterns: curl|bash pipes, leaked credentials, prompt injection, permission bypass flags, exfiltration wording. Returns findings with file:line receipts. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["error", "warning", "info"], description: "Minimum severity to include (default warning)" },
        limit: { type: "number", description: "Max findings to return (default 50)" },
      },
    },
  },
  {
    name: "skill_cleanup_plan",
    description:
      "Return the undoable cleanup plan: duplicates, backups, and junk that are safe to quarantine, with the exact `skillint trash` commands. Never deletes anything itself.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "scan_skill_repo",
    description:
      "Audit a public GitHub skill repository BEFORE installing it (owner/repo). Shallow-clones to a cache and pattern-scans every SKILL.md — nothing is executed. Returns a verdict: clean, caution, or risky.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "GitHub repository as owner/repo, or a local path" },
      },
      required: ["repo"],
    },
  },
] as const;

async function runCheckup(cwd?: string): Promise<unknown> {
  const result = await discover({ cwd });
  const findings = doctor(result.files);
  const summary = summarizeTokens(result.files);
  const health = healthScore(result.files, findings);
  const byCode = new Map<string, number>();
  for (const finding of findings) byCode.set(finding.code, (byCode.get(finding.code) ?? 0) + 1);
  return {
    health,
    skills: summary.skills,
    rules: summary.rules,
    metaTokens: summary.metaTokens,
    bodyTokens: summary.bodyTokens,
    fullContextWindows: Math.max(1, Math.round(summary.bodyTokens / 128000)),
    problemsByRule: Object.fromEntries([...byCode.entries()].sort((a, b) => b[1] - a[1])),
    hint: "Use skill_audit for security findings and skill_cleanup_plan for safe deletions.",
  };
}

async function runAudit(severity = "warning", limit = 50): Promise<unknown> {
  const rank: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const threshold = rank[severity] ?? 1;
  const result = await discover({});
  const findings = await scanSecurity(result.files);
  const filtered = findings.filter((item) => (rank[item.severity] ?? 2) <= threshold).slice(0, limit);
  return {
    scannedFiles: result.files.length,
    totalFindings: findings.length,
    returned: filtered.length,
    findings: filtered,
    note: "Static pattern scan; findings are leads to review, not convictions.",
  };
}

async function runCleanupPlan(): Promise<unknown> {
  const result = await discover({});
  const plan = planPrune(result.files);
  const safe = plan.drop.filter((item) => item.confidence === "safe");
  return {
    keep: plan.keep.length,
    safeToTrash: safe.map((item) => ({
      name: item.file.name,
      reason: item.reason,
      command: trashCommand(item.deletePath),
    })),
    undo: "skillint restore",
    note: "Commands quarantine into ~/.skillint/trash; nothing is deleted.",
  };
}

export async function handleMcpRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  try {
    if (request.method === "initialize") {
      const params = request.params ?? {};
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: requested,
          capabilities: { tools: {} },
          serverInfo: { name: "skillint", version: "0.16.0" },
        },
      };
    }
    if (request.method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (request.method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    }
    if (request.method === "tools/call") {
      const params = request.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      let payload: unknown;
      if (name === "skill_checkup") {
        payload = await runCheckup(typeof args.cwd === "string" ? args.cwd : undefined);
      } else if (name === "skill_audit") {
        payload = await runAudit(
          typeof args.severity === "string" ? args.severity : undefined,
          typeof args.limit === "number" ? args.limit : undefined,
        );
      } else if (name === "skill_cleanup_plan") {
        payload = await runCleanupPlan();
      } else if (name === "scan_skill_repo") {
        if (typeof args.repo !== "string" || !args.repo) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: "scan_skill_repo requires a repo argument" } };
        }
        payload = await scanRemoteRepo(args.repo);
      } else {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] },
      };
    }
    if (request.method.startsWith("notifications/")) {
      return null;
    }
    if (id === null) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export async function runMcpServer(): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(text) as JsonRpcRequest;
    } catch {
      continue;
    }
    const response = await handleMcpRequest(request);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
