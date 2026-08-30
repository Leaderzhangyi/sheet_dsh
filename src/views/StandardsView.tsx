import { memo, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import type {
  DictionaryDataset,
  FieldRecord,
  StandardRecord,
} from "../lib/import/types";
import VirtualList from "../components/VirtualList";
import { ConfirmIconButton } from "../components/ConfirmButtons";
import { CopyButton, EmptyState, Property } from "../components/Primitives";

export default memo(function StandardsView({
  dataset,
  selectedStandard,
  onSelect,
  onOpenField,
  onDeleteStandard,
}: {
  dataset: DictionaryDataset;
  selectedStandard: StandardRecord | null;
  onSelect: (standard: StandardRecord) => void;
  onOpenField: (field: FieldRecord) => void;
  onDeleteStandard: (standardId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const keyword = filter.toLowerCase();
  const filtered = useMemo(
    () =>
      dataset.standards.filter((standard) =>
        `${standard.standardNo} ${standard.chineseName} ${standard.englishName}`
          .toLowerCase()
          .includes(keyword),
      ),
    [dataset.standards, keyword],
  );
  const relatedFields = useMemo(
    () =>
      selectedStandard
        ? dataset.fields.filter(
            (field) => field.standardNo === selectedStandard.standardNo,
          )
        : [],
    [dataset.fields, selectedStandard],
  );

  return (
    <div className="compact-directory">
      <aside className="compact-side">
        <div className="compact-side-head">
          <h2>数据标准</h2>
          <span className="count-badge">
            {dataset.standards.length.toLocaleString("zh-CN")}
          </span>
        </div>
        <div className="mini-search">
          <Search size={15} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选标准（名称 / 编号 / 英文）"
            data-testid="standards-filter"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="standards-empty">没有匹配的标准</div>
        ) : (
          <VirtualList<StandardRecord>
            className="standards-list"
            ariaLabel="数据标准列表"
            items={filtered}
            getItemKey={(standard) => standard.id}
            onItemSelect={onSelect}
            footer={
              <div
                className="standards-more"
                data-testid="standards-count"
              >
                共 {filtered.length.toLocaleString("zh-CN")} 条
              </div>
            }
            renderItem={(standard) => (
              <span className="compact-row-wrap">
                <span className="compact-row">
                  <strong>
                    {standard.chineseName || standard.standardNo}
                  </strong>
                  <small>
                    {standard.standardNo}
                    {standard.topic ? ` · ${standard.topic}` : ""}
                  </small>
                </span>
                <ConfirmIconButton
                  label={`删除标准：${standard.chineseName || standard.standardNo}`}
                  onConfirm={() => onDeleteStandard(standard.id)}
                />
              </span>
            )}
          />
        )}
      </aside>
      <div className="compact-detail">
        {selectedStandard ? (
          <>
            <div className="detail-header small">
              <div>
                <div className="detail-breadcrumb">
                  <span>数据标准</span>
                  <ChevronRight size={13} />
                  <span>{selectedStandard.topic || "当前标准"}</span>
                </div>
                <h2>{selectedStandard.chineseName}</h2>
                <div className="table-english">
                  <code>{selectedStandard.standardNo}</code>
                  <CopyButton
                    value={selectedStandard.standardNo}
                    onCopy={(value) =>
                      void navigator.clipboard?.writeText(value)
                    }
                  />
                </div>
              </div>
              <span className="soft-badge blue">标准定义</span>
            </div>
            <div className="standard-properties">
              <Property
                label="英文简称"
                value={selectedStandard.englishName || "—"}
              />
              <Property label="主题" value={selectedStandard.topic || "—"} />
              <Property
                label="数据类型"
                value={selectedStandard.dataType || "—"}
              />
              <Property
                label="长度 / 精度"
                value={`${selectedStandard.dataLength || "—"} / ${selectedStandard.precision || "—"}`}
              />
            </div>
            <div className="related-fields">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">REFERENCES</span>
                  <h2>
                    引用字段 <small>{relatedFields.length}</small>
                  </h2>
                </div>
              </div>
              {relatedFields.slice(0, 300).map((field) => (
                <button
                  key={field.id}
                  className="related-row"
                  onClick={() => onOpenField(field)}
                >
                  <span>
                    <strong>{field.chineseName}</strong>
                    <small>
                      {field.tableChineseName} · {field.englishName}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {relatedFields.length > 300 && (
                <p className="standards-more">
                  仅列出前 300 个引用字段，共 {relatedFields.length} 个。
                </p>
              )}
            </div>
          </>
        ) : (
          <EmptyState title="选择一个数据标准" />
        )}
      </div>
    </div>
  );
});
