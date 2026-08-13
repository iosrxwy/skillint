import { spawn } from "node:child_process";
import { emitKeypressEvents, type Key } from "node:readline";
import pc from "picocolors";
import { discover } from "./discover.js";
import { doctor, healthScore, summarizeTokens, type DoctorLimits } from "./doctor.js";
import { healthBar } from "./format.js";
import { resolveLinkPlan } from "./manage.js";
import { planPrune } from "./prune.js";
import { scanSecurity } from "./security.js";
import { trashCommand } from "./trash.js";
import type {
  Finding,
  LinkPlan,
  PrunePlan,
  ScanResult,
  SecurityFinding,
  TokenSummary,
} from "./types.js";

export interface TuiOptions {
  extraRoots: string[];
  global: boolean;
  project: boolean;
  ignore: string[];
  limits?: Partial<DoctorLimits>;
}

export interface TuiData {
  result: ScanResult;
  findings: Finding[];
  security: SecurityFinding[];
  prune: PrunePlan;
  link: LinkPlan;
  summary: TokenSummary;
  health: { score: number; label: string };
}

export const TABS = ["issues", "audit", "cleanup", "links", "largest"] as const;
export type TabId = (typeof TABS)[number];

export interface Row {
  label: string;
  text: string;
  tone: "error" | "warning" | "info" | "ok" | "plain";
  detail: string[];
  copy?: string;
}

export interface TuiState {
  tab: number;
  cursor: number[];
  message: string;
}

export function initialState(): TuiState {
  return { tab: 0, cursor: TABS.map(() => 0), message: "" };
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

export function buildRows(tab: TabId, data: TuiData): Row[] {
  if (tab === "issues") {
    return data.findings.map((finding) => ({
      label: finding.code,
      text: finding.message,
      tone: finding.severity,
      detail: [
        finding.path,
        ...(finding.extra ? finding.extra.split(", ").slice(0, 2).map((path) => `related: ${path}`) : []),
      ],
      copy: finding.path,
    }));
  }
  if (tab === "audit") {
    return data.security.map((finding) => ({
      label: finding.code,
      text: finding.message,
      tone: finding.severity,
      detail: [`${finding.path}:${finding.line}`, `> ${finding.excerpt}`],
      copy: `${finding.path}:${finding.line}`,
    }));
  }
  if (tab === "cleanup") {
    return data.prune.drop.map((item) => {
      const command = trashCommand(item.deletePath);
      return {
        label: `${item.confidence}·${item.code}`,
        text: `${item.file.name} — ${item.reason}`,
        tone: item.confidence === "safe" ? "error" : item.confidence === "optional" ? "warning" : "info",
        detail: [item.deletePath, item.confidence === "review" ? `$ # ${command}` : `$ ${command}`],
        copy: command,
      } satisfies Row;
    });
  }
  if (tab === "links") {
    return data.link.actions.map((action) => {
      const command = `${trashCommand(action.linkPath)} && ln -s ${shQuote(action.canonicalPath)} ${shQuote(action.linkPath)}`;
      return {
        label: action.status,
        text: `${action.name}  ${action.linkFamily} -> ${action.canonicalFamily}`,
        tone: action.status === "link" ? "ok" : action.status === "conflict" ? "warning" : "plain",
        detail: [`${action.linkPath}`, `-> ${action.canonicalPath}`, action.status === "link" ? `$ ${command}` : action.reason],
        copy: action.status === "link" ? command : undefined,
      } satisfies Row;
    });
  }
  const largest = [...data.result.files].sort((a, b) => b.bodyTokens - a.bodyTokens).slice(0, 100);
  return largest.map((file) => ({
    label: `${String(file.bodyTokens).padStart(6)} tok`,
    text: `${file.kind}  ${file.name}`,
    tone: file.bodyTokens > 4000 ? "warning" : "plain",
    detail: [file.path],
    copy: file.path,
  }));
}

export function tabCounts(data: TuiData): number[] {
  return TABS.map((tab) => buildRows(tab, data).length);
}

export type UiKey =
  | { name: "tab-next" }
  | { name: "tab-prev" }
  | { name: "tab-set"; index: number }
  | { name: "down" }
  | { name: "up" }
  | { name: "top" }
  | { name: "bottom" };

export function reduce(state: TuiState, key: UiKey, rowCounts: number[]): TuiState {
  const next: TuiState = { ...state, cursor: [...state.cursor], message: "" };
  const clamp = (tab: number, value: number) =>
    Math.max(0, Math.min(value, Math.max(0, (rowCounts[tab] ?? 0) - 1)));
  if (key.name === "tab-set") next.tab = Math.max(0, Math.min(key.index, TABS.length - 1));
  if (key.name === "tab-next") next.tab = (state.tab + 1) % TABS.length;
  if (key.name === "tab-prev") next.tab = (state.tab + TABS.length - 1) % TABS.length;
  if (key.name === "down") next.cursor[next.tab] = clamp(next.tab, state.cursor[next.tab] + 1);
  if (key.name === "up") next.cursor[next.tab] = clamp(next.tab, state.cursor[next.tab] - 1);
  if (key.name === "top") next.cursor[next.tab] = 0;
  if (key.name === "bottom") next.cursor[next.tab] = clamp(next.tab, Number.MAX_SAFE_INTEGER);
  next.cursor[next.tab] = clamp(next.tab, next.cursor[next.tab]);
  return next;
}

export function fit(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width));
  const chars = [...text];
  if (chars.length <= width) return text;
  return `${chars.slice(0, width - 1).join("")}…`;
}

