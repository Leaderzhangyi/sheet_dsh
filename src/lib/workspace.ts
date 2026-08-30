import type { DictionaryDataset } from "./import/types";
import type { DatasetSlot, DatasetSource } from "./storage/indexedDb";

export type DatasetOrigin = "bundled" | "uploaded" | "cache";
export type WorkspaceDatasets = Partial<Record<DatasetSlot, DictionaryDataset>>;
export type WorkspaceOrigins = Partial<Record<DatasetSlot, DatasetOrigin>>;
export type WorkspaceSources = Partial<Record<DatasetSlot, DatasetSource>>;

export function refreshStats(dataset: DictionaryDataset): DictionaryDataset {
  return {
    ...dataset,
    stats: {
      ...dataset.stats,
      tableCount: dataset.tables.length,
      fieldCount: dataset.fields.length,
      standardCount: dataset.standards.length,
      codeItemCount: dataset.codeItems.length,
    },
  };
}

export function originLabel(origin: DatasetOrigin) {
  return origin === "cache"
    ? "本地索引"
    : origin === "uploaded"
      ? "本地导入"
      : "默认数据源";
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
