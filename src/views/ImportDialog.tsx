import {
  AlertTriangle,
  Code2,
  FileSpreadsheet,
  Layers3,
  Upload,
  X,
} from "lucide-react";
import type { WorkbookSheetInfo } from "../lib/import/file";
import BorderGlow from "../components/BorderGlow";

export default function ImportDialog({
  importing,
  inspecting,
  progress,
  error,
  file,
  sheets,
  selectedSheets,
  mode,
  onModeChange,
  ddlText,
  onDdlTextChange,
  ddlName,
  onDdlNameChange,
  onDdlConfirm,
  fileInputRef,
  onClose,
  onFileChange,
  onToggleSheet,
  onConfirm,
}: {
  importing: boolean;
  inspecting: boolean;
  progress: number;
  error: string;
  file: File | null;
  sheets: WorkbookSheetInfo[];
  selectedSheets: string[];
  mode: "excel" | "ddl";
  onModeChange: (mode: "excel" | "ddl") => void;
  ddlText: string;
  onDdlTextChange: (value: string) => void;
  ddlName: string;
  onDdlNameChange: (value: string) => void;
  onDdlConfirm: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleSheet: (name: string) => void;
  onConfirm: () => void;
}) {
  const ddlUsable = ddlText.trim().length > 0;
  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="import-dialog import-dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="dialog-header">
          <div>
            <span className="section-kicker">LOCAL IMPORT</span>
            <h2 id="import-title">导入数据字典</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="import-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "excel"}
            className={`import-tab ${mode === "excel" ? "active" : ""}`}
            onClick={() => onModeChange("excel")}
          >
            <FileSpreadsheet size={15} />
            Excel 文件
          </button>
          <button
            role="tab"
            aria-selected={mode === "ddl"}
            className={`import-tab ${mode === "ddl" ? "active" : ""}`}
            onClick={() => onModeChange("ddl")}
          >
            <Code2 size={15} />
            DDL 文本
          </button>
        </div>
        {mode === "excel" ? (
          !file ? (
            <div>
              <BorderGlow
                className="import-drop-glow"
                backgroundColor="#fbfcfc"
                borderRadius={12}
                glowRadius={26}
                glowIntensity={0.9}
                glowColor="8 52% 55%"
                fillOpacity={0.35}
                colors={["#c74f46", "#cb7e38", "#3e72a8"]}
              >
                <div
                  className="drop-zone drop-zone--bare"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-icon">
                    <Upload size={22} />
                  </div>
                  <strong>
                    {inspecting ? "正在读取工作表…" : "选择 Excel 文件"}
                  </strong>
                  <span>支持 .xlsx · 先查看 Sheet，再决定导入内容</span>
                  <input
                    ref={fileInputRef}
                    data-testid="import-input"
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={onFileChange}
                    hidden
                  />
                </div>
              </BorderGlow>
              <div className="import-illustration">
                <img
                  src="/illustrations/import-flow.png"
                  alt="先预览工作表，再勾选导入，全程本地解析"
                />
              </div>
            </div>
          ) : (
            <div className="sheet-picker">
              <div className="sheet-picker-heading">
                <div>
                  <span className="section-kicker">SHEET SELECTOR</span>
                  <h3>{file.name}</h3>
                </div>
                <span>
                  {selectedSheets.length}/{sheets.length} 个 Sheet
                </span>
              </div>
              <p className="sheet-picker-hint">
                默认跳过修订记录；可按需勾选或取消任意工作表。
              </p>
              <div className="sheet-list" data-testid="sheet-list">
                {sheets.map((sheet) => (
                  <label
                    className={`sheet-option ${selectedSheets.includes(sheet.name) ? "selected" : ""}`}
                    key={sheet.name}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSheets.includes(sheet.name)}
                      onChange={() => onToggleSheet(sheet.name)}
                    />
                    <span className="sheet-option-main">
                      <strong>{sheet.name}</strong>
                      <small
                        className={
                          sheet.likelyRevision ? "likely-revision" : undefined
                        }
                      >
                        {sheet.rowCount.toLocaleString("zh-CN")} 行 ·{" "}
                        {sheet.likelyRevision
                          ? "修订记录（默认跳过）"
                          : "可参与解析"}
                      </small>
                      <em>
                        {sheet.preview[0]
                          ?.slice(0, 4)
                          .map((cell) => String(cell ?? ""))
                          .join(" · ") || "暂无表头预览"}
                      </em>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="ddl-import">
            <input
              className="ddl-name-input"
              data-testid="ddl-name"
              placeholder="数据源名称（默认：DDL 导入 · 日期）"
              value={ddlName}
              disabled={importing}
              onChange={(event) => onDdlNameChange(event.target.value)}
            />
            <textarea
              className="ddl-textarea"
              data-testid="ddl-text"
              placeholder={
                "粘贴 CREATE TABLE 语句，支持多张表：\n\nCREATE TABLE a_pub_staff_tab (\n  data_dt date NOT NULL,\n  staff_id varchar(10) PRIMARY KEY COMMENT '员工编号'\n) DISTRIBUTE BY HASH(staff_id);\nCOMMENT ON TABLE a_pub_staff_tab IS '员工表';"
              }
              value={ddlText}
              disabled={importing}
              onChange={(event) => onDdlTextChange(event.target.value)}
            />
            <p className="ddl-hint">
              支持列内 COMMENT、PRIMARY KEY / DISTRIBUTE BY / PARTITION BY 与
              GaussDB 的 COMMENT ON 语法；识别不了的语句会列在导入结果里。
            </p>
          </div>
        )}
        <div className="adapter-note">
          <Layers3 size={15} />
          <span>
            {mode === "excel"
              ? "解析在本机后台 Worker 完成；文件不会离开内网浏览器。选择字段 Sheet 时，系统会保留其表结构关联。"
              : "DDL 在本机解析为表结构与字段定义，与 Excel 数据源共用同一套本地索引。"}
          </span>
        </div>
        {importing && (
          <div className="import-progress" data-testid="import-progress">
            <div className="import-progress-label">
              <span>正在解析并建立本地索引</span>
              <strong>{progress}%</strong>
            </div>
            <progress max="100" value={progress} />
          </div>
        )}
        {error && (
          <div className="import-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          {mode === "excel" ? (
            file ? (
              <button
                className="primary-button"
                onClick={onConfirm}
                disabled={
                  importing || inspecting || selectedSheets.length === 0
                }
              >
                {importing ? `正在导入 ${progress}%…` : "导入选中 Sheet"}
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={inspecting}
              >
                <Upload size={15} />
                选择文件
              </button>
            )
          ) : (
            <button
              className="primary-button"
              data-testid="ddl-confirm"
              onClick={onDdlConfirm}
              disabled={importing || !ddlUsable}
            >
              {importing ? "正在解析…" : "解析并导入"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
