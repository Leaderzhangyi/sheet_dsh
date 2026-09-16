import { useState } from "react";
import { AlertTriangle, Check, Plug, RefreshCw, Table2 } from "lucide-react";
import { parseDdl } from "../lib/import/ddl";
import type { DictionaryDataset } from "../lib/import/types";

const BRIDGE_STORAGE_KEY = "db-bridge-url";
const DEFAULT_BRIDGE = "http://127.0.0.1:4310";

/**
 * 中文输入法下 Shift+减号 会打出全角 ＿ 或破折号 —，而不是半角 _。
 * 连接信息各框（密码除外）做 NFKC 规范化 + 破折号映射，保证直接打出来的就是合法字符。
 */
const normalizeConnectionText = (value: string) =>
  value.normalize("NFKC").replace(/—|–/g, "_");

interface MysqlTable {
  name: string;
  comment: string;
}

async function callBridge<T>(bridgeUrl: string, path: string, body: unknown): Promise<T> {
  const base = bridgeUrl.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("桥服务地址格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("桥服务地址仅支持 http/https。");
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({ error: "桥服务响应不是 JSON" }))) as {
    error?: string;
  } & T;
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `桥服务返回 ${response.status}`);
  }
  return payload;
}

/**
 * 连接数据库对话框：通过本机/内网的 MySQL 桥服务（npm run bridge）
 * 测试连接 → 拉取表清单 → 勾选表 → 取回 SHOW CREATE TABLE 的 DDL，
 * 复用 DDL 解析器生成数据集（导入 warehouse 工作区）。
 */
