const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 行内格式：**加粗** 与 `代码`。先转义再还原受控标签，保证安全。 */
function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

const isTableRow = (line: string) => line.trim().startsWith("|");
const isTableSeparator = (line: string) =>
  line
    .split("|")
    .map((cell) => cell.trim())
    .every((cell) => /^:?-{2,}:?$/.test(cell) && cell.length > 0);
const tableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

/** 与页面 MarkdownLite 同构的字符串版渲染器，用于导出独立的 HTML 报告。 */
export function markdownToHtml(markdown: string): string {
  const blocks: string[] = [];
  const lines = markdown.split("\n");
  let codeLines: string[] | null = null;
  let listItems: string[] = [];
  let tableRows: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.filter((row) => !isTableSeparator(row));
    const [header, ...body] = rows;
    const head = header
      ? `<thead><tr>${tableCells(header)
          .map((cell) => `<th>${inlineHtml(cell)}</th>`)
          .join("")}</tr></thead>`
      : "";
    const bodyHtml = body
      .map((row) => `<tr>${tableCells(row).map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    blocks.push(`<table>${head}<tbody>${bodyHtml}</tbody></table>`);
    tableRows = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      if (codeLines === null) {
        flushList();
        flushTable();
        codeLines = [];
      } else {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      }
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(rawLine);
      continue;
    }
    if (isTableRow(trimmed)) {
      flushList();
      tableRows.push(trimmed);
      continue;
    }
    flushTable();
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushList();
      blocks.push(`<h3>${inlineHtml(trimmed.replace(/^#{1,6}\s+/, ""))}</h3>`);
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-*•]\s+/, ""));
      continue;
    }
    if (/^\d+[.、)]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+[.、)]\s+/, ""));
      continue;
    }
    if (!trimmed) {
      flushList();
      continue;
    }
    flushList();
    blocks.push(`<p>${inlineHtml(trimmed)}</p>`);
  }
  flushList();
  flushTable();
  if (codeLines !== null) blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return blocks.join("\n");
}

export function buildInsightHtmlDocument(options: {
  title: string;
  metaLines: string[];
  markdown: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(options.title)}</title>
<style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; max-width: 960px; margin: 40px auto; padding: 0 24px 80px; color: #2e3539; background: #fff; line-height: 1.8; }
  h1 { font-size: 26px; letter-spacing: -.02em; }
  .meta { color: #858b90; font-size: 12px; border-bottom: 1px solid #e3e6e8; padding-bottom: 14px; margin-bottom: 8px; }
  .meta p { margin: 4px 0; }
  h3 { font-size: 16px; margin: 26px 0 8px; }
  p { font-size: 13px; margin: 8px 0; }
  ul { padding-left: 20px; font-size: 13px; }
  li { margin: 4px 0; }
  code { background: #f4f7f8; border: 1px solid #dfe7e9; border-radius: 3px; padding: 1px 5px; font-size: 12px; color: #31596a; font-family: Consolas, monospace; }
  pre { background: #f4f7f8; border: 1px solid #dfe7e9; border-radius: 6px; padding: 12px 14px; overflow-x: auto; }
  pre code { border: 0; background: transparent; padding: 0; }
  table { border-collapse: collapse; margin: 12px 0; font-size: 13px; width: 100%; }
  th, td { border: 1px solid #dfe3e6; padding: 7px 10px; text-align: left; }
  th { background: #f7f9fa; }
  strong { color: #1c1c1b; }
</style>
</head>
<body>
<h1>${escapeHtml(options.title)}</h1>
<div class="meta">${options.metaLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
${markdownToHtml(options.markdown)}
</body>
</html>`;
}
