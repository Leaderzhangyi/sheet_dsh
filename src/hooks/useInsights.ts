import { useCallback, useRef, useState } from "react";
import type { DictionaryDataset } from "../lib/import/types";
import {
  composeInsightPrompt,
  listModels,
  loadInsightInstructions,
  loadInsightResult,
  loadLlmConfig,
  requestInsights,
  saveInsightInstructions,
  saveInsightResult,
  saveLlmConfig,
  type LlmConfig,
} from "../lib/insights/llm";

export interface InsightsState {
  config: LlmConfig;
  updateConfig: (patch: Partial<LlmConfig>) => void;
  /** 自定义提示词模板（空串表示使用默认模板）；{数据摘要} 会被自动替换 */
  instructions: string;
  updateInstructions: (value: string) => void;
  resetInstructions: () => void;
  models: string[];
  testing: boolean;
  testStatus: string;
  testConnection: () => Promise<void>;
  loading: boolean;
  error: string;
  result: string;
  reasoning: string;
  elapsed: number;
  streamedChars: number;
  promptPreview: string;
  /** 本次（或进行中）生成所基于的数据源文件名 */
  generatedFor: string;
  /** 结果保存时间（历史恢复时用于展示） */
  savedAt: string;
  generate: () => Promise<void>;
  stop: () => void;
}

const FLUSH_INTERVAL_MS = 120;

/**
 * 洞察生成的全局状态：挂在 App 层，切到其他页面（组件卸载）生成仍继续。
 * 生成完成自动写入 localStorage，刷新/重开页面后恢复最近一次结果。
 */
export function useInsights(dataset: DictionaryDataset | null): InsightsState {
  const [config, setConfig] = useState<LlmConfig>(() => loadLlmConfig());
  const [instructions, setInstructions] = useState<string>(() =>
    loadInsightInstructions(),
  );
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restored] = useState(() => loadInsightResult());
  const [result, setResult] = useState(() => restored?.result ?? "");
  const [reasoning, setReasoning] = useState("");
  const [elapsed, setElapsed] = useState(() => restored?.elapsed ?? 0);
  const [streamedChars, setStreamedChars] = useState(0);
  const [promptPreview, setPromptPreview] = useState("");
  const [generatedFor, setGeneratedFor] = useState(
    () => restored?.generatedFor ?? "",
  );
  const [savedAt, setSavedAt] = useState(() => restored?.savedAt ?? "");
  const abortRef = useRef<AbortController | null>(null);
  const resultBuffer = useRef("");
  const reasoningBuffer = useRef("");
  const charCount = useRef(0);
  const flushTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (resultBuffer.current) {
      const chunk = resultBuffer.current;
      resultBuffer.current = "";
      setResult((current) => current + chunk);
    }
    if (reasoningBuffer.current) {
      const chunk = reasoningBuffer.current;
      reasoningBuffer.current = "";
      setReasoning((current) => current + chunk);
    }
    if (charCount.current) {
      const count = charCount.current;
      charCount.current = 0;
      setStreamedChars((current) => current + count);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  const updateConfig = useCallback((patch: Partial<LlmConfig>) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      saveLlmConfig(next);
      return next;
    });
  }, []);

  const updateInstructions = useCallback((value: string) => {
    setInstructions(value);
    saveInsightInstructions(value);
  }, []);

  const resetInstructions = useCallback(() => {
    setInstructions("");
    saveInsightInstructions("");
  }, []);

  const testConnection = useCallback(async () => {
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
  }, [config]);

  const generate = useCallback(async () => {
    if (!dataset) return;
    if (!config.model) {
      setError("请先测试连接并选择模型。");
      return;
    }
    const prompt = composeInsightPrompt(instructions, dataset);
    const controller = new AbortController();
    abortRef.current = controller;
    resultBuffer.current = "";
    reasoningBuffer.current = "";
    charCount.current = 0;
    flush();
    setPromptPreview(prompt);
    setGeneratedFor(dataset.sourceFile);
    setResult("");
    setReasoning("");
    setElapsed(0);
    setStreamedChars(0);
    setSavedAt("");
    setLoading(true);
    setError("");
    let seconds = 0;
    let received = "";
    const timer = window.setInterval(() => {
      seconds += 1;
      setElapsed(seconds);
    }, 1000);
    try {
      const content = await requestInsights(config, prompt, {
        signal: controller.signal,
        onDelta: (chunk) => {
          received += chunk;
          resultBuffer.current += chunk;
          charCount.current += chunk.length;
          scheduleFlush();
        },
        onReasoning: (chunk) => {
          reasoningBuffer.current += chunk;
          scheduleFlush();
        },
      });
      received = content;
      flush();
      setResult(content);
    } catch (requestError) {
      flush();
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "模型服务调用失败。",
        );
      }
    } finally {
      window.clearInterval(timer);
      flush();
      // 完成或中断后，把已有结果（含用户停止时的部分结果）持久化，刷新不丢
      const persisted = received;
      if (persisted.trim()) {
        const stamp = new Date().toISOString();
        const record = {
          result: persisted,
          generatedFor: dataset.sourceFile,
          model: config.model,
          elapsed: seconds,
          savedAt: stamp,
        };
        saveInsightResult(record);
        setSavedAt(stamp);
        setElapsed(seconds);
      }
      setLoading(false);
      abortRef.current = null;
    }
  }, [config, dataset, flush, instructions, scheduleFlush]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    config,
    updateConfig,
    instructions,
    updateInstructions,
    resetInstructions,
    models,
    testing,
    testStatus,
    testConnection,
    loading,
    error,
    result,
    reasoning,
    elapsed,
    streamedChars,
    promptPreview,
    generatedFor,
    savedAt,
    generate,
    stop,
  };
}
