import { memo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Code2,
  Download,
  FileCode2,
  Layers3,
  Lightbulb,
  Link2,
  Table2,
} from "lucide-react";
import type { DictionaryDataset } from "../lib/import/types";
import type { InsightsState } from "../hooks/useInsights";
import { DEFAULT_INSIGHT_INSTRUCTIONS } from "../lib/insights/llm";
import { buildInsightHtmlDocument } from "../lib/insights/markdown";

const PREVIEW_LINE_COUNT = 36;

/** 行内格式：**加粗** 与 `代码`。利用 split 捕获组切分，避免手动遍历正则。 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(<strong key={nodes.length}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("`") && part.endsWith("`")) {
      nodes.push(<code key={nodes.length}>{part.slice(1, -1)}</code>);
    } else {
      nodes.push(part);
    }
  }
  return nodes;
}

const isTableRow = (line: string) => line.trim().startsWith("|");
const isTableSeparator = (line: string) =>
  line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .every((cell) => /^:?-{2,}:?$/.test(cell));
const tableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

/** 极简 Markdown 渲染：标题/列表/表格/代码块，与导出渲染器同构，不引第三方库。 */
function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let codeLines: string[] | null = null;
  let listItems: string[] = [];
  let tableRows: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul className="insight-list" key={`list-${key++}`}>
          {listItems.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows.filter((row) => !isTableSeparator(row));
    const [header, ...body] = rows;
    blocks.push(
      <table className="insight-table" key={`table-${key++}`}>
        {header ? (
          <thead>
            <tr>
              {tableCells(header).map((cell, index) => (
                <th key={index}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {tableCells(row).map((cell, cellIndex) => (
                <td key={cellIndex}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
    tableRows = [];
  };

  for (const rawLine of text.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      if (codeLines === null) {
        flushList();
        flushTable();
        codeLines = [];
      } else {
        blocks.push(
          <pre className="insight-code" key={`code-${key++}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
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
      blocks.push(
        <h4 className="insight-heading" key={`head-${key++}`}>
          {renderInline(trimmed.replace(/^#{1,6}\s+/, ""))}
        </h4>,
      );
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
    blocks.push(
      <p className="insight-paragraph" key={`para-${key++}`}>
        {renderInline(trimmed)}
      </p>,
    );
  }
  flushList();
  flushTable();
  if (codeLines !== null) {
    blocks.push(
      <pre className="insight-code" key={`code-${key++}`}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }
  return <div className="insight-result">{blocks}</div>;
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default memo(function InsightsView({
  dataset,
  insights,
}: {
  dataset: DictionaryDataset;
  insights: InsightsState;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { config, loading, result, reasoning } = insights;
  const dataTables = dataset.tables.filter((table) => !table.entityKind);
  const tagViewCount = dataset.tables.length - dataTables.length;
  const codeSetCount = new Set(
    dataset.codeItems.map((code) => code.codeSetName),
  ).size;
  const topicCount = new Set(
    dataset.tables.map((table) => table.topic || "未分类"),
  ).size;
  const standardRefCount = dataset.fields.filter(
    (field) => field.standardNo,
  ).length;

  const metrics = [
    { label: "数据表", value: dataTables.length, icon: Table2, accent: "red" },
    { label: "字段", value: dataset.fields.length, icon: Braces, accent: "blue" },
    { label: "数据标准", value: dataset.standards.length, icon: BookOpen, accent: "green" },
    { label: "代码集", value: codeSetCount, icon: Code2, accent: "orange" },
    { label: "挂标准字段", value: standardRefCount, icon: Link2, accent: "blue" },
    { label: "主题域", value: topicCount, icon: Layers3, accent: "green" },
  ];

  const resultLines = result.split("\n");
  const truncated = resultLines.length > PREVIEW_LINE_COUNT;
  const previewText = truncated
    ? resultLines.slice(0, PREVIEW_LINE_COUNT).join("\n")
    : result;

  const exportStamp = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  };
  const baseName = `洞察思路-${dataset.sourceFile.replace(/\.xlsx$/i, "")}-${exportStamp()}`;
  const generatedAtText = insights.savedAt
    ? `生成于 ${new Date(insights.savedAt).toLocaleString("zh-CN")}`
    : `${insights.elapsed}s`;
  const metaLines = [
    `数据源：${dataset.sourceFile}（${dataTables.length} 张数据表 · ${dataset.fields.length} 个字段）`,
    `模型：${config.model || insights.generatedFor} · ${generatedAtText}`,
    "由数据字典查询台「洞察思路」生成",
  ];

  const copyResult = async () => {
    await navigator.clipboard?.writeText(result);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const ready = insights.models.length > 0 && Boolean(config.model);

  return (
    <div className="insights-page">
      <div className="directory-header">
        <div>
          <span className="section-kicker">AI INSIGHTS</span>
          <h1>洞察思路</h1>
          <p>
            面向整个数据源（{dataset.sourceFile}）生成业务洞察：资产全景、
            {tagViewCount > 0 ? `${tagViewCount} 个标签/视图、` : ""}
            分析场景与落地建议。生成过程在后台持续进行，切页不影响。
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          data-testid="insight-generate"
          disabled={loading || !ready}
          onClick={() => void insights.generate()}
        >
          <Lightbulb size={16} />
          {loading ? "生成中…" : result ? "重新生成" : "生成洞察思路"}
        </button>
      </div>

      <div className="insight-overview">
        <div className="metrics-grid">
          {metrics.map(({ label, value, icon: Icon, accent }) => (
            <div className="metric-card" key={label}>
              <div className={`metric-icon ${accent}`}>
                <Icon size={17} />
              </div>
              <div>
                <strong>{value.toLocaleString("zh-CN")}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="insight-config">
        <div className="detail-section-label">
          模型服务（兼容OpenAI协议接口 ；配置仅保存在本机浏览器）
        </div>
        <div className="insight-config-grid">
          <label>
            服务地址
            <input
              data-testid="insight-base"
              value={config.baseUrl}
              onChange={(event) =>
                insights.updateConfig({ baseUrl: event.target.value })
              }
              placeholder="https://llm.intra/v1"
            />
          </label>
          <label>
            API Key（可选）
            <input
              data-testid="insight-key"
              type="password"
              value={config.apiKey}
              onChange={(event) =>
                insights.updateConfig({ apiKey: event.target.value })
              }
              placeholder="内网网关可不填"
            />
          </label>
          <button
            type="button"
            className="secondary-button insight-test-button"
            data-testid="insight-test"
            disabled={insights.testing}
            onClick={() => void insights.testConnection()}
          >
            {insights.testing ? "测试中…" : "测试连接"}
          </button>
          <label className="insight-model-field">
            模型（测试连接后选择）
            <select
              data-testid="insight-model"
              value={config.model}
              disabled={insights.models.length === 0}
              onChange={(event) =>
                insights.updateConfig({ model: event.target.value })
              }
            >
              {insights.models.length === 0 ? (
                <option value={config.model}>
                  {config.model || "请先点击“测试连接”"}
                </option>
              ) : (
                insights.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {insights.testStatus && (
          <p className="insight-status ok" data-testid="insight-status">
            <Check size={12} /> {insights.testStatus}
          </p>
        )}
        <p className="insight-config-note">
          生成时会把本数据源的表名、主题分布、字段引用统计发送至上方地址，请确认其符合行内数据安全要求。
        </p>
      </div>

      <details className="insight-basis insight-prompt-editor" data-testid="insight-prompt-editor">
        <summary>
          自定义提示词（高级）
          {insights.instructions.trim()
            ? " · 已启用自定义模板"
            : " · 当前使用默认模板"}
        </summary>
        <div className="insight-prompt-tools">
          <span>
            发送时会把 <code>{"{数据摘要}"}</code> 占位符替换为自动生成的数据源摘要；不写占位符则自动附加在末尾。模板保存在本机浏览器。
          </span>
          <button
            type="button"
            className="secondary-button"
            data-testid="insight-prompt-reset"
            onClick={insights.resetInstructions}
          >
            恢复默认提示词
          </button>
        </div>
        <textarea
          data-testid="insight-prompt"
          value={insights.instructions.trim() ? insights.instructions : DEFAULT_INSIGHT_INSTRUCTIONS}
          onChange={(event) => insights.updateInstructions(event.target.value)}
          spellCheck={false}
        />
      </details>

      {insights.error && (
        <div className="insight-error">
          <AlertTriangle size={15} />
          {insights.error}
        </div>
      )}

      {loading && (
        <div className="insight-progress" data-testid="insight-progress">
          <div className="insight-progress-bar">
            <span />
          </div>
          <div className="insight-progress-meta">
            <span>
              已发送数据源摘要（{dataTables.length} 张表 ·{" "}
              {dataset.fields.length.toLocaleString("zh-CN")} 个字段）
              {result
                ? "，正文生成中…"
                : reasoning
                  ? "，模型思考中（思考过程见下方，思考型模型此阶段较久）…"
                  : "，等待模型响应…"}
              {insights.generatedFor && insights.generatedFor !== dataset.sourceFile
                ? `（本次生成基于 ${insights.generatedFor}）`
                : ""}
            </span>
            <span>
              {result
                ? `已输出 ${insights.streamedChars.toLocaleString("zh-CN")} 字`
                : `已思考 ${reasoning.length.toLocaleString("zh-CN")} 字`}
              {" · "}
              {insights.elapsed}s
            </span>
          </div>
          <button
            type="button"
            className="secondary-button insight-stop"
            data-testid="insight-stop"
            onClick={insights.stop}
          >
            停止生成
          </button>
        </div>
      )}

      {reasoning && (
        <details
          className="insight-reasoning"
          data-testid="insight-reasoning"
          open={loading && !result}
        >
          <summary>
            模型思考过程（{reasoning.length.toLocaleString("zh-CN")} 字）
            {loading && !result ? " · 进行中…" : ""}
          </summary>
          <pre>{reasoning}</pre>
        </details>
      )}

      {(insights.promptPreview || result) && (
        <details className="insight-basis" data-testid="insight-basis">
          <summary>
            分析依据：本次发送给模型的数据摘要（{dataTables.length} 张数据表 ·{" "}
            {topicCount} 个主题域 · 高频公共代码 Top20）
          </summary>
          <pre>{insights.promptPreview}</pre>
        </details>
      )}

      {result ? (
        <>
          {insights.generatedFor && insights.generatedFor !== dataset.sourceFile && (
            <p className="insight-source-note" data-testid="insight-source-note">
              以下结果生成自数据源「{insights.generatedFor}」；点击“重新生成”将基于当前数据源「
              {dataset.sourceFile}」。
            </p>
          )}
          <div className="insight-output-head">
            <div className="insight-output-title">
              <strong>洞察结果</strong>
              <small>
                共 {result.length.toLocaleString("zh-CN")} 字 ·{" "}
                {generatedAtText} · {config.model}
              </small>
            </div>
            <div className="insight-output-actions">
              <button
                type="button"
                className="secondary-button"
                data-testid="insight-copy"
                onClick={() => void copyResult()}
              >
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? "已复制" : "复制全文"}
              </button>
              <button
                type="button"
                className="secondary-button"
                data-testid="insight-download-md"
                onClick={() => downloadFile(`${baseName}.md`, result, "text/markdown")}
              >
                <Download size={14} />
                下载 Markdown
              </button>
              <button
                type="button"
                className="secondary-button"
                data-testid="insight-download-html"
                onClick={() =>
                  downloadFile(
                    `${baseName}.html`,
                    buildInsightHtmlDocument({
                      title: `洞察思路 · ${dataset.sourceFile}`,
                      metaLines,
                      markdown: result,
                    }),
                    "text/html",
                  )
                }
              >
                <FileCode2 size={14} />
                下载 HTML 报告
              </button>
            </div>
          </div>
          <div className={expanded ? "" : "insight-excerpt"}>
            <MarkdownLite text={expanded ? result : previewText} />
            {!expanded && truncated && (
              <button
                type="button"
                className="insight-expand"
                data-testid="insight-expand"
                onClick={() => setExpanded(true)}
              >
                展开全文（预览外还有{" "}
                {(result.length - previewText.length).toLocaleString("zh-CN")}{" "}
                字）
                <ChevronDown size={14} />
              </button>
            )}
          </div>
          {expanded && (
            <button
              type="button"
              className="insight-expand"
              onClick={() => setExpanded(false)}
            >
              收起全文
              <ChevronUp size={14} />
            </button>
          )}
        </>
      ) : (
        !loading && (
          <div className="insights-empty-hint">
            填写模型服务并测试连接后，点击右上角“生成洞察思路”，将基于整个数据源的资产结构生成五节洞察。生成在后台持续进行——切到其他页面不影响，左侧导航“洞察思路”旁的呼吸点表示生成中；完成后支持预览与下载（Markdown / HTML）。
          </div>
        )
      )}
    </div>
  );
});
