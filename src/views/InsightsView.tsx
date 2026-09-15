import { memo, useRef, useState, type ReactNode } from "react";
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
import {
  buildDatasetInsightPrompt,
  listModels,
  loadLlmConfig,
  requestInsights,
  saveLlmConfig,
  type LlmConfig,
} from "../lib/insights/llm";
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
}: {
  dataset: DictionaryDataset;
}) {
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [streamedChars, setStreamedChars] = useState(0);
  const [promptPreview, setPromptPreview] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

  const updateConfig = (patch: Partial<LlmConfig>) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveLlmConfig(next);
      return next;
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setTestStatus("");
    setError("");
    try {
      const available = await listModels(config);
      setModels(available);
      setTestStatus(`已连接，发现 ${available.length} 个可用模型`);
      setConfig((current) => {
        const model = available.includes(current.model)
          ? current.model
          : available[0];
        const next = { ...current, model };
        saveLlmConfig(next);
        return next;
      });
    } catch (testError) {
      setModels([]);
      setTestStatus("");
      setError(
        testError instanceof Error
          ? `连接失败：${testError.message}`
          : "连接失败，请检查服务地址与网络。",
      );
    } finally {
      setTesting(false);
    }
  };

  const generate = async () => {
    if (!config.model) {
      setError("请先测试连接并选择模型。");
      return;
    }
    const prompt = buildDatasetInsightPrompt(dataset);
    const controller = new AbortController();
    abortRef.current = controller;
    setPromptPreview(prompt);
    setResult("");
    setReasoning("");
    setElapsed(0);
    setStreamedChars(0);
    setExpanded(false);
    setLoading(true);
    setError("");
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    try {
      const content = await requestInsights(config, prompt, {
        signal: controller.signal,
        onDelta: (chunk) => {
          setResult((current) => current + chunk);
          setStreamedChars((count) => count + chunk.length);
        },
        onReasoning: (chunk) => {
          setReasoning((current) => current + chunk);
        },
      });
      setResult(content);
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "模型服务调用失败。",
        );
      }
    } finally {
      window.clearInterval(timer);
      setLoading(false);
      abortRef.current = null;
    }
  };

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
  const metaLines = [
    `数据源：${dataset.sourceFile}（${dataTables.length} 张数据表 · ${dataset.fields.length} 个字段）`,
    `模型：${config.model} · 生成用时 ${elapsed}s · ${new Date().toLocaleString("zh-CN")}`,
    "由数据字典查询台「洞察思路」生成",
  ];

  const copyResult = async () => {
    await navigator.clipboard?.writeText(result);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const ready = models.length > 0 && Boolean(config.model);

  return (
    <div className="insights-page">
      <div className="directory-header">
        <div>
          <span className="section-kicker">AI INSIGHTS</span>
          <h1>洞察思路</h1>
          <p>
            面向整个数据源（{dataset.sourceFile}）生成业务洞察：资产全景、
            {tagViewCount > 0 ? `${tagViewCount} 个标签/视图、` : ""}
            分析场景与落地建议。结果支持预览与下载。
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          data-testid="insight-generate"
          disabled={loading || !ready}
          onClick={() => void generate()}
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
          模型服务（OpenAI 兼容；配置仅保存在本机浏览器）
        </div>
        <div className="insight-config-grid">
          <label>
            服务地址
            <input
              data-testid="insight-base"
              value={config.baseUrl}
              onChange={(event) => updateConfig({ baseUrl: event.target.value })}
              placeholder="https://llm.intra/v1"
            />
          </label>
          <label>
            API Key（可选）
            <input
              data-testid="insight-key"
              type="password"
              value={config.apiKey}
              onChange={(event) => updateConfig({ apiKey: event.target.value })}
              placeholder="内网网关可不填"
            />
          </label>
          <button
            type="button"
            className="secondary-button insight-test-button"
            data-testid="insight-test"
            disabled={testing}
            onClick={() => void testConnection()}
          >
            {testing ? "测试中…" : "测试连接"}
          </button>
          <label className="insight-model-field">
            模型（测试连接后选择）
            <select
              data-testid="insight-model"
              value={config.model}
              disabled={models.length === 0}
              onChange={(event) => updateConfig({ model: event.target.value })}
            >
              {models.length === 0 ? (
                <option value={config.model}>
                  {config.model || "请先点击“测试连接”"}
                </option>
              ) : (
                models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {testStatus && (
          <p className="insight-status ok" data-testid="insight-status">
            <Check size={12} /> {testStatus}
          </p>
        )}
        <p className="insight-config-note">
          生成时会把本数据源的表名、主题分布、字段引用统计发送至上方地址，请确认其符合行内数据安全要求。
        </p>
      </div>

      {error && (
        <div className="insight-error">
          <AlertTriangle size={15} />
          {error}
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
            </span>
            <span>
              {result
                ? `已输出 ${streamedChars.toLocaleString("zh-CN")} 字`
                : `已思考 ${reasoning.length.toLocaleString("zh-CN")} 字`}
              {" · "}
              {elapsed}s
            </span>
          </div>
          <button
            type="button"
            className="secondary-button insight-stop"
            data-testid="insight-stop"
            onClick={() => abortRef.current?.abort()}
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

      {(promptPreview || result) && (
        <details className="insight-basis" data-testid="insight-basis">
          <summary>
            分析依据：本次发送给模型的数据摘要（{dataTables.length} 张数据表 ·{" "}
            {topicCount} 个主题域 · 高频公共代码 Top20）
          </summary>
          <pre>{promptPreview}</pre>
        </details>
      )}

      {result ? (
        <>
          <div className="insight-output-head">
            <div className="insight-output-title">
              <strong>洞察结果</strong>
              <small>
                共 {result.length.toLocaleString("zh-CN")} 字 · {elapsed}s ·{" "}
                {config.model}
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
            填写模型服务并测试连接后，点击右上角“生成洞察思路”，将基于整个数据源的资产结构生成五节洞察。生成过程逐字流式呈现（思考型模型先展示思考过程），可随时停止，完成后支持预览与下载（Markdown / HTML）。
          </div>
        )
      )}
    </div>
  );
});
