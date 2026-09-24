import type { DictionaryDataset } from "../import/types";

/** 洞察思路的模型服务配置（OpenAI 兼容），保存在本机浏览器。 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 网关不提供 /models 时置 true：模型名改为手动输入 */
  manualModel?: boolean;
}

const STORAGE_KEY = "data-dictionary-insights-llm";
const PROMPT_STORAGE_KEY = "data-dictionary-insights-prompt";
const RESULT_STORAGE_KEY = "data-dictionary-insight-result";

/** 可编辑的默认提示词模板；{数据摘要} 在发送时替换为自动生成的数据源摘要。 */
export const DEFAULT_INSIGHT_INSTRUCTIONS = `你是资深银行数据分析专家，正在为零售银行的数据资产梳理洞察思路。

业务背景参考（零售客户全生命周期模型运营体系）：
- 生命周期视角：客户旅程覆盖 新开户（首购模型）→ 首笔入金（资产提升、理财购买、定期存款购买）→ 多笔交易（流失预警、客群经营）等阶段，分析场景应尽量映射到客户所处阶段与对应模型建设目标。
- 特征体系视角：数据资产可归入九大类特征——自然人特征、用户资产配置特征、用户借记卡交易特征、用户存款行为特征、用户贷款行为特征、用户信用卡交易特征、用户理财行为特征、用户埋点行为特征、用户营销行为特征；识别核心实体可支撑的特征类别。

请基于数据摘要输出可直接落地的“洞察思路”，使用简体中文与 Markdown，按以下五节：
## 一、数据资产全景 —— 数据源的定位、规模与结构特征
## 二、主题域与核心实体 —— 主要主题域划分与每域核心实体（引用表英文名），并标注可归入的特征类别
## 三、可支撑的业务分析场景 —— 至少 6 条，尽量关联客户全生命周期阶段（首购/资产提升/理财购买/定存购买/流失预警等）
## 四、高价值关联路径 —— 借助公共代码/数据标准/主键可串联的字段与主题，指出可拼装的特征组合
## 五、落地建议 —— 建议的指标、看板与示例 SQL 思路（StarRocks 语法，1~2 条）

数据摘要：
{数据摘要}`;

export function loadInsightInstructions(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PROMPT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveInsightInstructions(instructions: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROMPT_STORAGE_KEY, instructions);
}

export interface PersistedInsightResult {
  result: string;
  generatedFor: string;
  model: string;
  elapsed: number;
  savedAt: string;
}

export function loadInsightResult(): PersistedInsightResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedInsightResult>;
    if (typeof parsed.result !== "string" || !parsed.result.trim()) return null;
    return {
      result: parsed.result,
      generatedFor: parsed.generatedFor ?? "",
      model: parsed.model ?? "",
      elapsed: parsed.elapsed ?? 0,
      savedAt: parsed.savedAt ?? "",
    };
  } catch {
    return null;
  }
}

export function saveInsightResult(record: PersistedInsightResult): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(record));
}

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

/** 服务地址只允许 http/https，拦截 file:、javascript: 等危险协议。 */
function assertHttpAddress(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("服务地址格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("服务地址仅支持 http/https。");
  }
}

function authHeaders(apiKey: string): Record<string, string> {
  return apiKey.trim()
    ? { Authorization: `Bearer ${apiKey.trim()}` }
    : {};
}

