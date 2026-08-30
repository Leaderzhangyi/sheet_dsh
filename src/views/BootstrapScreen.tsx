import { Code2, Database, Upload } from "lucide-react";

export default function BootstrapScreen({
  state,
  hasSource,
  error,
  onRetry,
  onOpenImport,
}: {
  state: "loading" | "error" | "ready";
  hasSource: boolean;
  error: string;
  onRetry: () => void;
  onOpenImport: (mode?: "excel" | "ddl") => void;
}) {
  if (state === "ready" && !hasSource)
    return (
      <main className="bootstrap-screen" data-testid="dataset-empty">
        <div className="bootstrap-mark">
          <Database size={24} />
        </div>
        <h1>从导入第一个数据源开始</h1>
        <img
          className="bootstrap-illustration"
          src="/illustrations/import-flow.png"
          alt="先预览工作表，再勾选要导入的内容，全程在本机解析"
        />
        <p>
          导入 Excel 数据字典，或直接粘贴建表 DDL。
          <br />
          数据只保存在本机浏览器索引里，不会上传服务器。
        </p>
        <div className="bootstrap-actions">
          <button
            className="primary-button"
            onClick={() => onOpenImport("excel")}
          >
            <Upload size={15} />
            导入 Excel
          </button>
          <button
            className="secondary-button"
            onClick={() => onOpenImport("ddl")}
          >
            <Code2 size={15} />
            粘贴 DDL
          </button>
        </div>
      </main>
    );
  return (
    <main
      className="bootstrap-screen"
      data-testid={state === "error" ? "dataset-error" : "dataset-loading"}
    >
      <div className="bootstrap-mark">
        <Database size={24} />
      </div>
      <h1>
        {state === "error" ? "本地数据源读取失败" : "正在恢复本地数据字典"}
      </h1>
      <p>
        {state === "error"
          ? `${error}。可重新读取或直接导入内网数据文件。`
          : "正在从浏览器本地索引恢复上次导入的数据源…"}
      </p>
      {state === "error" && (
        <div className="bootstrap-actions">
          <button
            className="primary-button"
            onClick={() => onOpenImport("excel")}
          >
            <Upload size={15} />
            导入数据字典
          </button>
          <button className="secondary-button" onClick={onRetry}>
            重新加载
          </button>
        </div>
      )}
    </main>
  );
}
