# 数据字典查询台

纯前端的数据字典查询与 AI 洞察应用：导入 Excel 数据字典或粘贴建表 DDL，在浏览器本地建立索引，查询表、字段、数据标准、公共代码与血缘映射；并可对接行内 OpenAI 兼容大模型网关，面向整个数据源生成洞察思路。所有字典数据只保存在浏览器 IndexedDB 中，不上传服务器，适合内网静态部署。

## 功能

### 查询

- **全局搜索**：一次检索表 / 字段 / 标准 / 代码四类对象，高亮匹配字段，回车直达详情。
- **表目录**：左侧表清单 + 字段结构表格（列可显隐），字段详情抽屉展示存储定义、键属性、关联标准/代码、数仓血缘（DP_IAL ↔ RCVP 跨数据源跳转）；标签/视图类实体默认隐藏，可开关查看。
- **数据标准**：虚拟滚动列表 + 引用字段清单，支持跳转关联公共代码。
- **公共代码**：按代码集去重展示（同一代码集只出现一条，附值数量），详情页代码值清单 + 引用字段。
- **手工维护**：表、字段、数据标准、代码集、代码值均支持删除（二次点击确认），即时写回本地索引。

### AI 洞察思路

- 面向**整个数据源**生成：资产全景、主题域与核心实体、业务分析场景、高价值关联路径、落地建议与示例 SQL。
- 兼容 OpenAI 协议网关：填地址 + Key 后一键**测试连接**，自动拉取模型列表改为下拉选择。
- **流式输出**：支持思考型模型（GLM-4.5+ 等先出思考过程再出正文），生成中显示进度与已输出字数，可随时停止；切到其他页面后台继续生成，导航栏有呼吸点提示。
- **自定义提示词**：内置零售客户全生命周期参考模板（首购 / 资产提升 / 理财购买 / 定存购买 / 流失预警 + 九大类特征体系），支持 `{数据摘要}` 占位符；结果与提示词持久化，刷新不丢。
- 结果支持预览 / 复制 / 下载 Markdown / 下载带样式 HTML 报告。

### 数据导入

- **Excel 导入**：先预览全部工作表（行数 / 表头 / 疑似修订记录），勾选后由 Web Worker 本地解析；支持 DP_IAL 与 RCVP 零售集市两种版式，自动识别 schema 限定表名、带引号列名、占位值清洗与标签/视图实体分离。
- **DDL 导入**：字符串感知解析器，支持列内 `COMMENT`、`PRIMARY KEY / DISTRIBUTE BY / PARTITION BY`、`COMMENT ON TABLE / COLUMN`、`double precision` 等多词类型与 `create or replace view` 等前缀。

## 目录结构

```text
src/
├── App.tsx              应用壳：状态编排、导入向导、删除与导航
├── views/               页面（Search / Tables / Standards / Codes / Insights / Sources / ImportDialog / Bootstrap）
├── components/          VirtualList 虚拟滚动、ConfirmButtons、Primitives、BorderGlow
├── hooks/               useInsights（洞察生成全局状态：后台生成/持久化/流式节流）
└── lib/
    ├── import/          Excel 适配器 / DDL 解析器 / Worker / 数据模型
    ├── search/          搜索索引
    ├── insights/        LLM 网关调用（/models、流式 chat）、Markdown 渲染与导出
    ├── storage/         IndexedDB 分片持久化
    └── navigation.ts / workspace.ts
```

## 开发

```bash
npm ci
npm run dev             # 开发服务器（端口 4173）
npm run typecheck       # 类型检查
npm run lint            # ESLint（零告警门禁）
npm run test            # 单元测试（vitest）
npm run test:coverage   # 覆盖率门禁（lines 80 / branches 75 / functions 80）
npm run e2e             # 端到端测试（playwright，需本机装有 Chrome）
npm run build           # 类型检查 + 构建，产物在 dist/
```

> 注意：运行 `npm ci` 前请先停止 `npm run dev`，否则 Windows 下原生依赖文件被占用会报 EPERM。

## 测试数据说明（重要）

涉及真实业务数据字典的 Excel 文件（`dp_ial.xlsx`、`rcvp.xlsx`）**已通过 `.gitignore` 屏蔽，不会进入仓库**。克隆后如需运行依赖真实数据的端到端测试，请将这两份文件放到项目根目录（测试通过文件选择框导入，与生产使用方式一致）；单元测试与 DDL 相关测试不需要任何数据文件。

## 数据与安全

- 字典数据仅存于浏览器 IndexedDB，按数据源分片持久化，刷新自动恢复；清空浏览器存储即彻底删除。
- 洞察功能只访问使用者自行配置的模型网关，配置（地址/Key/提示词）与生成结果仅保存在本机浏览器；生成时会把所选数据源的表名、主题分布与字段引用统计发送至该地址，请确认符合行内数据安全要求。

## 内网部署

见 `内网部署手册-数据字典查询台.md`（交付物制作与发布流程）与 `内网部署手册-Nginx零基础附录.md`（Linux 为主的 Nginx 零基础步骤，Windows 附带）。生产包仅发布 `dist/` 静态产物，不携带任何业务数据文件。
