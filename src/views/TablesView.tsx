import { memo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  ChevronRight,
  Clipboard,
  Code2,
  FileSpreadsheet,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type {
  DictionaryDataset,
  FieldLineage,
  FieldRecord,
  StandardRecord,
  TableRecord,
} from "../lib/import/types";
import {
  ConfirmIconButton,
  ConfirmTextButton,
} from "../components/ConfirmButtons";
import {
  CopyButton,
  EmptyState,
  KeyFlags,
  MetaItem,
  Property,
} from "../components/Primitives";

export default memo(function TablesView({
  dataset,
  selectedTable,
  selectedField,
  onSelectTable,
  onSelectField,
  onCloseField,
  onCopy,
  onOpenStandard,
  onOpenCode,
  onOpenWarehouseLineage,
  onDeleteTable,
  onDeleteField,
}: {
  dataset: DictionaryDataset;
  selectedTable?: TableRecord;
  selectedField: FieldRecord | null;
  onSelectTable: (id: string) => void;
  onSelectField: (field: FieldRecord) => void;
  onCloseField: () => void;
  onCopy: (value: string) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
  onOpenWarehouseLineage: (lineage: FieldLineage) => void;
  onDeleteTable: (tableId: string) => void;
  onDeleteField: (fieldId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [showTagViews, setShowTagViews] = useState(false);
  // 标签管理系统的标签/各类视图默认不混入表目录，可通过开关查看。
  const dataTables = dataset.tables.filter((table) => !table.entityKind);
  const tagViewCount = dataset.tables.length - dataTables.length;
  const keyword = filter.toLowerCase();
  const visibleTables = (showTagViews ? dataset.tables : dataTables).filter(
    (table) =>
      `${table.chineseName} ${table.englishName}`
        .toLowerCase()
        .includes(keyword),
  );
  const fields = selectedTable
    ? dataset.fields.filter((field) => field.tableId === selectedTable.id)
    : [];
  return (
    <div className="catalog-layout">
      <aside className="catalog-sidebar">
        <div className="catalog-title">
          <div>
            <span className="section-kicker">CATALOG</span>
            <h2>表目录</h2>
          </div>
          <span className="count-badge" title="数据表 / 标签视图">
            {dataTables.length}
            {tagViewCount > 0 ? ` +${tagViewCount}` : ""}
          </span>
        </div>
        <div className="mini-search">
          <Search size={15} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="筛选表"
          />
        </div>
        {tagViewCount > 0 && (
          <button
            type="button"
            className={`filter-chip tag-toggle ${showTagViews ? "selected" : ""}`}
            data-testid="toggle-tag-views"
            aria-pressed={showTagViews}
            onClick={() => setShowTagViews((current) => !current)}
          >
            {showTagViews ? "隐藏" : "显示"}标签/视图 · {tagViewCount}
          </button>
        )}
        <div className="table-list">
          {visibleTables.map((table) => (
            <div key={table.id} className="table-list-row">
              <button
                className={`table-list-item ${selectedTable?.id === table.id ? "active" : ""}`}
                onClick={() => onSelectTable(table.id)}
              >
                <span className="table-list-copy">
                  <strong>{table.chineseName}</strong>
                  <small>{table.englishName}</small>
                </span>
                {table.entityKind && (
                  <span
                    className={`soft-badge entity-badge ${table.entityKind === "tag" ? "orange" : "blue"}`}
                  >
                    {table.entityKind === "tag" ? "标签" : "视图"}
                  </span>
                )}
                <span className="field-count">{table.fieldCount}</span>
              </button>
              <ConfirmIconButton
                label={`删除表：${table.chineseName}`}
                onConfirm={() => onDeleteTable(table.id)}
              />
            </div>
          ))}
        </div>
      </aside>
      <main className="table-workspace">
        {selectedTable ? (
          <TableDetail
            table={selectedTable}
            fields={fields}
            selectedField={selectedField}
            onSelectField={onSelectField}
            onCloseField={onCloseField}
            onCopy={onCopy}
            onOpenStandard={onOpenStandard}
            onOpenCode={onOpenCode}
            onOpenWarehouseLineage={onOpenWarehouseLineage}
            onDeleteTable={onDeleteTable}
            onDeleteField={onDeleteField}
          />
        ) : (
          <EmptyState title="请选择一张表" />
        )}
      </main>
    </div>
  );
});

const fieldColumnDefs = [
  { key: "type", label: "类型" },
  { key: "keys", label: "键属性" },
  { key: "standard", label: "标准编号" },
  { key: "code", label: "公共代码" },
] as const;
type FieldColumnKey = (typeof fieldColumnDefs)[number]["key"];
type FieldColumnState = Record<FieldColumnKey, boolean>;
const allColumnsVisible: FieldColumnState = {
  type: false,
  keys: false,
  standard: false,
  code: false,
};

function TableDetail({
  table,
  fields,
  selectedField,
  onSelectField,
  onCloseField,
  onCopy,
  onOpenStandard,
  onOpenCode,
  onOpenWarehouseLineage,
  onDeleteTable,
  onDeleteField,
}: {
  table: TableRecord;
  fields: FieldRecord[];
  selectedField: FieldRecord | null;
  onSelectField: (field: FieldRecord) => void;
  onCloseField: () => void;
  onCopy: (value: string) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
  onOpenWarehouseLineage: (lineage: FieldLineage) => void;
  onDeleteTable: (tableId: string) => void;
  onDeleteField: (fieldId: string) => void;
}) {
  const [fieldFilter, setFieldFilter] = useState("");
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] =
    useState<FieldColumnState>(allColumnsVisible);
  const showColumn = (key: FieldColumnKey) => !hiddenColumns[key];
  const hiddenCount = fieldColumnDefs.filter(
    (column) => hiddenColumns[column.key],
  ).length;
  const filtered = fields.filter((field) =>
    `${field.chineseName} ${field.englishName}`
      .toLowerCase()
      .includes(fieldFilter.toLowerCase()),
  );
  return (
    <div className="table-detail" data-testid="table-detail">
      <div className="detail-header">
        <div>
          <div className="detail-breadcrumb">
            <span>表目录</span>
            <ChevronRight size={13} />
            <span>{table.topic || "未分类"}</span>
          </div>
          <h1>{table.chineseName}</h1>
          <div className="table-english">
            {table.englishName}
            <CopyButton value={table.englishName} onCopy={onCopy} />
          </div>
        </div>
        <div className="header-badges">
          <span className="soft-badge red">{table.topic || "未分类"}</span>
          <span className="soft-badge green">
            <span className="badge-dot" />
            每日加载
          </span>
          <ConfirmTextButton
            label="删除此表"
            onConfirm={() => onDeleteTable(table.id)}
          />
        </div>
      </div>
      <div className="table-meta-grid">
        <MetaItem label="业务范围" value={table.businessScope || "—"} wide />
        <MetaItem label="责任人" value={table.owner || "—"} />
        <MetaItem label="保留时效" value={table.retention || "—"} />
        <MetaItem label="加载策略" value={table.loadStrategy || "—"} />
      </div>
      <div className="fields-toolbar">
        <div>
          <span className="section-kicker">SCHEMA</span>
          <h2>
            字段结构 <small>{fields.length} 个字段</small>
          </h2>
        </div>
        <div className="field-toolbar-right">
          <div className="mini-search field-search">
            <Search size={15} />
            <input
              value={fieldFilter}
              onChange={(event) => setFieldFilter(event.target.value)}
              placeholder="筛选字段"
            />
          </div>
          <div className="field-settings-wrap">
            <button
              type="button"
              className="icon-button"
              title="字段显示设置"
              data-testid="field-column-toggle"
              aria-haspopup="menu"
              aria-expanded={columnMenuOpen}
              onClick={() => setColumnMenuOpen((open) => !open)}
            >
              <Settings2 size={16} />
            </button>
            {columnMenuOpen && (
              <>
                <div
                  className="settings-backdrop"
                  onClick={() => setColumnMenuOpen(false)}
                />
                <div
                  className="field-column-menu"
                  role="menu"
                  data-testid="field-column-menu"
                >
                  <div className="settings-menu-head">
                    <span>字段显示设置</span>
                    <small>
                      {hiddenCount > 0 ? `已隐藏 ${hiddenCount} 列` : "全部列可见"}
                    </small>
                  </div>
                  {fieldColumnDefs.map((column) => (
                    <label
                      key={column.key}
                      className="field-column-menu-item"
                      role="menuitemcheckbox"
                      aria-checked={showColumn(column.key)}
                    >
                      <input
                        type="checkbox"
                        data-testid={`field-column-${column.key}`}
                        checked={showColumn(column.key)}
                        onChange={() =>
                          setHiddenColumns((current) => ({
                            ...current,
                            [column.key]: !current[column.key],
                          }))
                        }
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      role="menuitem"
                      className="settings-menu-item"
                      onClick={() => setHiddenColumns(allColumnsVisible)}
                    >
                      全部显示
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="field-table-wrap">
        <table className="field-table">
          <thead>
            <tr>
              <th className="number-col">#</th>
              <th>字段中文名</th>
              <th>字段英文名</th>
              {showColumn("type") && <th>类型</th>}
              {showColumn("keys") && <th>键</th>}
              {showColumn("standard") && <th>标准编号</th>}
              {showColumn("code") && <th>公共代码</th>}
              <th aria-label="操作" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((field) => (
              <tr
                key={field.id}
                className={selectedField?.id === field.id ? "selected" : ""}
                onClick={() => onSelectField(field)}
              >
                <td className="number-col">
                  {String(field.ordinal).padStart(2, "0")}
                </td>
                <td>
                  <strong>{field.chineseName}</strong>
                </td>
                <td>
                  <code>{field.englishName}</code>
                </td>
                {showColumn("type") && (
                  <td>
                    <code className="type-code">{field.fieldType || "—"}</code>
                  </td>
                )}
                {showColumn("keys") && (
                  <td>
                    <KeyFlags field={field} />
                  </td>
                )}
                {showColumn("standard") && (
                  <td>
                    {field.standardNo ? (
                      <button
                        className="inline-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          const standard = {
                            id: field.standardNo,
                            standardNo: field.standardNo,
                            chineseName: field.chineseName,
                            englishName: "",
                            topic: "",
                            dataType: "",
                            dataLength: "",
                            precision: "",
                            sourceSheet: field.sourceSheet,
                            sourceRow: field.sourceRow,
                          };
                          onOpenStandard(standard);
                        }}
                      >
                        {field.standardNo}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                {showColumn("code") && (
                  <td>
                    {field.publicCodeName ? (
                      <button
                        className="code-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          const item = {
                            id: `${field.publicCodeName}:`,
                            codeSetName: field.publicCodeName,
                            codeSetEnglishName: "",
                            value: "",
                            valueDescription: "",
                            standardNo: "",
                            standardName: "",
                            sourceSheet: field.sourceSheet,
                            sourceRow: field.sourceRow,
                          };
                          onOpenCode(item.id);
                        }}
                      >
                        {field.publicCodeName}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                <td className="row-actions">
                  <ConfirmIconButton
                    label={`删除字段：${field.chineseName}`}
                    onConfirm={() => onDeleteField(field.id)}
                  />
                  <ArrowUpRight size={15} className="row-arrow" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="table-empty">没有匹配字段</div>
        )}
      </div>
      {selectedField && (
        <FieldDetail
          field={selectedField}
          onClose={onCloseField}
          onCopy={onCopy}
          onOpenStandard={onOpenStandard}
          onOpenCode={onOpenCode}
          onOpenWarehouseLineage={onOpenWarehouseLineage}
          onDeleteField={onDeleteField}
        />
      )}
    </div>
  );
}

function FieldDetail({
  field,
  onClose,
  onCopy,
  onOpenStandard,
  onOpenCode,
  onOpenWarehouseLineage,
  onDeleteField,
}: {
  field: FieldRecord;
  onClose: () => void;
  onCopy: (value: string) => void;
  onOpenStandard: (standard: StandardRecord) => void;
  onOpenCode: (id: string) => void;
  onOpenWarehouseLineage: (lineage: FieldLineage) => void;
  onDeleteField: (fieldId: string) => void;
}) {
  return (
    <aside
      className="field-detail field-detail-drawer"
      data-testid="field-detail"
    >
      <div className="field-detail-header">
        <div>
          <span className="section-kicker">FIELD DETAIL</span>
          <h2>{field.chineseName}</h2>
          <code>{field.englishName}</code>
        </div>
        <button className="icon-button" title="关闭字段详情" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="detail-section">
        <div className="detail-section-label">存储定义</div>
        <div className="property-grid">
          <Property label="高斯类型" value={field.fieldType} mono />
          <Property label="SR 类型" value={field.srFieldType || "—"} mono />
          <Property label="数据长度" value={field.dataLength || "—"} />
          <Property label="字段序号" value={String(field.ordinal)} />
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-label">键属性</div>
        <div className="key-row">
          <KeyFlags field={field} large />
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-section-label">关联对象</div>
        <div className="relation-list">
          {field.standardNo && (
            <button
              onClick={() =>
                onOpenStandard({
                  id: field.standardNo,
                  standardNo: field.standardNo,
                  chineseName: field.chineseName,
                  englishName: "",
                  topic: "",
                  dataType: "",
                  dataLength: "",
                  precision: "",
                  sourceSheet: field.sourceSheet,
                  sourceRow: field.sourceRow,
                })
              }
            >
              <BookOpen size={15} />
              <span>
                <strong>{field.standardNo}</strong>
                <small>数据标准</small>
              </span>
              <ChevronRight size={15} />
            </button>
          )}
          {field.publicCodeName && (
            <button onClick={() => onOpenCode(`${field.publicCodeName}:`)}>
              <Braces size={15} />
              <span>
                <strong>{field.publicCodeName}</strong>
                <small>公共代码</small>
              </span>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
      {field.lineage && (
        <LineageDetail
          lineage={field.lineage}
          onOpenWarehouseLineage={onOpenWarehouseLineage}
        />
      )}
      <div className="detail-section">
        <div className="detail-section-label">备注</div>
        <p className="field-note">{field.remark || "暂无备注"}</p>
      </div>
      <div className="field-actions">
        <button
          className="secondary-button"
          onClick={() => onCopy(field.englishName)}
        >
          <Clipboard size={15} />
          复制字段名
        </button>
        <button
          className="secondary-button"
          onClick={() => onCopy(`${field.englishName} ${field.fieldType}`)}
        >
          <Code2 size={15} />
          复制定义
        </button>
      </div>
      <div className="field-actions">
        <ConfirmTextButton
          label="删除字段"
          onConfirm={() => onDeleteField(field.id)}
        />
      </div>
      <div className="source-line">
        <FileSpreadsheet size={14} />
        {field.sourceSheet} · 第 {field.sourceRow} 行
      </div>
    </aside>
  );
}

function LineageDetail({
  lineage,
  onOpenWarehouseLineage,
}: {
  lineage: FieldLineage;
  onOpenWarehouseLineage: (lineage: FieldLineage) => void;
}) {
  const sourceTable = [
    lineage.sourceTableChineseName,
    lineage.sourceTableEnglishName,
  ]
    .filter(Boolean)
    .join(" · ");
  const sourceField = [
    lineage.sourceFieldChineseName,
    lineage.sourceFieldEnglishName,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section
      className="detail-section lineage-section"
      data-testid="field-lineage"
    >
      <div className="detail-section-label">数仓血缘与加工</div>
      <div className="lineage-properties">
        <Property label="来源系统" value={lineage.sourceSystem || "—"} />
        <Property label="来源表" value={sourceTable || "—"} />
        <Property label="来源字段" value={sourceField || "—"} />
      </div>
      {lineage.mappingRule && (
        <div className="lineage-rule">
          <span>SQL 加工 / 映射规则</span>
          <code>{lineage.mappingRule}</code>
        </div>
      )}
      {lineage.sourceRemark && (
        <p className="lineage-note">{lineage.sourceRemark}</p>
      )}
      {(lineage.sourceTableChineseName || lineage.sourceTableEnglishName) && (
        <button
          className="secondary-button lineage-jump"
          onClick={() => onOpenWarehouseLineage(lineage)}
        >
          跳转至 DP_IAL 字段 <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}
