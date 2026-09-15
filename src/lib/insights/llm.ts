import type { DictionaryDataset } from "../import/types";

/** 洞察思路的模型服务配置（OpenAI 兼容），保存在本机浏览器。 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = "data-dictionary-insights-llm";

export function loadLlmConfig(): LlmConfig {
  if (typeof window === "undefined") return { baseUrl: "", apiKey: "", model: "" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LlmConfig>;
      return { baseUrl: "", apiKey: "", model: "", ...parsed };
    }
  } catch {
    // 忽略损坏的本地配置
  }
  return { baseUrl: "", apiKey: "", model: "" };
}

export function saveLlmConfig(config: LlmConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function resolveEndpoint(base: string, path: "models" | "chat/completions"): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (trimmed.endsWith(`/${path}`)) return trimmed;
  return `${trimmed}/${path}`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey.trim()
    ? { Authorization: `Bearer ${apiKey.trim()}` }
    : {};
}

/** 测试连通性并拉取可用模型列表（GET /models，OpenAI 兼容）。 */
export async function listModels(config: LlmConfig): Promise<string[]> {
  if (!config.baseUrl.trim()) throw new Error("请先填写服务地址。");
  const response = await fetch(resolveEndpoint(config.baseUrl, "models"), {
    method: "GET",
    headers: { ...authHeaders(config.apiKey) },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`服务可达但鉴权失败（${response.status}），请检查 API Key。`);
  }
  if (!response.ok) {
    throw new Error(`服务返回 ${response.status}，请确认地址是否为 OpenAI 兼容网关。`);
  }
  const payload = (await response.json()) as { data?: { id?: string }[] };
  const models = (payload.data ?? [])
    .map((item) => (typeof item?.id === "string" ? item.id.trim() : ""))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (models.length === 0) {
    throw new Error("服务未返回可用模型，请确认网关支持 /models 接口。");
  }
  return models;
}

/** 面向整个数据源构建洞察提示词：资产全景 + 主题分布 + 表清单 + 高频公共代码。 */
export function buildDatasetInsightPrompt(dataset: DictionaryDataset): string {
  const topicCount = new Map<string, number>();
  for (const table of dataset.tables) {
    const key = table.topic || "未分类";
    topicCount.set(key, (topicCount.get(key) ?? 0) + 1);
  }
  const topics = [...topicCount.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([name, count]) => `${name}(${count}张)`);

  const dataTables = dataset.tables.filter((table) => !table.entityKind);
  const tagViewCount = dataset.tables.length - dataTables.length;
  const tableLines = dataTables.slice(0, 150).map(
    (table) =>
      `${table.chineseName} | ${table.englishName} | ${table.fieldCount}字段${table.topic ? ` | ${table.topic}` : ""}`,
  );

  const codeRefCount = new Map<string, number>();
  let standardRefCount = 0;
  for (const field of dataset.fields) {
    if (field.publicCodeName) {
      codeRefCount.set(field.publicCodeName, (codeRefCount.get(field.publicCodeName) ?? 0) + 1);
    }
    if (field.standardNo) standardRefCount += 1;
  }
  const topCodes = [...codeRefCount.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([name, count]) => `${name}(被${count}个字段引用)`);
  const codeSetCount = new Set(dataset.codeItems.map((code) => code.codeSetName)).size;

  return [
    "你是资深银行数据分析专家。请基于下方数据字典信息，针对这整个数据源输出可直接落地的“洞察思路”。",
    "要求使用简体中文与 Markdown，按以下五节输出：",
    "## 一、数据资产全景 —— 数据源的定位、规模与结构特征",
    "## 二、主题域与核心实体 —— 主要主题域划分与每域的核心实体（引用表英文名）",
    "## 三、可支撑的业务分析场景 —— 至少 6 条跨表/跨主题的具体分析场景",
    "## 四、高价值关联路径 —— 借助公共代码/数据标准可串联的字段与主题",
    "## 五、落地建议 —— 建议的指标、看板与示例 SQL 思路（GaussDB 语法，1~2 条）",
    "",
    `数据源：${dataset.sourceFile}（解析器：${dataset.adapterName}）`,
    `规模：数据表 ${dataTables.length} 张${tagViewCount ? `（另有标签/视图 ${tagViewCount} 个）` : ""}、字段 ${dataset.fields.length} 个、数据标准 ${dataset.standards.length} 条、代码集 ${codeSetCount} 个（代码值 ${dataset.codeItems.length} 条）`,
    `字段引用：${standardRefCount} 个字段挂接了数据标准；引用公共代码的字段共 ${codeRefCount.size} 种代码`,
    "",
    `主题分布（前 ${topics.length}）：${topics.join("、") || "—"}`,
    "",
    "数据表清单：",
    ...tableLines,
    dataTables.length > 150 ? `（仅列出前 150 张，共 ${dataTables.length} 张）` : "",
    "",
    `高频公共代码（前 ${topCodes.length}）：${topCodes.join("、") || "—"}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export interface InsightRequestHandlers {
  /** 流式输出：每收到一段增量文本回调一次（服务不支持流式时会在结束时整段回调一次）。 */
  onDelta?: (chunk: string) => void;
  /** 传入 AbortSignal 可随时中止生成。 */
  signal?: AbortSignal;
}

export async function requestInsights(
  config: LlmConfig,
  prompt: string,
  handlers: InsightRequestHandlers = {},
): Promise<string> {
  const response = await fetch(resolveEndpoint(config.baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(config.apiKey),
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      stream: true,
    }),
    signal: handlers.signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`模型服务鉴权失败（${response.status}），请检查 API Key。`);
  }
  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}。`);
  }

  // 服务端忽略 stream 参数、直接整段返回 JSON 时，走一次性回调。
  const contentType =
    typeof response.headers?.get === "function"
      ? response.headers.get("content-type") ?? ""
      : "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("模型服务未返回内容。");
    }
    handlers.onDelta?.(content);
    return content;
  }

  // SSE 流式解析：data: {"choices":[{"delta":{"content":"…"}}]}
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          handlers.onDelta?.(delta);
        }
      } catch {
        // 跳过无法解析的心跳/注释行
      }
    }
  }
  if (!full.trim()) throw new Error("模型服务未返回内容。");
  return full;
}