const GLYPHS: Record<Row["tone"], string> = {
  error: pc.red("●"),
  warning: pc.yellow("▲"),
  info: pc.dim("○"),
  ok: pc.green("✓"),
  plain: pc.dim("·"),
};

function labelTone(row: Row, text: string): string {
  if (row.tone === "error") return pc.red(text);
  if (row.tone === "warning") return pc.yellow(text);
  if (row.tone === "info") return pc.dim(text);
  if (row.tone === "ok") return pc.green(text);
  return pc.dim(text);
}

function labelWidth(rows: Row[]): number {
  let width = 8;
  for (const row of rows) width = Math.max(width, Math.min(24, row.label.length));
  return width;
}

export function renderFrame(
  data: TuiData,
  state: TuiState,
  size: { rows: number; cols: number },
  loading = false,
): string {
  const cols = Math.max(40, size.cols);
  const rows = Math.max(12, size.rows);
  const lines: string[] = [];

  const title = ` skillint ui${loading ? " · scanning…" : ""} `;
  const healthText = ` ${data.health.score}/100 ${data.health.label} `;
  const healthColored = data.health.score >= 85 ? pc.green(healthText) : data.health.score >= 60 ? pc.yellow(healthText) : pc.red(healthText);
  lines.push(`${pc.inverse(pc.bold(title))} ${healthBar(data.health.score, 10)}${healthColored}`);
  lines.push(
    pc.dim(
      fit(
        ` ${n(data.summary.skills)} skills · ${n(data.summary.rules)} rules · body ~${n(data.summary.bodyTokens)} tokens`,
        cols,
      ),
    ),
  );

  const counts = tabCounts(data);
  const tabBar = TABS.map((tab, index) => {
    const label = ` ${index + 1} ${tab} (${n(counts[index])}) `;
    return index === state.tab ? pc.bgCyan(pc.black(label)) : pc.dim(label);
  }).join(" ");
  lines.push(` ${tabBar}`);
  lines.push(pc.dim("─".repeat(cols)));

  const tab = TABS[state.tab];
  const rowsData = buildRows(tab, data);
  const cursor = Math.min(state.cursor[state.tab], Math.max(0, rowsData.length - 1));
  const width = labelWidth(rowsData);
  const detailHeight = 4;
  const chromeHeight = 4 + detailHeight + 1;
  const viewport = Math.max(3, rows - chromeHeight);
  let offset = 0;
  if (cursor >= viewport) offset = cursor - viewport + 1;

  if (rowsData.length === 0) {
    lines.push(pc.green(`  ✓ nothing in ${tab}`));
    for (let i = 1; i < viewport; i += 1) lines.push("");
  } else {
    for (let i = 0; i < viewport; i += 1) {
      const index = offset + i;
      const row = rowsData[index];
      if (!row) {
        lines.push("");
        continue;
      }
      const label = fit(row.label, width).padEnd(width);
      const text = fit(row.text, Math.max(8, cols - width - 6));
      if (index === cursor) {
        lines.push(pc.bgBlue(pc.white(fit(` ❯ ${row.label.padEnd(width)}  ${row.text}`, cols).padEnd(cols))));
      } else {
        lines.push(`   ${GLYPHS[row.tone]} ${labelTone(row, label)} ${text}`);
      }
    }
  }

  lines.push(pc.dim(`─ detail ${"─".repeat(Math.max(0, cols - 9))}`));
  const selected = rowsData[cursor];
  for (let i = 0; i < detailHeight - 1; i += 1) {
    const detail = selected?.detail[i];
    if (!detail) {
      lines.push("");
      continue;
    }
    if (detail.startsWith("$ ")) {
      lines.push(pc.cyan(fit(`   ${detail}`, cols)));
    } else {
      lines.push(pc.dim(fit(`   ${detail}`, cols)));
    }
  }

  const key = (k: string, label: string) => `${pc.cyan(k)}${pc.dim(` ${label}`)}`;
  const hints = [
    key("1-5", "tabs"),
    key("j/k", "move"),
    key("g/G", "ends"),
    key("c", "copy"),
    key("r", "rescan"),
    key("q", "quit"),
  ].join(pc.dim("  ·  "));
  const message = state.message ? pc.green(` ${state.message}`) : ` ${hints}`;
  lines.push(message);

  return lines.slice(0, rows).join("\n");
}

