import { memo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Braces,
  Check,
  Code2,
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

/** 极简 Markdown 渲染：标题/列表/代码块，够展示模型输出即可，不引第三方库。 */
function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let codeLines: string[] | null = null;
  let listItems: string[] = [];
  let key = 0;
  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul className="insight-list" key={`list-${key++}`}>
          {listItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\*\*/g, "");
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (codeLines === null) {
        flushList();
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
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushList();
      blocks.push(
        <h4 className="insight-heading" key={`head-${key++}`}>
          {trimmed.replace(/^#{1,6}\s+/, "")}
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
        {trimmed}
      </p>,
    );
  }
  flushList();
  if (codeLines !== null) {
    blocks.push(
      <pre className="insight-code" key={`code-${key++}`}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }
  return <div className="insight-result">{blocks}</div>;
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
    setLoading(true);
    setError("");
    try {
      const content = await requestInsights(
        config,
        buildDatasetInsightPrompt(dataset),
      );
      setResult(content);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "模型服务调用失败。",
      );
    } finally {
      setLoading(false);
    }
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
            分析场景与落地建议。
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
          {loading ? "生成中…" : "生成洞察思路"}
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

      {result ? (
        <MarkdownLite text={result} />
      ) : (
        <div className="insights-empty-hint">
          {loading
            ? "正在生成，稍候…"
            : "填写模型服务并测试连接后，点击右上角“生成洞察思路”，将基于整个数据源的资产结构生成五节洞察：数据资产全景、主题域与核心实体、业务分析场景、高价值关联路径、落地建议。"}
        </div>
      )}
    </div>
  );
});
