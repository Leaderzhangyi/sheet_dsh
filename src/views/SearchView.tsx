import { memo } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Search,
  Table2,
} from "lucide-react";
import type {
  DictionaryDataset,
  FieldRecord,
  StandardRecord,
} from "../lib/import/types";
import { searchDataset, type SearchResult, type SearchType } from "../lib/search/search";
import { typeLabels } from "../lib/navigation";
import { formatDate, type DatasetOrigin } from "../lib/workspace";

export default memo(function SearchView({
  dataset,
  origin,
  cacheAvailable,
  query,
  setQuery,
  searchFilter,
  setSearchFilter,
  response,
  onOpenTable,
  onOpenField,
  onOpenStandard,
  onOpenCode,
}: {
  dataset: DictionaryDataset;
  origin: DatasetOrigin;
  cacheAvailable: boolean;
  query: string;
  setQuery: (value: string) => void;
  searchFilter: SearchType | "all";
  setSearchFilter: (value: SearchType | "all") => void;
  response: ReturnType<typeof searchDataset>;
  onOpenTable: (id: string) => void;
  onOpenField: (field: FieldRecord) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
}) {
  const showResults = query.trim().length > 0;
  return (
    <div className="search-page">
      <section className={`search-hero ${showResults ? "compact" : ""}`}>
        <div className="eyebrow">
          <span className="eyebrow-line" />
          LOCAL INDEX <span className="eyebrow-cn">本地数据字典</span>
        </div>
        <h1>{showResults ? "搜索结果" : "找到你要的字段。"}</h1>
        {!showResults && (
          <p className="hero-copy">
            在表、字段、标准和公共代码之间，建立一条更短的查询路径。
          </p>
        )}
        <div className="global-search-wrap">
          <Search size={19} className="global-search-icon" />
          <input
            data-testid="global-search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索中文名、英文标识、标准编号或代码值"
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="filter-row" role="tablist" aria-label="搜索范围">
          {(["all", "table", "field", "standard", "code"] as const).map(
            (filter) => (
              <button
                key={filter}
                className={`filter-chip ${searchFilter === filter ? "selected" : ""}`}
                onClick={() => setSearchFilter(filter)}
              >
                {filter === "all" ? "全部" : typeLabels[filter]}
              </button>
            ),
          )}
        </div>
      </section>
      {showResults ? (
        <SearchResults
          response={response}
          query={query}
          dataset={dataset}
          onOpenTable={onOpenTable}
          onOpenField={onOpenField}
          onOpenStandard={onOpenStandard}
          onOpenCode={onOpenCode}
        />
      ) : (
        <HomeSummary
          dataset={dataset}
          origin={origin}
          cacheAvailable={cacheAvailable}
          onSearch={setQuery}
        />
      )}
    </div>
  );
});

