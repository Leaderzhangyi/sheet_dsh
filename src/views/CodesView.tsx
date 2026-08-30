import { memo, useMemo, useState } from "react";
import { ArrowUpRight, ChevronRight, Search } from "lucide-react";
import type {
  CodeItemRecord,
  DictionaryDataset,
  FieldRecord,
} from "../lib/import/types";
import VirtualList from "../components/VirtualList";
import {
  ConfirmIconButton,
  ConfirmTextButton,
} from "../components/ConfirmButtons";
import { CopyButton, EmptyState } from "../components/Primitives";

interface CodeSetGroup {
  codeSetName: string;
  codeSetEnglishName: string;
  representative: CodeItemRecord;
  count: number;
}

export default memo(function CodesView({
  dataset,
  selectedCode,
  onSelect,
  onOpenField,
  onDeleteCodeSet,
  onDeleteCodeValue,
}: {
  dataset: DictionaryDataset;
  selectedCode: CodeItemRecord | null;
  onSelect: (code: CodeItemRecord) => void;
  onOpenField: (field: FieldRecord) => void;
  onDeleteCodeSet: (codeSetName: string) => void;
  onDeleteCodeValue: (codeId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const keyword = filter.toLowerCase();
  const codeSetCount = useMemo(
    () => new Set(dataset.codeItems.map((code) => code.codeSetName)).size,
    [dataset.codeItems],
  );
  // 关键字可以命中代码集内的任意代码值/描述，但左侧每个代码集只展示一条。
  const groups = useMemo(() => {
    const byName = new Map<string, CodeSetGroup>();
    for (const code of dataset.codeItems) {
      const haystack =
        `${code.codeSetName} ${code.codeSetEnglishName} ${code.value} ${code.valueDescription}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      const existing = byName.get(code.codeSetName);
      if (existing) {
        existing.count += 1;
        if (!existing.codeSetEnglishName && code.codeSetEnglishName) {
          existing.codeSetEnglishName = code.codeSetEnglishName;
        }
      } else {
        byName.set(code.codeSetName, {
          codeSetName: code.codeSetName,
          codeSetEnglishName: code.codeSetEnglishName,
          representative: code,
          count: 1,
        });
      }
    }
    return [...byName.values()];
  }, [dataset.codeItems, keyword]);
  const selectedName = selectedCode?.codeSetName.replace(/:$/, "");
  const codeSetItems = useMemo(
    () =>
      selectedName
        ? dataset.codeItems.filter((code) => code.codeSetName === selectedName)
        : [],
    [dataset.codeItems, selectedName],
  );
  const relatedFields = useMemo(
    () =>
      selectedName
        ? dataset.fields.filter((field) => field.publicCodeName === selectedName)
        : [],
    [dataset.fields, selectedName],
  );

  return (
    <div className="compact-directory">
      <aside className="compact-side">
        <div className="compact-side-head">
          <h2>公共代码</h2>
          <span className="count-badge" title="代码集数量 / 代码值数量">
            {codeSetCount.toLocaleString("zh-CN")} /{" "}
            {dataset.codeItems.length.toLocaleString("zh-CN")}
          </span>
        </div>
        <div className="mini-search" data-testid="code-directory-search">
          <Search size={15} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选代码名称、值或描述"
          />
        </div>
        {groups.length === 0 ? (
          <div className="standards-empty">没有匹配的代码</div>
        ) : (
          <VirtualList<CodeSetGroup>
            className="codes-list"
            ariaLabel="公共代码列表"
            items={groups}
            getItemKey={(group) => group.codeSetName}
            onItemSelect={(group) => onSelect(group.representative)}
            footer={
              <div className="standards-more" data-testid="codes-count">
                共 {groups.length.toLocaleString("zh-CN")} 个代码集
              </div>
            }
            renderItem={(group) => (
              <span className="compact-row-wrap">
                <span className="compact-row">
                  <strong>{group.codeSetName}</strong>
                  <small>
                    {group.codeSetEnglishName
                      ? `${group.codeSetEnglishName} · `
                      : ""}
                    {group.count} 个代码值
                  </small>
                </span>
                <ConfirmIconButton
                  label={`删除代码集：${group.codeSetName}`}
                  onConfirm={() => onDeleteCodeSet(group.codeSetName)}
                />
              </span>
            )}
          />
        )}
      </aside>
      <div className="compact-detail codes">
        {selectedCode ? (
          <>
            <div className="detail-header small">
              <div>
                <div className="detail-breadcrumb">
                  <span>公共代码</span>
                  <ChevronRight size={13} />
                  <span>{selectedCode.codeSetName}</span>
                </div>
                <h2>{selectedCode.codeSetName}</h2>
                <div className="table-english">
                  <code>{selectedCode.codeSetEnglishName || "—"}</code>
                </div>
              </div>
              <div className="header-badges">
                <span className="soft-badge orange">
                  {codeSetItems.length} 个值
                </span>
                <ConfirmTextButton
                  label="删除代码集"
                  onConfirm={() => onDeleteCodeSet(selectedCode.codeSetName)}
                />
              </div>
            </div>
            <div className="code-detail-grid">
              <div
                className="code-values code-values-scroll"
                data-testid="code-values"
              >
                {codeSetItems.map((code) => (
                  <div key={code.id} className="code-value-row">
                    <code>{code.value}</code>
                    <span>{code.valueDescription}</span>
                    <span className="code-value-actions">
                      <ConfirmIconButton
                        label={`删除代码值：${code.value}`}
                        onConfirm={() => onDeleteCodeValue(code.id)}
                      />
                      <CopyButton
                        value={code.value}
                        onCopy={(value) =>
                          void navigator.clipboard?.writeText(value)
                        }
                      />
                    </span>
                  </div>
                ))}
              </div>
              <section
                className="related-fields code-related-fields-scroll"
                data-testid="code-related-fields"
              >
                <div className="section-heading">
                  <div>
                    <span className="section-kicker">REFERENCES</span>
                    <h2>
                      引用字段 <small>{relatedFields.length}</small>
                    </h2>
                  </div>
                </div>
                <div
                  className="related-fields-list"
                  data-testid="code-related-fields-list"
                >
                  {relatedFields.map((field) => (
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
                </div>
              </section>
            </div>
          </>
        ) : (
          <EmptyState title="选择一个公共代码" />
        )}
      </div>
    </div>
  );
});
