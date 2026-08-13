import type { Finding, PrunePlan, ScanResult, SecurityFinding, TokenSummary } from "./types.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(value: number): string {
  return value.toLocaleString("en-US");
}

function gaugeColor(score: number): string {
  if (score >= 85) return "#2FA37C";
  if (score >= 60) return "#B57E0A";
  return "#D1242F";
}

export function formatHtmlReport(input: {
  generatedAt: string;
  result: ScanResult;
  summary: TokenSummary;
  findings: Finding[];
  security: SecurityFinding[];
  prune: PrunePlan;
  health: { score: number; label: string };
}): string {
  const { generatedAt, result, summary, findings, security, prune, health } = input;
  const color = gaugeColor(health.score);
  const circumference = 2 * Math.PI * 52;
  const arc = (health.score / 100) * circumference;
  const contexts = Math.max(1, Math.round(summary.bodyTokens / 128000));
  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const riskHigh = security.filter((item) => item.severity === "error").length;
  const safeDrops = prune.drop.filter((item) => item.confidence === "safe");

  const sources = Object.entries(summary.bySource).sort((a, b) => b[1].files - a[1].files);
  const maxFiles = Math.max(1, ...sources.map(([, bucket]) => bucket.files));
  const sourceBars = sources
    .map(
      ([source, bucket]) => `
      <div class="bar-row">
        <span class="bar-label">${esc(source)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, Math.round((bucket.files / maxFiles) * 100))}%"></div></div>
        <span class="bar-value">${n(bucket.files)} files · ~${n(bucket.bodyTokens)} tok</span>
      </div>`,
    )
    .join("");

  const findingRows = findings
    .map(
      (item) => `
      <tr data-sev="${item.severity}">
        <td><span class="pill ${item.severity}">${item.severity}</span></td>
        <td><code>${esc(item.code)}</code></td>
        <td>${esc(item.message)}</td>
        <td class="path">${esc(item.path)}</td>
      </tr>`,
    )
    .join("");

  const securityRows = security
    .map(
      (item) => `
      <tr data-sev="${item.severity}">
        <td><span class="pill ${item.severity}">${item.severity}</span></td>
        <td><code>${esc(item.code)}</code></td>
        <td>${esc(item.message)}</td>
        <td class="path">${esc(item.path)}:${item.line}</td>
        <td><code>${esc(item.excerpt)}</code></td>
      </tr>`,
    )
    .join("");

  const cleanupRows = prune.drop
    .map(
      (item) => `
      <tr data-sev="${item.confidence}">
        <td><span class="pill ${item.confidence === "safe" ? "error" : item.confidence === "optional" ? "warning" : "info"}">${item.confidence}</span></td>
        <td><code>${esc(item.code)}</code></td>
        <td>${esc(item.file.name)}</td>
        <td>${esc(item.reason)}</td>
        <td class="path">${esc(item.deletePath)}</td>
      </tr>`,
    )
    .join("");

  const largest = [...result.files].sort((a, b) => b.bodyTokens - a.bodyTokens).slice(0, 30);
  const largestRows = largest
    .map(
      (file) => `
      <tr>
        <td class="num">${n(file.bodyTokens)}</td>
        <td>${esc(file.kind)}</td>
        <td>${esc(file.name)}</td>
        <td class="path">${esc(file.path)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>skillint report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F1F4FC; color: #16324A; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px; }
  .hero { display: flex; gap: 28px; align-items: center; background: #fff; border: 1px solid #D8E1F0; border-radius: 20px; padding: 28px; }
  .hero h1 { margin: 0 0 4px; font-size: 24px; }
  .hero .sub { color: #667D91; font-size: 13px; }
  .gauge { position: relative; width: 128px; height: 128px; flex: none; }
  .gauge svg { transform: rotate(-90deg); }
  .gauge .score { position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; font-weight: 800; color: ${color}; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 20px 0; }
  .card { background: #fff; border: 1px solid #D8E1F0; border-radius: 14px; padding: 14px 16px; }
  .card .k { color: #667D91; font-size: 12px; }
  .card .v { font-size: 20px; font-weight: 750; margin-top: 2px; }
  section { background: #fff; border: 1px solid #D8E1F0; border-radius: 16px; padding: 20px; margin-top: 20px; }
  h2 { margin: 0 0 12px; font-size: 16px; }
  .bar-row { display: grid; grid-template-columns: 180px 1fr 220px; gap: 10px; align-items: center; font-size: 13px; margin: 6px 0; }
  .bar-label { color: #667D91; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { background: #EDF1FE; border-radius: 6px; height: 12px; }
  .bar-fill { background: #3B66F0; border-radius: 6px; height: 12px; }
  .bar-value { color: #667D91; text-align: right; }
  .tabs { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
  .tabs button { border: 1px solid #D8E1F0; background: #fff; color: #16324A; border-radius: 999px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  .tabs button.active { background: #16324A; color: #fff; border-color: #16324A; }
  .panel { display: none; }
  .panel.active { display: block; }
  .toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
  .toolbar input, .toolbar select { border: 1px solid #D8E1F0; border-radius: 8px; padding: 7px 10px; font-size: 13px; }
  .toolbar input { flex: 1; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #667D91; font-weight: 600; padding: 8px; border-bottom: 1px solid #E4EAF3; }
  td { padding: 8px; border-bottom: 1px solid #F0F3FA; vertical-align: top; }
  td.path { color: #667D91; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { background: #F4F6FD; border-radius: 6px; padding: 1px 6px; font-size: 12px; }
  .pill { border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; }
  .pill.error { background: #FDE8E8; color: #B03A28; }
  .pill.warning { background: #FdF3D7; color: #8A6D0B; }
  .pill.info { background: #EDF1FE; color: #3156BF; }
  footer { color: #8294A6; font-size: 12px; text-align: center; margin-top: 28px; }
  footer a { color: #3B66F0; }
</style>
<div class="wrap">
  <div class="hero">
    <div class="gauge">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="52" fill="none" stroke="#EDF1FE" stroke-width="12"/>
        <circle cx="64" cy="64" r="52" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${arc.toFixed(1)} ${circumference.toFixed(1)}"/>
      </svg>
      <div class="score">${health.score}</div>
    </div>
    <div>
      <h1>skillint report</h1>
      <div class="sub">${esc(generatedAt)} · health ${health.score}/100 (${esc(health.label)}) · read-only audit, nothing was executed</div>
    </div>
  </div>

  <div class="cards">
    <div class="card"><div class="k">skills</div><div class="v">${n(summary.skills)}</div></div>
    <div class="card"><div class="k">rules</div><div class="v">${n(summary.rules)}</div></div>
    <div class="card"><div class="k">body tokens (est.)</div><div class="v">~${n(summary.bodyTokens)}</div></div>
    <div class="card"><div class="k">full context windows</div><div class="v">~${n(contexts)}</div></div>
    <div class="card"><div class="k">doctor</div><div class="v">${n(errors)} err · ${n(warnings)} warn</div></div>
    <div class="card"><div class="k">security</div><div class="v">${n(riskHigh)} high risk</div></div>
    <div class="card"><div class="k">safe to trash</div><div class="v">${n(safeDrops.length)}</div></div>
  </div>

  <section>
    <h2>Files by source</h2>
    ${sourceBars}
  </section>

  <div class="tabs">
    <button class="active" data-tab="findings">Findings (${n(findings.length)})</button>
    <button data-tab="security">Security (${n(security.length)})</button>
    <button data-tab="cleanup">Cleanup (${n(prune.drop.length)})</button>
    <button data-tab="largest">Largest</button>
  </div>

  <section class="panel active" id="findings">
    <div class="toolbar">
      <input placeholder="filter…" oninput="flt(this)">
      <select onchange="sev(this)"><option value="">all severities</option><option>error</option><option>warning</option><option>info</option></select>
    </div>
    <table><thead><tr><th>severity</th><th>rule</th><th>message</th><th>path</th></tr></thead><tbody>${findingRows}</tbody></table>
  </section>

  <section class="panel" id="security">
    <div class="toolbar">
      <input placeholder="filter…" oninput="flt(this)">
      <select onchange="sev(this)"><option value="">all severities</option><option>error</option><option>warning</option><option>info</option></select>
    </div>
    <table><thead><tr><th>severity</th><th>rule</th><th>message</th><th>location</th><th>excerpt</th></tr></thead><tbody>${securityRows}</tbody></table>
  </section>

  <section class="panel" id="cleanup">
    <div class="toolbar"><input placeholder="filter…" oninput="flt(this)"></div>
    <table><thead><tr><th>bucket</th><th>rule</th><th>name</th><th>why</th><th>path</th></tr></thead><tbody>${cleanupRows}</tbody></table>
  </section>

  <section class="panel" id="largest">
    <table><thead><tr><th>tokens</th><th>kind</th><th>name</th><th>path</th></tr></thead><tbody>${largestRows}</tbody></table>
  </section>

  <footer>generated by <a href="https://github.com/iosrxwy/skillint">skillint</a> · cleanup is quarantine-based and undoable with <code>skillint restore</code></footer>
</div>
<script>
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === btn.dataset.tab));
    });
  });
  function flt(input) {
    const q = input.value.toLowerCase();
    input.closest("section").querySelectorAll("tbody tr").forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  }
  function sev(select) {
    const v = select.value;
    select.closest("section").querySelectorAll("tbody tr").forEach((row) => {
      row.style.display = !v || row.dataset.sev === v ? "" : "none";
    });
  }
</script>
</html>
`;
}
