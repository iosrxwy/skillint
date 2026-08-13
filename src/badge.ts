function badgeColor(score: number): string {
  if (score >= 85) return "#3fb950";
  if (score >= 60) return "#d4a72c";
  return "#d1242f";
}

export function renderBadge(score: number, label = "skills health"): string {
  const value = `${score}/100`;
  const leftWidth = 10 + label.length * 6.4;
  const rightWidth = 14 + value.length * 7.2;
  const width = Math.round(leftWidth + rightWidth);
  const color = badgeColor(score);
  const left = Math.round(leftWidth);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">`,
    `  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `  <g clip-path="url(#r)">`,
    `    <rect width="${left}" height="20" fill="#555"/>`,
    `    <rect x="${left}" width="${width - left}" height="20" fill="${color}"/>`,
    `    <rect width="${width}" height="20" fill="url(#s)"/>`,
    `  </g>`,
    `  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">`,
    `    <text x="${left / 2}" y="14">${label}</text>`,
    `    <text x="${left + (width - left) / 2}" y="14" font-weight="bold">${value}</text>`,
    `  </g>`,
    `</svg>`,
    ``,
  ].join("\n");
}
