import type { Lang } from "./wizard.js";
import type { WizardCounts } from "./wizard.js";

export interface RoastInput {
  counts: WizardCounts;
  bodyTokens: number;
  contextWindows: number;
  health: { score: number; label: string };
  biggest?: { name: string; tokens: number };
}

function fmt(value: number): string {
  return value.toLocaleString("en-US");
}

export function roastLines(input: RoastInput, lang: Lang): string[] {
  const { counts, contextWindows, health, biggest } = input;
  const zh = lang === "zh";
  const lines: string[] = [];

  if (counts.skills >= 1000) {
    lines.push(
      zh
        ? `你装了 ${fmt(counts.skills)} 个 skill。你的 Agent 不缺技能，缺的是注意力。`
        : `You installed ${fmt(counts.skills)} skills. Your agent doesn't lack skills — it lacks attention.`,
    );
  } else if (counts.skills >= 200) {
    lines.push(
      zh
        ? `${fmt(counts.skills)} 个 skill。收藏从未停止，使用从未开始。`
        : `${fmt(counts.skills)} skills. The collecting never stops; the using never starts.`,
    );
  } else if (counts.skills > 0) {
    lines.push(
      zh
        ? `${fmt(counts.skills)} 个 skill，规模还算克制，点个赞。`
        : `${fmt(counts.skills)} skills — a refreshingly restrained collection.`,
    );
  }

  if (contextWindows >= 10) {
    lines.push(
      zh
        ? `全部载入需要约 ${fmt(contextWindows)} 个完整上下文窗口。这不是技能库，这是给 Agent 准备的鹤岗房贷。`
        : `Loading everything would take ~${fmt(contextWindows)} full context windows. That's not a library, that's a mortgage for your agent.`,
    );
  }

  if (biggest && biggest.tokens > 8000) {
    lines.push(
      zh
        ? `《${biggest.name}》一个 skill 独占约 ${fmt(biggest.tokens)} token——它不是技能，它是回忆录。`
        : `"${biggest.name}" hogs ~${fmt(biggest.tokens)} tokens on its own. That's not a skill, that's a memoir.`,
    );
  }

  if (counts.risky > 0) {
    lines.push(
      zh
        ? `${fmt(counts.risky)} 个 skill 里藏着「下载并执行网上脚本」之类的操作。给陌生 markdown 开 shell 权限，勇气可嘉。`
        : `${fmt(counts.risky)} skills contain download-and-run commands or worse. Giving random markdown shell access — bold strategy.`,
    );
  }

  if (counts.junk > 0) {
    lines.push(
      zh
        ? `${fmt(counts.junk)} 个重复/备份垃圾还躺在目录里。备份的备份的备份，行为艺术。`
        : `${fmt(counts.junk)} duplicates and backups are still lying around. Backups of backups of backups — performance art.`,
    );
  } else {
    lines.push(zh ? `垃圾倒是清干净了，难得。` : `At least the junk is cleaned up. Respect.`);
  }

  if (counts.oversized >= 50) {
    lines.push(
      zh
        ? `${fmt(counts.oversized)} 个 skill 超过 4,000 token。写这么长，是想让 Agent 读完直接下班吗？`
        : `${fmt(counts.oversized)} skills blow past 4,000 tokens. Were they written to teach the agent, or to filibuster it?`,
    );
  }

  if (health.score < 40) {
    lines.push(
      zh
        ? `健康分 ${health.score}/100。如果这是体检报告，医生已经在给家属打电话了。`
        : `Health score ${health.score}/100. If this were a physical, the doctor would already be calling your family.`,
    );
  } else if (health.score < 70) {
    lines.push(
      zh
        ? `健康分 ${health.score}/100，及格边缘疯狂试探。`
        : `Health score ${health.score}/100 — flirting with the passing grade.`,
    );
  } else {
    lines.push(
      zh
        ? `健康分 ${health.score}/100，行吧，这次没什么好骂的。`
        : `Health score ${health.score}/100. Fine. Nothing to roast here — this time.`,
    );
  }

  return lines;
}

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, width: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += width) {
    lines.push(chars.slice(index, index + width).join(""));
  }
  return lines.slice(0, 3);
}

export function renderRoastCard(input: RoastInput, lang: Lang): string {
  const zh = lang === "zh";
  const color = input.health.score >= 85 ? "#2FA37C" : input.health.score >= 60 ? "#D9930D" : "#E0533D";
  const headline = roastLines(input, lang)[0] ?? "";
  const wrapped = wrapText(headline, zh ? 34 : 62);
  const stats = zh
    ? `${fmt(input.counts.skills)} 个 skill · 约 ${fmt(input.contextWindows)} 个上下文窗口 · ${fmt(input.counts.risky)} 个安全风险`
    : `${fmt(input.counts.skills)} skills · ~${fmt(input.contextWindows)} context windows · ${fmt(input.counts.risky)} security findings`;
  const title = zh ? "我的 skills 被 roast 了" : "my skills folder got roasted";

  const headlineText = wrapped
    .map((line, index) => `<text x="48" y="${210 + index * 34}" fill="#DCE6F5" font-size="21">${escXml(line)}</text>`)
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="418" viewBox="0 0 800 418" role="img" aria-label="skillint roast card">
  <rect width="800" height="418" rx="24" fill="#0D1523"/>
  <rect x="1" y="1" width="798" height="416" rx="23" fill="none" stroke="#22304A" stroke-width="2"/>
  <text x="48" y="72" fill="#8FA3BD" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15">$ npx skillint roast</text>
  <text x="48" y="126" fill="#FFFFFF" font-family="-apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="800">${escXml(title)}</text>
  <text x="48" y="164" fill="${color}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="19" font-weight="700">health ${input.health.score}/100 · ${escXml(input.health.label)}</text>
  <g font-family="-apple-system, 'Segoe UI', sans-serif">
  ${headlineText}
  </g>
  <text x="48" y="330" fill="#8FA3BD" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15">${escXml(stats)}</text>
  <text x="48" y="374" fill="#5B9CFF" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15">github.com/iosrxwy/skillint</text>
</svg>
`;
}
