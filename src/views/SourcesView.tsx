import { memo } from "react";
import { ArrowUpRight, FileSpreadsheet, Layers3, Upload } from "lucide-react";
import type { DictionaryDataset } from "../lib/import/types";
import { formatDate, originLabel, type DatasetOrigin } from "../lib/workspace";

export default memo(function SourcesView({
  dataset,
  origin,
  cacheAvailable,
  onOpenImport,
}: {
  dataset: DictionaryDataset;
  origin: DatasetOrigin;
  cacheAvailable: boolean;
  onOpenImport: () => void;
}) {
  return (
    <div className="sources-view">
      <div className="directory-header">
        <div>
          <span className="section-kicker">DATA SOURCES</span>
          <h1>数据源与导入</h1>
          <p>本地文件、解析器和索引状态。</p>
        </div>
        <button className="primary-button" onClick={onOpenImport}>
          <Upload size={16} />
          导入数据源
        </button>
      </div>
      <div className="source-overview">
        <div className="source-overview-main">
          <div className="large-file-icon">
            <FileSpreadsheet size={24} />
          </div>
          <div>
            <span className="source-status">
              <span className="status-dot" />
              {originLabel(origin)}
            </span>
            <h2>{dataset.sourceFile}</h2>
            <p>解析器：{dataset.adapterName}</p>
          </div>
        </div>
        <div className="source-stats">
          <span>
            工作表<strong>{dataset.stats.sheetCount}</strong>
          </span>
          <span>
            数据表<strong>{dataset.stats.tableCount}</strong>
          </span>
          <span>
            字段
            <strong>{dataset.stats.fieldCount.toLocaleString("zh-CN")}</strong>
          </span>
          <span>
            异常
            <strong className={dataset.stats.issueCount ? "warning-text" : ""}>
              {dataset.stats.issueCount}
            </strong>
          </span>
          <span>
            导入时间<strong>{formatDate(dataset.importedAt)}</strong>
          </span>
        </div>
      </div>
      <div className="import-hint">
        <Layers3 size={18} />
        <div>
          <strong>
            {cacheAvailable
              ? `${origin === "cache" ? "已从 IndexedDB 恢复" : "文件已建立 IndexedDB 本地索引"}`
              : "文件仅保留在当前页面内存中"}
          </strong>
          <p>
            {cacheAvailable
              ? "刷新页面后将直接恢复本地索引；原始文件不会被修改。"
              : "浏览器拒绝了 IndexedDB，刷新页面后需重新解析文件。"}
          </p>
        </div>
        <button className="secondary-button" onClick={onOpenImport}>
          更换数据源 <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
});