async function loadData(options: TuiOptions): Promise<TuiData> {
  const result = await discover(options);
  const findings = doctor(result.files, options.limits);
  const [security, link] = await Promise.all([scanSecurity(result.files), resolveLinkPlan(result.files)]);
  return {
    result,
    findings,
    security,
    prune: planPrune(result.files),
    link,
    summary: summarizeTokens(result.files),
    health: healthScore(result.files, findings),
  };
}

function copyToClipboard(text: string): Promise<boolean> {
  const command =
    process.platform === "darwin"
      ? ["pbcopy"]
      : process.platform === "win32"
        ? ["clip"]
        : ["xclip", "-selection", "clipboard"];
  return new Promise((resolvePromise) => {
    try {
      const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolvePromise(false));
      child.on("close", (code) => resolvePromise(code === 0));
      child.stdin.end(text);
    } catch {
      resolvePromise(false);
    }
  });
}

export async function runTui(options: TuiOptions): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error("skillint ui needs an interactive terminal. Run it directly in a TTY.");
  }

  const out = process.stdout;
  const size = () => ({ rows: out.rows ?? 24, cols: out.columns ?? 80 });

  out.write("\x1b[?1049h\x1b[?25l");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let state = initialState();
  let data: TuiData | null = null;
  let loading = true;
  let closed = false;

  const draw = () => {
    if (closed) return;
    out.write("\x1b[2J\x1b[H");
    if (!data) {
      out.write(pc.dim("scanning catalogs…"));
      return;
    }
    out.write(renderFrame(data, state, size(), loading));
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    process.stdin.setRawMode(false);
    process.stdin.pause();
    out.write("\x1b[?25h\x1b[?1049l");
  };

  const rescan = async () => {
    loading = true;
    draw();
    data = await loadData(options);
    loading = false;
    draw();
  };

  out.on("resize", draw);

  await new Promise<void>((resolveDone, rejectDone) => {
    const onKey = (char: string | undefined, key: Key | undefined) => {
      const name = key?.name ?? char ?? "";
      if (name === "q" || name === "escape" || (key?.ctrl && name === "c")) {
        cleanup();
        resolveDone();
        return;
      }
      if (!data) return;
      const counts = tabCounts(data);
      if (char && char >= "1" && char <= String(TABS.length)) {
        state = reduce(state, { name: "tab-set", index: Number(char) - 1 }, counts);
      } else if (name === "tab" || name === "right" || name === "l") {
        state = reduce(state, { name: key?.shift && name === "tab" ? "tab-prev" : "tab-next" }, counts);
      } else if (name === "left" || name === "h") {
        state = reduce(state, { name: "tab-prev" }, counts);
      } else if (name === "down" || name === "j") {
        state = reduce(state, { name: "down" }, counts);
      } else if (name === "up" || name === "k") {
        state = reduce(state, { name: "up" }, counts);
      } else if (char === "g") {
        state = reduce(state, { name: "top" }, counts);
      } else if (char === "G") {
        state = reduce(state, { name: "bottom" }, counts);
      } else if (name === "r") {
        void rescan().catch((error: unknown) => {
          cleanup();
          rejectDone(error instanceof Error ? error : new Error(String(error)));
        });
        return;
      } else if (name === "c") {
        const rows = buildRows(TABS[state.tab], data);
        const row = rows[Math.min(state.cursor[state.tab], rows.length - 1)];
        if (row?.copy) {
          void copyToClipboard(row.copy).then((ok) => {
            state = { ...state, message: ok ? `copied: ${fit(row.copy ?? "", 60)}` : "clipboard unavailable — see detail line" };
            draw();
          });
        }
        return;
      }
      draw();
    };

    process.stdin.on("keypress", onKey);
    rescan().catch((error: unknown) => {
      cleanup();
      rejectDone(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