export default function DatabaseDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (dataset: DictionaryDataset, fingerprint: string) => void;
}) {
  const [bridgeUrl, setBridgeUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_BRIDGE;
    return window.localStorage.getItem(BRIDGE_STORAGE_KEY) || DEFAULT_BRIDGE;
  });
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("3306");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [tables, setTables] = useState<MysqlTable[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const updateBridgeUrl = (value: string) => {
    setBridgeUrl(value);
    window.localStorage.setItem(BRIDGE_STORAGE_KEY, value);
  };

  const connectionBody = () => ({
    host: host.trim(),
    port: Number(port) || 3306,
    user: user.trim(),
    password,
    database: database.trim(),
  });

  const testConnection = async () => {
    setTesting(true);
    setTestStatus("");
    setError("");
    setTables(null);
    try {
      const result = await callBridge<{ version?: string }>(bridgeUrl, "/api/mysql/test", connectionBody());
      setTestStatus(`已连接${result.version ? `（MySQL ${result.version}）` : ""}`);
    } catch (testError) {
      setError(
        testError instanceof Error
          ? `连接失败：${testError.message}`
          : "连接失败。",
      );
    } finally {
      setTesting(false);
    }
  };

  const fetchTables = async () => {
    setLoadingTables(true);
    setError("");
    try {
      const result = await callBridge<{ tables: MysqlTable[] }>(
        bridgeUrl,
        "/api/mysql/tables",
        connectionBody(),
      );
      setTables(result.tables);
      setSelected(result.tables.map((table) => table.name));
      if (result.tables.length === 0) setError("该数据库没有基表。");
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "拉取表清单失败。",
      );
    } finally {
      setLoadingTables(false);
    }
  };

  const toggleTable = (name: string) => {
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  };

  const confirmImport = async () => {
    if (!database.trim() || selected.length === 0 || !tables) return;
    setImporting(true);
    setError("");
    try {
      const result = await callBridge<{ ddl: string; imported: string[] }>(
        bridgeUrl,
        "/api/mysql/ddl",
        { ...connectionBody(), tables: selected },
      );
      const sourceName = `MySQL ${database.trim()}@${host.trim()}`;
      const dataset = parseDdl(result.ddl, { sourceName });
      if (dataset.tables.length === 0) {
        setError("DDL 解析未得到任何表，请反馈给开发。");
        return;
      }
      const fingerprint = `mysql:${host.trim()}/${database.trim()}:${result.imported.length}:${Date.now()}`;
      onImport(dataset, fingerprint);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "导入失败。",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="import-dialog db-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-title"
      >
        <div className="dialog-header">
          <div>
            <span className="section-kicker">DATABASE IMPORT</span>
            <h2 id="db-title">连接数据库</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="db-section">
          <div className="db-section-title">
            <Plug size={15} />
            连接信息
          </div>
          <div className="db-grid">
            <label className="db-field db-field-wide2">
              主机
              <input
                data-testid="db-host"
                value={host}
                onChange={(event) => setHost(normalizeConnectionText(event.target.value))}
                placeholder="如 10.20.30.5"
              />
            </label>
            <label className="db-field">
              端口
              <input
                data-testid="db-port"
                value={port}
                onChange={(event) => setPort(normalizeConnectionText(event.target.value))}
                placeholder="3306"
              />
            </label>
            <label className="db-field">
              数据库
              <input
                data-testid="db-database"
                value={database}
                onChange={(event) => setDatabase(normalizeConnectionText(event.target.value))}
                placeholder="库名"
              />
            </label>
            <label className="db-field">
              用户
              <input
                data-testid="db-user"
                value={user}
                onChange={(event) => setUser(normalizeConnectionText(event.target.value))}
                placeholder="用户名"
              />
            </label>
            <label className="db-field">
              密码
              <input
                data-testid="db-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="密码"
              />
            </label>
            <div className="db-field db-actions">
              <button
                type="button"
                className="secondary-button insight-test-button db-test"
                data-testid="db-test"
                disabled={testing || importing}
                onClick={() => void testConnection()}
              >
                {testing ? "测试中…" : "测试连接"}
              </button>
              <button
                type="button"
                className="secondary-button db-secondary"
                data-testid="db-fetch-tables"
                disabled={!testStatus || testing || importing || loadingTables}
                onClick={() => void fetchTables()}
              >
                <RefreshCw size={14} />
                {loadingTables ? "获取中…" : "获取表清单"}
              </button>
            </div>
          </div>
          {testStatus && (
            <p className="insight-status ok db-status" data-testid="db-status">
              <Check size={13} /> {testStatus}
            </p>
          )}
          <details className="db-bridge">
            <summary>桥服务设置（浏览器无法直连 MySQL，默认已配好）</summary>
            <div className="db-bridge-body">
              <input
                data-testid="db-bridge"
                value={bridgeUrl}
                onChange={(event) => updateBridgeUrl(event.target.value)}
                placeholder={DEFAULT_BRIDGE}
              />
              <p>
                先在本机/内网启动桥服务：<code>npm run bridge</code>（默认 {DEFAULT_BRIDGE}，仅内网使用）。
              </p>
            </div>
          </details>
        </div>

        {tables && tables.length > 0 && (
          <div className="db-section">
            <div className="db-section-title">
              <Table2 size={15} />
              选择要导入的表
              <span className="db-section-count">
                {database} · 已选 {selected.length}/{tables.length}
              </span>
            </div>
            <div className="db-table-list" data-testid="db-table-list">
              {tables.map((table) => (
                <label
                  className={`db-table-row ${selected.includes(table.name) ? "selected" : ""}`}
                  key={table.name}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(table.name)}
                    onChange={() => toggleTable(table.name)}
                  />
                  <span className="db-table-name">{table.name}</span>
                  <span className="db-table-comment">
                    {table.comment || "（无表注释）"}
                  </span>
                </label>
              ))}
            </div>
            {tables.length > 1 && (
              <div className="db-table-tools">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelected(tables.map((table) => table.name))}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelected([])}
                >
                  清空
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="import-error db-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button className="secondary-button db-cancel" onClick={onClose} disabled={importing}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            data-testid="db-confirm"
            disabled={importing || !tables || selected.length === 0}
            onClick={() => void confirmImport()}
          >
            {importing ? "导入中…" : `导入选中表${selected.length ? `（${selected.length}）` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
