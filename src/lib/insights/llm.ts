import type { FieldRecord, TableRecord } from "../import/types";

/** 洞察思路的模型服务配置（OpenAI 兼容 /chat/completions），保存在本机浏览器。 */
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

export function buildInsightPrompt(
  table: TableRecord,
  fields: FieldRecord[],
): string {
  const fieldLines = fields.slice(0, 80).map((field) => {
    const tags: string[] = [];
    if (field.isPrimaryKey) tags.push("主键");
    if (field.publicCodeName) tags.push(`公共代码:${field.publicCodeName}`);
    if (field.standardNo) tags.push(`标准:${field.standardNo}`);
    if (field.remark && field.remark !== field.chineseName)
      tags.push(`备注:${field.remark.slice(0, 40)}`);
    return `${field.ordinal}. ${field.chineseName} | ${field.englishName} | ${field.fieldType || "—"}${tags.length ? ` | ${tags.join("；")}` : ""}`;
  });
  return [
    "你是资深银行数据分析专家。请基于下方数据字典信息，为这张表输出可直接落地的“洞察思路”。",
    "要求使用简体中文与 Markdown，按以下五节输出：",
    "## 一、业务理解 —— 这张表在业务上的定位与适用场景",
    "## 二、可回答的业务问题 —— 至少 5 条具体问题",
    "## 三、关键指标与维度 —— 建议的度量字段与维度字段（引用字段英文名）",
    "## 四、关联分析建议 —— 结合键字段/公共代码可串联的其他主题",
    "## 五、示例 SQL 思路 —— 1~2 条 GaussDB 语法示例（仅给思路）",
    "",
    `表：${table.chineseName}（${table.englishName}）`,
    `主题：${table.topic || "—"}；业务范围：${table.businessScope || "—"}；字段数：${fields.length}`,
    "",
    "字段清单：",
    ...fieldLines,
    fields.length > 80 ? `（仅列出前 80 个字段，共 ${fields.length} 个）` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function requestInsights(
  config: LlmConfig,
  prompt: string,
): Promise<string> {
  const base = config.baseUrl.trim().replace(/\/+$/, "");
  const endpoint = /\/chat\/completions$/.test(base)
    ? base
    : `${base}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `模型服务返回 ${response.status}${response.status === 401 ? "（检查 API Key）" : ""}`,
    );
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("模型服务未返回内容。");
  }
  return content.trim();
}
