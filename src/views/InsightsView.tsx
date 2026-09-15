import { memo, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Lightbulb, Search } from "lucide-react";
import type { DictionaryDataset, TableRecord } from "../lib/import/types";
import VirtualList from "../components/VirtualList";
import { EmptyState } from "../components/Primitives";
import {
  buildInsightPrompt,
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
  initialTableId,
}: {
  dataset: DictionaryDataset;
  initialTableId: string;
}) {
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState(initialTableId);
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});

  const selected = useMemo(
    () =>
      dataset.tables.find((table) => table.id === selectedId) ??
      dataset.tables.find((table) => !table.entityKind) ??
      null,
    [dataset.tables, selectedId],
  );
  const fields = useMemo(
    () =>
      selected
        ? dataset.fields.filter((field) => field.tableId === selected.id)
        : [],
    [dataset.fields, selected],
  );
  const keyword = filter.toLowerCase();
  const filteredTables = useMemo(
    () =>
      dataset.tables.filter((table) =>
        `${table.chineseName} ${table.englishName}`
          .toLowerCase()
          .includes(keyword),
      ),
    [dataset.tables, keyword],
  );

  const updateConfig = (patch: Partial<LlmConfig>) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveLlmConfig(next);
      return next;
    });
  };

  const generate = async () => {
    if (!selected) return;
    if (!config.baseUrl.trim() || !config.model.trim()) {
      setError("请先填写模型服务地址与模型名称。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const content = await requestInsights(
        config,
        buildInsightPrompt(selected, fields),
      );
      setResults((current) => ({ ...current, [selected.id]: content }));
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

  return (
    <div className="compact-directory">
      <aside className="compact-side">
        <div className="compact-side-head">
          <h2>洞察思路</h2>
          <span className="count-badge">{dataset.tables.length}</span>
        </div>
        <div className="mini-search">
          <Search size={15} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="选择要分析的数据表"
          />
        </div>
        <VirtualList<TableRecord>
          className="insights-table-list"
          ariaLabel="数据表列表"
          items={filteredTables}
          getItemKey={(table) => table.id}
          onItemSelect={(table) => setSelectedId(table.id)}
          renderItem={(table) => (
            <span className="compact-row-wrap">
              <span className="compact-row">
                <strong>{table.chineseName}</strong>
                <small>
                  {table.englishName} · {table.fieldCount} 字段
                </small>
              </span>
              {table.entityKind && (
                <span
                  className={`soft-badge entity-badge ${table.entityKind === "tag" ? "orange" : "blue"}`}
                >
                  {table.entityKind === "tag" ? "标签" : "视图"}
                </span>
              )}
            </span>
          )}
        />
      </aside>
      <div className="compact-detail insights-detail">
        {selected ? (
          <>
            <div className="detail-header small">
              <div>
                <div className="detail-breadcrumb">
                  <span>洞察思路</span>
                  <ChevronRight size={13} />
                  <span>{selected.topic || "数据表"}</span>
                </div>
                <h2>{selected.chineseName}</h2>
                <div className="table-english">
                  <code>{selected.englishName}</code>
                  <span className="soft-badge blue">{fields.length} 字段</span>
                </div>
              </div>
              <button
                type="button"
                className="primary-button"
                data-testid="insight-generate"
                disabled={loading}
                onClick={() => void generate()}
              >
                <Lightbulb size={15} />
                {loading ? "生成中…" : "生成洞察思路"}
              </button>
            </div>

            <div className="insight-config">
              <div className="detail-section-label">
                模型服务（OpenAI 兼容 /chat/completions）
              </div>
              <div className="insight-config-grid">
                <label>
                  服务地址
                  <input
                    data-testid="insight-base"
                    value={config.baseUrl}
                    onChange={(event) =>
                      updateConfig({ baseUrl: event.target.value })
                    }
                    placeholder="https://llm.intra/v1"
                  />
                </label>
                <label>
                  模型
                  <input
                    data-testid="insight-model"
                    value={config.model}
                    onChange={(event) =>
                      updateConfig({ model: event.target.value })
                    }
                    placeholder="如 glm-4、qwen2.5-72b"
                  />
                </label>
                <label>
                  API Key（可选）
                  <input
                    data-testid="insight-key"
                    type="password"
                    value={config.apiKey}
                    onChange={(event) =>
                      updateConfig({ apiKey: event.target.value })
                    }
                    placeholder="内网网关可不填"
                  />
                </label>
              </div>
              <p className="insight-config-note">
                配置仅保存在本机浏览器。生成时会把所选表的字段名与备注发送至上方地址，请确认其符合行内数据安全要求。
              </p>
            </div>

            {error && (
              <div className="insight-error">
                <AlertTriangle size={15} />
                {error}
              </div>
            )}

            {results[selected.id] ? (
              <MarkdownLite text={results[selected.id]} />
            ) : (
              <div className="insights-empty-hint">
                {loading
                  ? "正在生成，稍候…"
                  : "点击右上角“生成洞察思路”，基于该表字段生成业务理解、可回答的业务问题、指标维度与示例 SQL 思路。"}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="选择一张数据表" />
        )}
      </div>
    </div>
  );
});