function HomeSummary({
  dataset,
  origin,
  cacheAvailable,
  onSearch,
}: {
  dataset: DictionaryDataset;
  origin: DatasetOrigin;
  cacheAvailable: boolean;
  onSearch: (query: string) => void;
}) {
  const metrics = [
    {
      label: "数据表",
      value: dataset.stats.tableCount,
      icon: Table2,
      accent: "red",
    },
    {
      label: "字段",
      value: dataset.stats.fieldCount,
      icon: Braces,
      accent: "blue",
    },
    {
      label: "标准",
      value: dataset.stats.standardCount,
      icon: BookOpen,
      accent: "green",
    },
    {
      label: "代码明细",
      value: dataset.stats.codeItemCount,
      icon: Code2,
      accent: "orange",
    },
  ];
  return (
    <div className="home-summary">
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
      <div className="workspace-grid">
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="section-kicker">QUICK ACCESS</span>
              <h2>常用入口</h2>
            </div>
            <ArrowUpRight size={17} />
          </div>
          <div className="quick-list">
            <button onClick={() => onSearch("法人代码")}>
              <span className="quick-number">01</span>
              <span>
                <strong>法人代码</strong>
                <small>字段 / 标准 / 公共代码</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => onSearch("a_pub_dpsit_acct_bal_view")}>
              <span className="quick-number">02</span>
              <span>
                <strong>存款账户余额信息视图</strong>
                <small>按英文表名定位结构</small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => onSearch("SCBTS0000046")}>
              <span className="quick-number">03</span>
              <span>
                <strong>SCBTS0000046</strong>
                <small>数据标准编号</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <section className="section-block source-summary">
          <div className="section-heading">
            <div>
              <span className="section-kicker">INDEX STATUS</span>
              <h2>索引状态</h2>
            </div>
            <span className="healthy-badge">
              <Check size={13} /> READY
            </span>
          </div>
          <div className="index-summary">
            <div>
              <span>当前来源</span>
              <strong>{dataset.sourceFile}</strong>
            </div>
            <div>
              <span>解析器</span>
              <strong>{dataset.adapterName}</strong>
            </div>
            <div>
              <span>最后导入</span>
              <strong>{formatDate(dataset.importedAt)}</strong>
            </div>
          </div>
          <div
            className={`index-note ${cacheAvailable ? "" : "warning-text"}`}
            data-testid="cache-status"
          >
            <span className="status-dot" />
            {cacheAvailable
              ? `${origin === "cache" ? "已从 IndexedDB 恢复" : "IndexedDB 本地索引已同步"}`
              : "当前浏览器无法持久化索引"}
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchResults({
  response,
  query,
  dataset,
  onOpenTable,
  onOpenField,
  onOpenStandard,
  onOpenCode,
}: {
  response: ReturnType<typeof searchDataset>;
  query: string;
  dataset: DictionaryDataset;
  onOpenTable: (id: string) => void;
  onOpenField: (field: FieldRecord) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
}) {
  return (
    <section className="results-section" data-testid="search-results">
      <div className="results-toolbar">
        <span>
          为 <strong>“{query}”</strong> 找到 {response.results.length} 条结果
        </span>
        <span className="result-meta">{dataset.sourceFile}</span>
      </div>
      {response.results.length === 0 ? (
        <div className="no-results">
          <div className="no-results-mark">
            <Search size={20} />
          </div>
          <h3>没有匹配结果</h3>
          <p>尝试中文业务词、英文标识或标准编号。</p>
        </div>
      ) : (
        <div className="result-list">
          {response.results.map((result) => (
            <ResultRow
              key={result.id}
              result={result}
              dataset={dataset}
              onOpenTable={onOpenTable}
              onOpenField={onOpenField}
              onOpenStandard={onOpenStandard}
              onOpenCode={onOpenCode}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const ResultRow = memo(function ResultRow({
  result,
  dataset,
  onOpenTable,
  onOpenField,
  onOpenStandard,
  onOpenCode,
}: {
  result: SearchResult;
  dataset: DictionaryDataset;
  onOpenTable: (id: string) => void;
  onOpenField: (field: FieldRecord) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
}) {
  const handleOpen = () => {
    if (result.type === "table") onOpenTable(result.recordId);
    if (result.type === "field") {
      const field = dataset.fields.find((item) => item.id === result.recordId);
      if (field) onOpenField(field);
    }
    if (result.type === "standard") {
      const standard = dataset.standards.find(
        (item) => item.id === result.recordId,
      );
      if (standard) onOpenStandard(standard);
    }
    if (result.type === "code") onOpenCode(result.recordId);
  };
  return (
    <button
      className="result-row"
      data-testid={`${result.type}-result`}
      onClick={handleOpen}
    >
      <span className={`result-type ${result.type}`}>
        {typeLabels[result.type]}
      </span>
      <span className="result-main">
        <strong>{result.title}</strong>
        <small>{result.subtitle}</small>
      </span>
      <span className="match-copy">匹配于 {result.matchedOn.join("、")}</span>
      <ArrowUpRight size={16} className="result-open" />
    </button>
  );
});