/** 测试连通性并拉取可用模型列表（GET /models，兼容OpenAI协议接口）。 */
export async function listModels(config: LlmConfig): Promise<string[]> {
  if (!config.baseUrl.trim()) throw new Error("请先填写服务地址。");
  assertHttpAddress(config.baseUrl);
  const response = await fetch(resolveEndpoint(config.baseUrl, "models"), {
    method: "GET",
    headers: { ...authHeaders(config.apiKey) },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(`服务可达但鉴权失败（${response.status}），请检查 API Key。`);
  }
  if (response.status === 404 || response.status === 405) {
    throw Object.assign(
      new Error("该网关未提供 /models 接口（" + response.status + "），可切换为手动输入模型名。"),
      { code: "MODELS_UNSUPPORTED" as const },
    );
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
    throw Object.assign(
      new Error("服务未返回可用模型（/models 返回空），可切换为手动输入模型名。"),
      { code: "MODELS_UNSUPPORTED" as const },
    );
  }
  return models;
}

/** 自动生成的数据源摘要：规模、主题分布、表清单与高频公共代码。 */
export function buildDatasetSummary(dataset: DictionaryDataset): string {
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
    `数据源：${dataset.sourceFile}（解析器：${dataset.adapterName}）`,
    `规模：数据表 ${dataTables.length} 张${tagViewCount ? `（另有标签/视图 ${tagViewCount} 个）` : ""}、字段 ${dataset.fields.length} 个、数据标准 ${dataset.standards.length} 条、代码集 ${codeSetCount} 个（代码值 ${dataset.codeItems.length} 条）`,
    `字段引用：${standardRefCount} 个字段挂接了数据标准；引用公共代码的字段共 ${codeRefCount.size} 种代码`,
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

/** 组合最终提示词：自定义指令中的 {数据摘要} 占位符替换为摘要；未写占位符则附加在末尾。 */
export function composeInsightPrompt(
  instructions: string,
  dataset: DictionaryDataset,
): string {
  const template = instructions.trim() || DEFAULT_INSIGHT_INSTRUCTIONS;
  const summary = buildDatasetSummary(dataset);
  if (template.includes("{数据摘要}")) {
    return template.replace("{数据摘要}", summary);
  }
  return `${template}\n\n${summary}`;
}

export interface InsightRequestHandlers {
  /** 流式输出：每收到一段增量正文回调一次（服务不支持流式时会在结束时整段回调一次）。 */
  onDelta?: (chunk: string) => void;
  /** 思考型模型（如 GLM-4.5+）的思考过程增量；思考阶段可能持续较久，单独透出避免"卡死"观感。 */
  onReasoning?: (chunk: string) => void;
  /** 传入 AbortSignal 可随时中止生成。 */
  signal?: AbortSignal;
}

interface SseDelta {
  choices?: {
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string };
  }[];
}

export async function requestInsights(
  config: LlmConfig,
  prompt: string,
  handlers: InsightRequestHandlers = {},
): Promise<string> {
  assertHttpAddress(config.baseUrl);
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

  const emit = (json: SseDelta, full: { content: string }) => {
    const delta = json.choices?.[0]?.delta;
    if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
      handlers.onReasoning?.(delta.reasoning_content);
    }
    const piece =
      typeof delta?.content === "string" && delta.content
        ? delta.content
        : typeof json.choices?.[0]?.message?.content === "string"
          ? json.choices[0].message.content
          : "";
    if (piece) {
      full.content += piece;
      handlers.onDelta?.(piece);
    }
  };

  // 没有响应体（部分网关/mock 直接给 JSON）：整段解析。
  if (!response.body) {
    const payload = (await response.json()) as SseDelta;
    const full = { content: "" };
    emit(payload, full);
    if (!full.content.trim()) throw new Error("模型服务未返回内容。");
    return full.content;
  }

  // 首块嗅探：很多网关的 SSE 响应缺少 text/event-stream 头，
  // 不能只信 content-type —— 以首个数据块是否以 "data:" 开头来判断流式/整段。
  const contentType =
    typeof response.headers?.get === "function"
      ? response.headers.get("content-type") ?? ""
      : "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let firstChunk = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    firstChunk += decoder.decode(value, { stream: true });
    if (firstChunk.trim()) break;
  }
  const isSse =
    contentType.includes("text/event-stream") ||
    firstChunk.trimStart().replace(/^\uFEFF/, "").startsWith("data:");

  if (!isSse) {
    // 整段 JSON：把剩余内容拼完后一次解析。
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }
    const payload = JSON.parse(firstChunk + rest) as SseDelta;
    const full = { content: "" };
    emit(payload, full);
    if (!full.content.trim()) throw new Error("模型服务未返回内容。");
    return full.content;
  }

  // SSE 流式解析：data: {"choices":[{"delta":{"content":"…","reasoning_content":"…"}}]}
  let buffer = firstChunk;
  const full = { content: "" };
  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      emit(JSON.parse(data) as SseDelta, full);
    } catch {
      // 跳过无法解析的心跳/注释行
    }
  };
  for (;;) {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  if (buffer) consumeLine(buffer);
  if (!full.content.trim()) throw new Error("模型服务未返回内容。");
  return full.content;
}
