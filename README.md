# 数据查询看板（数据字典查询台）

纯前端的数据字典查询应用：导入 Excel 数据字典或粘贴建表 DDL，在浏览器本地建立索引并查询表、字段、数据标准、公共代码与血缘映射。所有数据只保存在浏览器 IndexedDB 中，不上传服务器，适合内网静态部署。

## 功能

- **Excel 导入**：选择 `.xlsx` 后先预览全部工作表（行数 / 表头预览 / 疑似修订记录），手动勾选要导入的 Sheet，后台 Worker 解析。
- **DDL 导入**：粘贴 `CREATE TABLE` 语句，支持列内 `COMMENT`、`PRIMARY KEY` / `DISTRIBUTE BY` / `PARTITION BY` 与 `COMMENT ON TABLE / COLUMN`。
- **查询**：全局搜索（表 / 字段 / 标准 / 代码），表目录、字段详情、键徽标、字段血缘与跨数据源跳转。
- **本地索引**：数据按数据源分片存入 IndexedDB，刷新后自动恢复；清空浏览器存储即彻底删除。

## 开发

```bash
npm install
npm run dev        # 开发服务器（端口 4173）
npm run build      # 类型检查 + 构建，产物在 dist/
npm run test       # 单元测试（vitest）
npm run e2e        # 端到端测试（playwright，需本机装有 Chrome）
```

## 测试数据说明（重要）

涉及真实业务数据字典的 Excel 文件（`dp_ial.xlsx`、`rcvp.xlsx`）**已通过 `.gitignore` 屏蔽，不会进入仓库**。克隆后如需运行依赖真实数据的端到端测试，请将这两份文件放到项目根目录（测试通过文件选择框导入，与生产使用方式一致）；单元测试与 DDL 相关测试不需要任何数据文件。

## 内网部署

见 `内网部署手册-数据字典查询台.md`。生产包仅发布 `dist/` 静态产物，不携带任何业务数据文件。
