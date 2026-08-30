import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  Clipboard,
  Code2,
  Database,
  FileSpreadsheet,
  Layers3,
  Search,
  Settings2,
  Table2,
  Upload,
  X,
} from 'lucide-react'
import { fingerprintUploadedFile, inspectExcelFile, readExcelFile, type WorkbookSheetInfo } from './lib/import/file'
import { parseDdl } from './lib/import/ddl'
import type { DictionaryDataset, FieldLineage, FieldRecord, StandardRecord, TableRecord } from './lib/import/types'
import { buildSearchIndex, searchDataset, type SearchResult, type SearchType } from './lib/search/search'
import { loadPersistedWorkspace, saveWorkspaceDataset, type DatasetSlot, type PersistedWorkspace } from './lib/storage/indexedDb'

type NavKey = 'search' | 'tables' | 'standards' | 'codes' | 'sources'

const navItems: { key: NavKey; label: string; icon: typeof Search }[] = [
  { key: 'search', label: '全局搜索', icon: Search },
  { key: 'tables', label: '表目录', icon: Table2 },
  { key: 'standards', label: '数据标准', icon: BookOpen },
  { key: 'codes', label: '公共代码', icon: Braces },
]

const typeLabels: Record<SearchType, string> = { table: '表', field: '字段', standard: '标准', code: '代码', revision: '修订' }
type DatasetOrigin = 'bundled' | 'uploaded' | 'cache'
type WorkspaceDatasets = Partial<Record<DatasetSlot, DictionaryDataset>>
type WorkspaceOrigins = Partial<Record<DatasetSlot, DatasetOrigin>>
type NavigationState = {
  activeWorkspace: DatasetSlot
  activeNav: NavKey
  query: string
  searchFilter: SearchType | 'all'
  selectedTableId: string
  selectedFieldId: string | null
  selectedStandardId: string | null
  selectedCodeId: string | null
}
type BrowserHistoryState = { view: NavigationState; navigationStack: NavigationState[] }

function readBrowserHistoryState(value: unknown): BrowserHistoryState | null {
  if (!value || typeof value !== 'object') return null
  const entry = (value as { dataDictionaryQueryDesk?: unknown }).dataDictionaryQueryDesk
  if (!entry || typeof entry !== 'object') return null
  const { view, navigationStack } = entry as Partial<BrowserHistoryState>
  return view && typeof view === 'object' && Array.isArray(navigationStack) ? { view: view as NavigationState, navigationStack: navigationStack as NavigationState[] } : null
}

const visibleSearchTypes: SearchType[] = ['table', 'field', 'standard', 'code']

function App() {
  const [datasets, setDatasets] = useState<WorkspaceDatasets>({})
  const [datasetOrigins, setDatasetOrigins] = useState<WorkspaceOrigins>({})
  const [activeWorkspace, setActiveWorkspace] = useState<DatasetSlot>('warehouse')
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [bootstrapError, setBootstrapError] = useState('')
  const [cacheAvailable, setCacheAvailable] = useState(true)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const [activeNav, setActiveNav] = useState<NavKey>('search')
  const [query, setQuery] = useState('')
  const [searchFilter, setSearchFilter] = useState<SearchType | 'all'>('all')
  const [selectedTableId, setSelectedTableId] = useState('a_pub_org_info_tab')
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(null)
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null)
  const [navigationStack, setNavigationStack] = useState<NavigationState[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [inspecting, setInspecting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importSheets, setImportSheets] = useState<WorkbookSheetInfo[]>([])
  const [selectedImportSheets, setSelectedImportSheets] = useState<string[]>([])
  const [importMode, setImportMode] = useState<'excel' | 'ddl'>('excel')
  const [ddlText, setDdlText] = useState('')
  const [ddlName, setDdlName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const browserBackPendingRef = useRef(false)
  const dataset = datasets[activeWorkspace] ?? null
  const datasetOrigin = datasetOrigins[activeWorkspace] ?? 'bundled'
  const searchIndex = useMemo(() => dataset ? buildSearchIndex(dataset) : null, [dataset])

  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      setBootstrapState('loading')
      setBootstrapError('')
      try {
        const cachedWorkspace = await Promise.resolve(loadPersistedWorkspace()).catch((): PersistedWorkspace => {
          if (!cancelled) setCacheAvailable(false)
          return {}
        })
        const workspace = cachedWorkspace ?? {}
        if (cancelled) return
        const nextDatasets: WorkspaceDatasets = {}
        const nextOrigins: WorkspaceOrigins = {}
        for (const slot of ['retail', 'warehouse'] as const) {
          const cached = workspace[slot]
          if (!cached) continue
          nextDatasets[slot] = cached.dataset
          nextOrigins[slot] = 'cache'
        }
        setDatasets(nextDatasets)
        setDatasetOrigins(nextOrigins)
        const firstSlot = (Object.keys(nextDatasets) as DatasetSlot[])[0]
        setActiveWorkspace(firstSlot ?? 'warehouse')
        setSelectedTableId(firstSlot ? nextDatasets[firstSlot]?.tables[0]?.id ?? '' : '')
        setBootstrapState('ready')
      } catch (error) {
        if (cancelled) return
        setBootstrapError(error instanceof Error ? error.message : '本地数据源读取失败。')
        setBootstrapState('error')
      }
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [bootstrapAttempt])

  const searchResponse = useMemo(() => dataset ? searchDataset(dataset, query, { index: searchIndex ?? undefined, types: searchFilter === 'all' ? visibleSearchTypes : [searchFilter] }) : { results: [], groups: [] }, [dataset, query, searchFilter, searchIndex])

  const currentLocation = (): NavigationState => ({ activeWorkspace, activeNav, query, searchFilter, selectedTableId, selectedFieldId, selectedStandardId, selectedCodeId })

  const restoreLocation = (location: NavigationState, stack: NavigationState[]) => {
    setNavigationStack(stack)
    setActiveWorkspace(location.activeWorkspace)
    setActiveNav(location.activeNav)
    setQuery(location.query)
    setSearchFilter(location.searchFilter)
    setSelectedTableId(location.selectedTableId)
    setSelectedFieldId(location.selectedFieldId)
    setSelectedStandardId(location.selectedStandardId)
    setSelectedCodeId(location.selectedCodeId)
  }

  const rememberCurrentLocation = () => {
    const current = currentLocation()
    const nextStack = [...navigationStack.slice(-19), current]
    setNavigationStack(nextStack)
    window.history.pushState({ ...window.history.state, dataDictionaryQueryDesk: { view: current, navigationStack: nextStack } }, '')
  }

  const goBack = () => {
    const previous = navigationStack.at(-1)
    if (!previous) return
    browserBackPendingRef.current = true
    restoreLocation(previous, navigationStack.slice(0, -1))
    window.history.back()
  }

  const openTable = (tableId: string) => {
    rememberCurrentLocation()
    setSelectedTableId(tableId)
    setSelectedFieldId(null)
    setActiveNav('tables')
  }

  const openField = (field: FieldRecord) => {
    rememberCurrentLocation()
    setSelectedTableId(field.tableId)
    setSelectedFieldId(field.id)
    setActiveNav('tables')
  }

  const openStandard = (standard: StandardRecord) => {
    rememberCurrentLocation()
    setSelectedStandardId(standard.id)
    setActiveNav('standards')
  }

  const openCode = (id: string) => {
    rememberCurrentLocation()
    setSelectedCodeId(id)
    setActiveNav('codes')
  }

  const copyValue = async (value: string) => {
    await navigator.clipboard?.writeText(value)
  }

  const selectWorkspace = (slot: DatasetSlot) => {
    if (!datasets[slot]) return
    setActiveWorkspace(slot)
    setQuery('')
    setSelectedFieldId(null)
    setSelectedStandardId(null)
    setSelectedCodeId(null)
    setSelectedTableId(datasets[slot]?.tables[0]?.id ?? '')
    setActiveNav('search')
    setNavigationStack([])
  }

  const openWarehouseLineage = (lineage: FieldLineage) => {
    const warehouse = datasets.warehouse
    if (!warehouse) return
    const sourceTable = warehouse.tables.find((table) => table.englishName.toLowerCase() === lineage.sourceTableEnglishName.toLowerCase())
      ?? warehouse.tables.find((table) => table.chineseName === lineage.sourceTableChineseName)
    const sourceField = warehouse.fields.find((field) => field.tableId === sourceTable?.id && field.englishName.toLowerCase() === lineage.sourceFieldEnglishName.toLowerCase())
      ?? warehouse.fields.find((field) => field.tableId === sourceTable?.id && field.chineseName === lineage.sourceFieldChineseName)
    rememberCurrentLocation()
    setActiveWorkspace('warehouse')
    setSelectedTableId(sourceTable?.id ?? warehouse.tables[0]?.id ?? '')
    setSelectedFieldId(sourceField?.id ?? null)
    setActiveNav('tables')
    setQuery('')
  }

  const inspectImportFile = async (file: File) => {
    setInspecting(true)
    setImportError('')
    try {
      const sheets = await inspectExcelFile(file)
      setImportFile(file)
      setImportSheets(sheets)
      setSelectedImportSheets(sheets.filter((sheet) => !sheet.likelyRevision).map((sheet) => sheet.name))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '文件读取失败，请检查文件格式。')
    } finally {
      setInspecting(false)
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await inspectImportFile(file)
    event.target.value = ''
  }

  const openImport = (mode: 'excel' | 'ddl' = 'excel') => {
    setImportMode(mode)
    setImportError('')
    setShowImport(true)
  }

  const finalizeImport = async (imported: DictionaryDataset, slot: DatasetSlot, fingerprint: string, onProgress?: (progress: number) => void) => {
    try {
      await saveWorkspaceDataset(slot, imported, { kind: 'uploaded', fingerprint }, onProgress)
      setCacheAvailable(true)
    } catch {
      setCacheAvailable(false)
    }
    setDatasets((current) => ({ ...current, [slot]: imported }))
    setDatasetOrigins((current) => ({ ...current, [slot]: 'uploaded' }))
    setActiveWorkspace(slot)
    setQuery('')
    setSelectedFieldId(null)
    setSelectedStandardId(null)
    setSelectedCodeId(null)
    setSelectedTableId(imported.tables[0]?.id ?? '')
    setShowImport(false)
    setNavigationStack([])
    setImportFile(null)
    setImportSheets([])
    setSelectedImportSheets([])
    setDdlText('')
    setDdlName('')
  }

  const handleImportConfirm = async () => {
    if (!importFile || selectedImportSheets.length === 0) {
      setImportError('请至少选择一个工作表。')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      setImportProgress(5)
      const imported = await readExcelFile(importFile, selectedImportSheets, (progress) => setImportProgress(Math.round(progress * 0.8)))
      const slot: DatasetSlot = imported.adapterName === 'rcvp-retail-mart-adapter' ? 'retail' : 'warehouse'
      await finalizeImport(imported, slot, fingerprintUploadedFile(importFile), (progress) => setImportProgress(80 + Math.round(progress * 0.2)))
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '文件读取失败，请检查文件格式。')
    } finally {
      setImporting(false)
      setImportProgress(0)
    }
  }

  const handleDdlConfirm = async () => {
    if (!ddlText.trim()) {
      setImportError('请粘贴 DDL 语句（CREATE TABLE …）。')
      return
    }
    setImporting(true)
    setImportError('')
    try {
      const sourceName = ddlName.trim() || `DDL 导入 · ${new Date().toLocaleDateString('zh-CN')}`
      const imported = parseDdl(ddlText, { sourceName })
      if (imported.tables.length === 0) {
        setImportError(imported.issues[0]?.message ?? '未解析出任何数据表，请检查 DDL 内容。')
        return
      }
      await finalizeImport(imported, 'warehouse', `ddl:${sourceName}:${ddlText.length}`)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'DDL 解析失败。')
    } finally {
      setImporting(false)
    }
  }

  const resetImport = () => {
    setShowImport(false)
    setImportError('')
    setImportFile(null)
    setImportSheets([])
    setSelectedImportSheets([])
    setDdlText('')
    setDdlName('')
  }

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (browserBackPendingRef.current) {
        browserBackPendingRef.current = false
        return
      }
      const saved = readBrowserHistoryState(event.state)
      if (!saved) return
      setNavigationStack(saved.navigationStack)
      setActiveWorkspace(saved.view.activeWorkspace)
      setActiveNav(saved.view.activeNav)
      setQuery(saved.view.query)
      setSearchFilter(saved.view.searchFilter)
      setSelectedTableId(saved.view.selectedTableId)
      setSelectedFieldId(saved.view.selectedFieldId)
      setSelectedStandardId(saved.view.selectedStandardId)
      setSelectedCodeId(saved.view.selectedCodeId)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!dataset) return
    window.history.replaceState({ ...window.history.state, dataDictionaryQueryDesk: { view: { activeWorkspace, activeNav, query, searchFilter, selectedTableId, selectedFieldId, selectedStandardId, selectedCodeId }, navigationStack } }, '')
  }, [dataset, activeWorkspace, activeNav, query, searchFilter, selectedTableId, selectedFieldId, selectedStandardId, selectedCodeId, navigationStack])

  const renderContent = () => {
    if (!dataset) return null
    const selectedTable = dataset.tables.find((table) => table.id === selectedTableId) ?? dataset.tables[0]
    const selectedField = dataset.fields.find((field) => field.id === selectedFieldId) ?? null
    const selectedStandard = dataset.standards.find((standard) => standard.id === selectedStandardId) ?? null
    const selectedCode = dataset.codeItems.find((code) => code.id === selectedCodeId)
      ?? (selectedCodeId ? dataset.codeItems.find((code) => code.codeSetName === selectedCodeId.replace(/:$/, '')) : undefined)
      ?? null
    if (activeNav === 'search') {
      return <SearchView dataset={dataset} origin={datasetOrigin} cacheAvailable={cacheAvailable} query={query} setQuery={setQuery} searchFilter={searchFilter} setSearchFilter={setSearchFilter} response={searchResponse} onOpenTable={openTable} onOpenField={openField} onOpenStandard={openStandard} onOpenCode={openCode} />
    }
    if (activeNav === 'tables') {
      return <TablesView dataset={dataset} selectedTable={selectedTable} selectedField={selectedField} onSelectTable={openTable} onSelectField={openField} onCloseField={goBack} onCopy={copyValue} onOpenStandard={openStandard} onOpenCode={openCode} onOpenWarehouseLineage={openWarehouseLineage} />
    }
    if (activeNav === 'standards') {
      return <StandardsView dataset={dataset} selectedStandard={selectedStandard} onSelect={openStandard} onOpenField={openField} />
    }
    if (activeNav === 'codes') {
      return <CodesView dataset={dataset} selectedCode={selectedCode} onSelect={(code) => openCode(code.id)} onOpenField={openField} />
    }
    return <SourcesView dataset={dataset} origin={datasetOrigin} cacheAvailable={cacheAvailable} onOpenImport={openImport} />
  }

  if (!dataset) return <><BootstrapScreen state={bootstrapState} hasSource={Object.keys(datasets).length > 0} error={bootstrapError} onRetry={() => setBootstrapAttempt((attempt) => attempt + 1)} onOpenImport={openImport} />{showImport && <ImportDialog importing={importing} inspecting={inspecting} progress={importProgress} error={importError} file={importFile} sheets={importSheets} selectedSheets={selectedImportSheets} mode={importMode} onModeChange={setImportMode} ddlText={ddlText} onDdlTextChange={setDdlText} ddlName={ddlName} onDdlNameChange={setDdlName} onDdlConfirm={handleDdlConfirm} fileInputRef={fileInputRef} onClose={resetImport} onFileChange={handleFileChange} onToggleSheet={(name) => setSelectedImportSheets((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} onConfirm={handleImportConfirm} />}</>

  return (
    <div className="app-shell" data-testid="dataset-ready">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Database size={19} strokeWidth={2.3} /></div>
          <div><div className="brand-name">查询台</div><div className="brand-caption">DATA DICTIONARY</div></div>
        </div>
        <div className="sidebar-section-label">工作区</div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${activeNav === key ? 'active' : ''}`} onClick={() => { setActiveNav(key); setSelectedFieldId(null); setNavigationStack([]) }} data-testid={`nav-${key}`}>
              <Icon size={17} /><span>{label}</span>{key === 'search' && <kbd>⌘ K</kbd>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label source-label">数据源{Object.keys(datasets).length > 0 ? ` · ${Object.keys(datasets).length}` : ''}</div>
        <div className="source-list">
          {(['warehouse', 'retail'] as const).filter((slot) => datasets[slot]).map((slot) => (
            <button key={slot} className={`source-card ${activeWorkspace === slot ? 'active' : ''}`} data-testid={`source-${slot}`} onClick={() => { selectWorkspace(slot); setActiveNav('sources'); setNavigationStack([]) }}>
              <div className="source-card-icon"><FileSpreadsheet size={16} /></div>
              <div className="source-card-copy"><strong>{datasets[slot]?.sourceFile}</strong><span>{datasets[slot]?.stats.tableCount.toLocaleString('zh-CN')} 张表 · {datasets[slot]?.stats.fieldCount.toLocaleString('zh-CN')} 字段</span></div>
              <ChevronRight size={15} className="source-arrow" />
            </button>
          ))}
        </div>
        <div className="sidebar-footer"><span className="status-dot" />本地索引就绪<span className="footer-version">v0.1</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">{navigationStack.length > 0 && <button className="back-button" data-testid="navigation-back" onClick={goBack}><ArrowLeft size={14} />返回</button>}<span>工作区</span><ChevronRight size={13} /><strong>{navItems.find((item) => item.key === activeNav)?.label ?? '数据源'}</strong></div>
          <div className="topbar-actions">
            <button className="quiet-button" title="打开导入向导" onClick={() => openImport('excel')}><Upload size={15} />导入文件</button>
            <button className="icon-button" title="设置"><Settings2 size={17} /></button>
          </div>
        </header>
        <div className="content-area">{renderContent()}</div>
      </main>

      {showImport && <ImportDialog importing={importing} inspecting={inspecting} progress={importProgress} error={importError} file={importFile} sheets={importSheets} selectedSheets={selectedImportSheets} mode={importMode} onModeChange={setImportMode} ddlText={ddlText} onDdlTextChange={setDdlText} ddlName={ddlName} onDdlNameChange={setDdlName} onDdlConfirm={handleDdlConfirm} fileInputRef={fileInputRef} onClose={resetImport} onFileChange={handleFileChange} onToggleSheet={(name) => setSelectedImportSheets((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} onConfirm={handleImportConfirm} />}
    </div>
  )
}

function SearchView({ dataset, origin, cacheAvailable, query, setQuery, searchFilter, setSearchFilter, response, onOpenTable, onOpenField, onOpenStandard, onOpenCode }: { dataset: DictionaryDataset; origin: DatasetOrigin; cacheAvailable: boolean; query: string; setQuery: (value: string) => void; searchFilter: SearchType | 'all'; setSearchFilter: (value: SearchType | 'all') => void; response: ReturnType<typeof searchDataset>; onOpenTable: (id: string) => void; onOpenField: (field: FieldRecord) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void }) {
  const showResults = query.trim().length > 0
  return (
    <div className="search-page">
      <section className={`search-hero ${showResults ? 'compact' : ''}`}>
        <div className="eyebrow"><span className="eyebrow-line" />LOCAL INDEX <span className="eyebrow-cn">本地数据字典</span></div>
        <h1>{showResults ? '搜索结果' : '找到你要的字段。'}</h1>
        {!showResults && <p className="hero-copy">在表、字段、标准和公共代码之间，建立一条更短的查询路径。</p>}
        <div className="global-search-wrap">
          <Search size={19} className="global-search-icon" />
          <input data-testid="global-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文标识、标准编号或代码值" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="filter-row" role="tablist" aria-label="搜索范围">
          {(['all', 'table', 'field', 'standard', 'code'] as const).map((filter) => <button key={filter} className={`filter-chip ${searchFilter === filter ? 'selected' : ''}`} onClick={() => setSearchFilter(filter)}>{filter === 'all' ? '全部' : typeLabels[filter]}</button>)}
        </div>
      </section>
      {showResults ? <SearchResults response={response} query={query} dataset={dataset} onOpenTable={onOpenTable} onOpenField={onOpenField} onOpenStandard={onOpenStandard} onOpenCode={onOpenCode} /> : <HomeSummary dataset={dataset} origin={origin} cacheAvailable={cacheAvailable} onSearch={setQuery} />}
    </div>
  )
}

function HomeSummary({ dataset, origin, cacheAvailable, onSearch }: { dataset: DictionaryDataset; origin: DatasetOrigin; cacheAvailable: boolean; onSearch: (query: string) => void }) {
  const metrics = [{ label: '数据表', value: dataset.stats.tableCount, icon: Table2, accent: 'red' }, { label: '字段', value: dataset.stats.fieldCount, icon: Braces, accent: 'blue' }, { label: '标准', value: dataset.stats.standardCount, icon: BookOpen, accent: 'green' }, { label: '代码明细', value: dataset.stats.codeItemCount, icon: Code2, accent: 'orange' }]
  return <div className="home-summary"><div className="metrics-grid">{metrics.map(({ label, value, icon: Icon, accent }) => <div className="metric-card" key={label}><div className={`metric-icon ${accent}`}><Icon size={17} /></div><div><strong>{value.toLocaleString('zh-CN')}</strong><span>{label}</span></div></div>)}</div><div className="workspace-grid"><section className="section-block"><div className="section-heading"><div><span className="section-kicker">QUICK ACCESS</span><h2>常用入口</h2></div><ArrowUpRight size={17} /></div><div className="quick-list"><button onClick={() => onSearch('法人代码')}><span className="quick-number">01</span><span><strong>法人代码</strong><small>字段 / 标准 / 公共代码</small></span><ChevronRight size={16} /></button><button onClick={() => onSearch('a_pub_dpsit_acct_bal_view')}><span className="quick-number">02</span><span><strong>存款账户余额信息视图</strong><small>按英文表名定位结构</small></span><ChevronRight size={16} /></button><button onClick={() => onSearch('SCBTS0000046')}><span className="quick-number">03</span><span><strong>SCBTS0000046</strong><small>数据标准编号</small></span><ChevronRight size={16} /></button></div></section><section className="section-block source-summary"><div className="section-heading"><div><span className="section-kicker">INDEX STATUS</span><h2>索引状态</h2></div><span className="healthy-badge"><Check size={13} /> READY</span></div><div className="index-summary"><div><span>当前来源</span><strong>{dataset.sourceFile}</strong></div><div><span>解析器</span><strong>{dataset.adapterName}</strong></div><div><span>最后导入</span><strong>{formatDate(dataset.importedAt)}</strong></div></div><div className={`index-note ${cacheAvailable ? '' : 'warning-text'}`} data-testid="cache-status"><span className="status-dot" />{cacheAvailable ? `${origin === 'cache' ? '已从 IndexedDB 恢复' : 'IndexedDB 本地索引已同步'}` : '当前浏览器无法持久化索引'}</div></section></div></div>
}

function SearchResults({ response, query, dataset, onOpenTable, onOpenField, onOpenStandard, onOpenCode }: { response: ReturnType<typeof searchDataset>; query: string; dataset: DictionaryDataset; onOpenTable: (id: string) => void; onOpenField: (field: FieldRecord) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void }) {
  return <section className="results-section" data-testid="search-results"><div className="results-toolbar"><span>为 <strong>“{query}”</strong> 找到 {response.results.length} 条结果</span><span className="result-meta">{dataset.sourceFile}</span></div>{response.results.length === 0 ? <div className="no-results"><div className="no-results-mark"><Search size={20} /></div><h3>没有匹配结果</h3><p>尝试中文业务词、英文标识或标准编号。</p></div> : <div className="result-list">{response.results.map((result) => <ResultRow key={result.id} result={result} dataset={dataset} onOpenTable={onOpenTable} onOpenField={onOpenField} onOpenStandard={onOpenStandard} onOpenCode={onOpenCode} />)}</div>}</section>
}

function ResultRow({ result, dataset, onOpenTable, onOpenField, onOpenStandard, onOpenCode }: { result: SearchResult; dataset: DictionaryDataset; onOpenTable: (id: string) => void; onOpenField: (field: FieldRecord) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void }) {
  const handleOpen = () => {
    if (result.type === 'table') onOpenTable(result.recordId)
    if (result.type === 'field') { const field = dataset.fields.find((item) => item.id === result.recordId); if (field) onOpenField(field) }
    if (result.type === 'standard') { const standard = dataset.standards.find((item) => item.id === result.recordId); if (standard) onOpenStandard(standard) }
    if (result.type === 'code') onOpenCode(result.recordId)
  }
  return <button className="result-row" data-testid={`${result.type}-result`} onClick={handleOpen}><span className={`result-type ${result.type}`}>{typeLabels[result.type]}</span><span className="result-main"><strong>{result.title}</strong><small>{result.subtitle}</small></span><span className="match-copy">匹配于 {result.matchedOn.join('、')}</span><ArrowUpRight size={16} className="result-open" /></button>
}

function TablesView({ dataset, selectedTable, selectedField, onSelectTable, onSelectField, onCloseField, onCopy, onOpenStandard, onOpenCode, onOpenWarehouseLineage }: { dataset: DictionaryDataset; selectedTable?: TableRecord; selectedField: FieldRecord | null; onSelectTable: (id: string) => void; onSelectField: (field: FieldRecord) => void; onCloseField: () => void; onCopy: (value: string) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void; onOpenWarehouseLineage: (lineage: FieldLineage) => void }) {
  const [filter, setFilter] = useState('')
  const visibleTables = dataset.tables.filter((table) => `${table.chineseName} ${table.englishName}`.toLowerCase().includes(filter.toLowerCase()))
  const fields = selectedTable ? dataset.fields.filter((field) => field.tableId === selectedTable.id) : []
  return <div className="catalog-layout"><aside className="catalog-sidebar"><div className="catalog-title"><div><span className="section-kicker">CATALOG</span><h2>表目录</h2></div><span className="count-badge">{dataset.tables.length}</span></div><div className="mini-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选表" /></div><div className="table-list">{visibleTables.map((table) => <button key={table.id} className={`table-list-item ${selectedTable?.id === table.id ? 'active' : ''}`} onClick={() => onSelectTable(table.id)}><span className="table-list-copy"><strong>{table.chineseName}</strong><small>{table.englishName}</small></span><span className="field-count">{table.fieldCount}</span></button>)}</div></aside><main className="table-workspace">{selectedTable ? <TableDetail table={selectedTable} fields={fields} selectedField={selectedField} onSelectField={onSelectField} onCloseField={onCloseField} onCopy={onCopy} onOpenStandard={onOpenStandard} onOpenCode={onOpenCode} onOpenWarehouseLineage={onOpenWarehouseLineage} /> : <EmptyState title="请选择一张表" />}</main></div>
}

function TableDetail({ table, fields, selectedField, onSelectField, onCloseField, onCopy, onOpenStandard, onOpenCode, onOpenWarehouseLineage }: { table: TableRecord; fields: FieldRecord[]; selectedField: FieldRecord | null; onSelectField: (field: FieldRecord) => void; onCloseField: () => void; onCopy: (value: string) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void; onOpenWarehouseLineage: (lineage: FieldLineage) => void }) {
  const [fieldFilter, setFieldFilter] = useState('')
  const filtered = fields.filter((field) => `${field.chineseName} ${field.englishName}`.toLowerCase().includes(fieldFilter.toLowerCase()))
  return <div className="table-detail" data-testid="table-detail"><div className="detail-header"><div><div className="detail-breadcrumb"><span>表目录</span><ChevronRight size={13} /><span>{table.topic || '未分类'}</span></div><h1>{table.chineseName}</h1><div className="table-english">{table.englishName}<CopyButton value={table.englishName} onCopy={onCopy} /></div></div><div className="header-badges"><span className="soft-badge red">{table.topic || '未分类'}</span><span className="soft-badge green"><span className="badge-dot" />每日加载</span></div></div><div className="table-meta-grid"><MetaItem label="业务范围" value={table.businessScope || '—'} wide /><MetaItem label="责任人" value={table.owner || '—'} /><MetaItem label="保留时效" value={table.retention || '—'} /><MetaItem label="加载策略" value={table.loadStrategy || '—'} /></div><div className="fields-toolbar"><div><span className="section-kicker">SCHEMA</span><h2>字段结构 <small>{fields.length} 个字段</small></h2></div><div className="field-toolbar-right"><div className="mini-search field-search"><Search size={15} /><input value={fieldFilter} onChange={(event) => setFieldFilter(event.target.value)} placeholder="筛选字段" /></div><button className="icon-button" title="字段设置"><Settings2 size={16} /></button></div></div><div className="field-table-wrap"><table className="field-table"><thead><tr><th className="number-col">#</th><th>字段中文名</th><th>字段英文名</th><th>类型</th><th>键</th><th>标准编号</th><th>公共代码</th><th aria-label="操作" /></tr></thead><tbody>{filtered.map((field) => <tr key={field.id} className={selectedField?.id === field.id ? 'selected' : ''} onClick={() => onSelectField(field)}><td className="number-col">{String(field.ordinal).padStart(2, '0')}</td><td><strong>{field.chineseName}</strong></td><td><code>{field.englishName}</code></td><td><code className="type-code">{field.fieldType || '—'}</code></td><td><KeyFlags field={field} /></td><td>{field.standardNo ? <button className="inline-link" onClick={(event) => { event.stopPropagation(); const standard = { id: field.standardNo, standardNo: field.standardNo, chineseName: field.chineseName, englishName: '', topic: '', dataType: '', dataLength: '', precision: '', sourceSheet: field.sourceSheet, sourceRow: field.sourceRow }; onOpenStandard(standard) }}>{field.standardNo}</button> : <span className="muted">—</span>}</td><td>{field.publicCodeName ? <button className="code-link" onClick={(event) => { event.stopPropagation(); const item = { id: `${field.publicCodeName}:`, codeSetName: field.publicCodeName, codeSetEnglishName: '', value: '', valueDescription: '', standardNo: '', standardName: '', sourceSheet: field.sourceSheet, sourceRow: field.sourceRow }; onOpenCode(item.id) }}>{field.publicCodeName}</button> : <span className="muted">—</span>}</td><td><ArrowUpRight size={15} className="row-arrow" /></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="table-empty">没有匹配字段</div>}</div>{selectedField && <FieldDetail field={selectedField} onClose={onCloseField} onCopy={onCopy} onOpenStandard={onOpenStandard} onOpenCode={onOpenCode} onOpenWarehouseLineage={onOpenWarehouseLineage} />}</div>
}

function FieldDetail({ field, onClose, onCopy, onOpenStandard, onOpenCode, onOpenWarehouseLineage }: { field: FieldRecord; onClose: () => void; onCopy: (value: string) => void; onOpenStandard: (standard: StandardRecord) => void; onOpenCode: (id: string) => void; onOpenWarehouseLineage: (lineage: FieldLineage) => void }) {
  return <aside className="field-detail field-detail-drawer" data-testid="field-detail"><div className="field-detail-header"><div><span className="section-kicker">FIELD DETAIL</span><h2>{field.chineseName}</h2><code>{field.englishName}</code></div><button className="icon-button" title="关闭字段详情" onClick={onClose}><X size={17} /></button></div><div className="detail-section"><div className="detail-section-label">存储定义</div><div className="property-grid"><Property label="高斯类型" value={field.fieldType} mono /><Property label="SR 类型" value={field.srFieldType || '—'} mono /><Property label="数据长度" value={field.dataLength || '—'} /><Property label="字段序号" value={String(field.ordinal)} /></div></div><div className="detail-section"><div className="detail-section-label">键属性</div><div className="key-row"><KeyFlags field={field} large /></div></div><div className="detail-section"><div className="detail-section-label">关联对象</div><div className="relation-list">{field.standardNo && <button onClick={() => onOpenStandard({ id: field.standardNo, standardNo: field.standardNo, chineseName: field.chineseName, englishName: '', topic: '', dataType: '', dataLength: '', precision: '', sourceSheet: field.sourceSheet, sourceRow: field.sourceRow })}><BookOpen size={15} /><span><strong>{field.standardNo}</strong><small>数据标准</small></span><ChevronRight size={15} /></button>}{field.publicCodeName && <button onClick={() => onOpenCode(`${field.publicCodeName}:`)}><Braces size={15} /><span><strong>{field.publicCodeName}</strong><small>公共代码</small></span><ChevronRight size={15} /></button>}</div></div>{field.lineage && <LineageDetail lineage={field.lineage} onOpenWarehouseLineage={onOpenWarehouseLineage} />}<div className="detail-section"><div className="detail-section-label">备注</div><p className="field-note">{field.remark || '暂无备注'}</p></div><div className="field-actions"><button className="secondary-button" onClick={() => onCopy(field.englishName)}><Clipboard size={15} />复制字段名</button><button className="secondary-button" onClick={() => onCopy(`${field.englishName} ${field.fieldType}`)}><Code2 size={15} />复制定义</button></div><div className="source-line"><FileSpreadsheet size={14} />{field.sourceSheet} · 第 {field.sourceRow} 行</div></aside>
}

function LineageDetail({ lineage, onOpenWarehouseLineage }: { lineage: FieldLineage; onOpenWarehouseLineage: (lineage: FieldLineage) => void }) {
  const sourceTable = [lineage.sourceTableChineseName, lineage.sourceTableEnglishName].filter(Boolean).join(' · ')
  const sourceField = [lineage.sourceFieldChineseName, lineage.sourceFieldEnglishName].filter(Boolean).join(' · ')
  return <section className="detail-section lineage-section" data-testid="field-lineage"><div className="detail-section-label">数仓血缘与加工</div><div className="lineage-properties"><Property label="来源系统" value={lineage.sourceSystem || '—'} /><Property label="来源表" value={sourceTable || '—'} /><Property label="来源字段" value={sourceField || '—'} /></div>{lineage.mappingRule && <div className="lineage-rule"><span>SQL 加工 / 映射规则</span><code>{lineage.mappingRule}</code></div>}{lineage.sourceRemark && <p className="lineage-note">{lineage.sourceRemark}</p>}{(lineage.sourceTableChineseName || lineage.sourceTableEnglishName) && <button className="secondary-button lineage-jump" onClick={() => onOpenWarehouseLineage(lineage)}>跳转至 DP_IAL 字段 <ArrowUpRight size={14} /></button>}</section>
}

function StandardsView({ dataset, selectedStandard, onSelect, onOpenField }: { dataset: DictionaryDataset; selectedStandard: StandardRecord | null; onSelect: (standard: StandardRecord) => void; onOpenField: (field: FieldRecord) => void }) {
  const [filter, setFilter] = useState('')
  const standards = dataset.standards.filter((standard) => `${standard.standardNo} ${standard.chineseName} ${standard.englishName}`.toLowerCase().includes(filter.toLowerCase()))
  const relatedFields = selectedStandard ? dataset.fields.filter((field) => field.standardNo === selectedStandard.standardNo) : []
  return <div className="directory-view"><div className="directory-header"><div><span className="section-kicker">STANDARD LIBRARY</span><h1>数据标准</h1><p>字段定义背后的统一语义。</p></div><div className="directory-count"><strong>{dataset.stats.standardCount}</strong><span>项标准</span></div></div><div className="directory-body"><div className="directory-list-panel"><div className="mini-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选标准" /></div>{standards.map((standard) => <button key={standard.id} className={`directory-row ${selectedStandard?.id === standard.id ? 'active' : ''}`} onClick={() => onSelect(standard)}><span><strong>{standard.chineseName}</strong><small>{standard.standardNo}</small></span><ChevronRight size={15} /></button>)}</div><div className="directory-detail">{selectedStandard ? <><div className="detail-header small"><div><div className="detail-breadcrumb"><span>数据标准</span><ChevronRight size={13} /><span>{selectedStandard.topic || '当前标准'}</span></div><h2>{selectedStandard.chineseName}</h2><div className="table-english"><code>{selectedStandard.standardNo}</code><CopyButton value={selectedStandard.standardNo} onCopy={(value) => void navigator.clipboard?.writeText(value)} /></div></div><span className="soft-badge blue">标准定义</span></div><div className="standard-properties"><Property label="英文简称" value={selectedStandard.englishName || '—'} /><Property label="主题" value={selectedStandard.topic || '—'} /><Property label="数据类型" value={selectedStandard.dataType || '—'} /><Property label="长度 / 精度" value={`${selectedStandard.dataLength || '—'} / ${selectedStandard.precision || '—'}`} /></div><div className="related-fields"><div className="section-heading"><div><span className="section-kicker">REFERENCES</span><h2>引用字段 <small>{relatedFields.length}</small></h2></div></div>{relatedFields.map((field) => <button key={field.id} className="related-row" onClick={() => onOpenField(field)}><span><strong>{field.chineseName}</strong><small>{field.tableChineseName} · {field.englishName}</small></span><ArrowUpRight size={15} /></button>)}</div></> : <EmptyState title="选择一个数据标准" />}</div></div></div>
}

function CodesView({ dataset, selectedCode, onSelect, onOpenField }: { dataset: DictionaryDataset; selectedCode: DictionaryDataset['codeItems'][number] | null; onSelect: (code: DictionaryDataset['codeItems'][number]) => void; onOpenField: (field: FieldRecord) => void }) {
  const [filter, setFilter] = useState('')
  const items = dataset.codeItems.filter((code) => `${code.codeSetName} ${code.codeSetEnglishName} ${code.value} ${code.valueDescription}`.toLowerCase().includes(filter.toLowerCase()))
  const selectedName = selectedCode?.codeSetName.replace(/:$/, '')
  const codeSetItems = selectedName ? dataset.codeItems.filter((code) => code.codeSetName === selectedName) : []
  const relatedFields = selectedName ? dataset.fields.filter((field) => field.publicCodeName === selectedName) : []

  return <div className="directory-view">
    <div className="directory-header"><div><span className="section-kicker">CODE DICTIONARY</span><h1>公共代码</h1><p>把代码值和字段语义放在一起看。</p></div><div className="directory-count"><strong>{dataset.stats.codeItemCount}</strong><span>条代码</span></div></div>
    <div className="directory-body code-directory-body">
      <div className="directory-list-panel">
        <div className="mini-search" data-testid="code-directory-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选代码名称、值或描述" /></div>
        <div className="directory-list-scroll" data-testid="code-directory-list">{items.slice(0, 120).map((code) => <button key={code.id} className={`directory-row code-row ${selectedCode?.id === code.id ? 'active' : ''}`} onClick={() => onSelect(code)}><span><strong>{code.codeSetName}</strong><small><code>{code.value}</code> · {code.valueDescription}</small></span><ChevronRight size={15} /></button>)}</div>
      </div>
      <div className="directory-detail code-directory-detail">{selectedCode ? <>
        <div className="detail-header small"><div><div className="detail-breadcrumb"><span>公共代码</span><ChevronRight size={13} /><span>{selectedCode.codeSetName}</span></div><h2>{selectedCode.codeSetName}</h2><div className="table-english"><code>{selectedCode.codeSetEnglishName || '—'}</code></div></div><span className="soft-badge orange">{codeSetItems.length} 个值</span></div>
        <div className="code-detail-grid">
          <div className="code-values code-values-scroll" data-testid="code-values">{codeSetItems.map((code) => <div key={code.id} className="code-value-row"><code>{code.value}</code><span>{code.valueDescription}</span><CopyButton value={code.value} onCopy={(value) => void navigator.clipboard?.writeText(value)} /></div>)}</div>
          <section className="related-fields code-related-fields-scroll" data-testid="code-related-fields"><div className="section-heading"><div><span className="section-kicker">REFERENCES</span><h2>引用字段 <small>{relatedFields.length}</small></h2></div></div><div className="related-fields-list" data-testid="code-related-fields-list">{relatedFields.map((field) => <button key={field.id} className="related-row" onClick={() => onOpenField(field)}><span><strong>{field.chineseName}</strong><small>{field.tableChineseName} · {field.englishName}</small></span><ArrowUpRight size={15} /></button>)}</div></section>
        </div>
      </> : <EmptyState title="选择一个公共代码" />}</div>
    </div>
  </div>
}

function SourcesView({ dataset, origin, cacheAvailable, onOpenImport }: { dataset: DictionaryDataset; origin: DatasetOrigin; cacheAvailable: boolean; onOpenImport: () => void }) { return <div className="sources-view"><div className="directory-header"><div><span className="section-kicker">DATA SOURCES</span><h1>数据源与导入</h1><p>本地文件、解析器和索引状态。</p></div><button className="primary-button" onClick={onOpenImport}><Upload size={16} />导入数据源</button></div><div className="source-overview"><div className="source-overview-main"><div className="large-file-icon"><FileSpreadsheet size={24} /></div><div><span className="source-status"><span className="status-dot" />{originLabel(origin)}</span><h2>{dataset.sourceFile}</h2><p>解析器：{dataset.adapterName}</p></div></div><div className="source-stats"><span>工作表<strong>{dataset.stats.sheetCount}</strong></span><span>数据表<strong>{dataset.stats.tableCount}</strong></span><span>字段<strong>{dataset.stats.fieldCount.toLocaleString('zh-CN')}</strong></span><span>异常<strong className={dataset.stats.issueCount ? 'warning-text' : ''}>{dataset.stats.issueCount}</strong></span><span>导入时间<strong>{formatDate(dataset.importedAt)}</strong></span></div></div><div className="import-hint"><Layers3 size={18} /><div><strong>{cacheAvailable ? `${origin === 'cache' ? '已从 IndexedDB 恢复' : '文件已建立 IndexedDB 本地索引'}` : '文件仅保留在当前页面内存中'}</strong><p>{cacheAvailable ? '刷新页面后将直接恢复本地索引；原始文件不会被修改。' : '浏览器拒绝了 IndexedDB，刷新页面后需重新解析文件。'}</p></div><button className="secondary-button" onClick={onOpenImport}>更换数据源 <ArrowUpRight size={14} /></button></div></div> }

function ImportDialog({ importing, inspecting, progress, error, file, sheets, selectedSheets, mode, onModeChange, ddlText, onDdlTextChange, ddlName, onDdlNameChange, onDdlConfirm, fileInputRef, onClose, onFileChange, onToggleSheet, onConfirm }: { importing: boolean; inspecting: boolean; progress: number; error: string; file: File | null; sheets: WorkbookSheetInfo[]; selectedSheets: string[]; mode: 'excel' | 'ddl'; onModeChange: (mode: 'excel' | 'ddl') => void; ddlText: string; onDdlTextChange: (value: string) => void; ddlName: string; onDdlNameChange: (value: string) => void; onDdlConfirm: () => void; fileInputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void; onToggleSheet: (name: string) => void; onConfirm: () => void }) {
  const ddlUsable = ddlText.trim().length > 0
  return <div className="modal-backdrop" role="presentation"><div className="import-dialog import-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="dialog-header"><div><span className="section-kicker">LOCAL IMPORT</span><h2 id="import-title">导入数据字典</h2></div><button className="icon-button" title="关闭" onClick={onClose}><X size={17} /></button></div><div className="import-tabs" role="tablist"><button role="tab" aria-selected={mode === 'excel'} className={`import-tab ${mode === 'excel' ? 'active' : ''}`} onClick={() => onModeChange('excel')}><FileSpreadsheet size={15} />Excel 文件</button><button role="tab" aria-selected={mode === 'ddl'} className={`import-tab ${mode === 'ddl' ? 'active' : ''}`} onClick={() => onModeChange('ddl')}><Code2 size={15} />DDL 文本</button></div>{mode === 'excel' ? (!file ? <div><div className="import-illustration"><img src="/illustrations/import-flow.png" alt="先预览工作表，再勾选导入，全程本地解析" /></div><div className="drop-zone" onClick={() => fileInputRef.current?.click()}><div className="drop-icon"><Upload size={22} /></div><strong>{inspecting ? '正在读取工作表…' : '选择 Excel 文件'}</strong><span>支持 .xlsx · 先查看 Sheet，再决定导入内容</span><input ref={fileInputRef} data-testid="import-input" type="file" accept=".xlsx,.xls" onChange={onFileChange} hidden /></div></div> : <div className="sheet-picker"><div className="sheet-picker-heading"><div><span className="section-kicker">SHEET SELECTOR</span><h3>{file.name}</h3></div><span>{selectedSheets.length}/{sheets.length} 个 Sheet</span></div><p className="sheet-picker-hint">默认跳过修订记录；可按需勾选或取消任意工作表。</p><div className="sheet-list" data-testid="sheet-list">{sheets.map((sheet) => <label className={`sheet-option ${selectedSheets.includes(sheet.name) ? 'selected' : ''}`} key={sheet.name}><input type="checkbox" checked={selectedSheets.includes(sheet.name)} onChange={() => onToggleSheet(sheet.name)} /><span className="sheet-option-main"><strong>{sheet.name}</strong><small className={sheet.likelyRevision ? 'likely-revision' : undefined}>{sheet.rowCount.toLocaleString('zh-CN')} 行 · {sheet.likelyRevision ? '修订记录（默认跳过）' : '可参与解析'}</small><em>{sheet.preview[0]?.slice(0, 4).map((cell) => String(cell ?? '')).join(' · ') || '暂无表头预览'}</em></span></label>)}</div></div>) : <div className="ddl-import"><input className="ddl-name-input" data-testid="ddl-name" placeholder="数据源名称（默认：DDL 导入 · 日期）" value={ddlName} disabled={importing} onChange={(event) => onDdlNameChange(event.target.value)} /><textarea className="ddl-textarea" data-testid="ddl-text" placeholder={'粘贴 CREATE TABLE 语句，支持多张表：\n\nCREATE TABLE a_pub_staff_tab (\n  data_dt date NOT NULL,\n  staff_id varchar(10) PRIMARY KEY COMMENT \'员工编号\'\n) DISTRIBUTE BY HASH(staff_id);\nCOMMENT ON TABLE a_pub_staff_tab IS \'员工表\';'} value={ddlText} disabled={importing} onChange={(event) => onDdlTextChange(event.target.value)} /><p className="ddl-hint">支持列内 COMMENT、PRIMARY KEY / DISTRIBUTE BY / PARTITION BY 与 GaussDB 的 COMMENT ON 语法；识别不了的语句会列在导入结果里。</p></div>}<div className="adapter-note"><Layers3 size={15} /><span>{mode === 'excel' ? '解析在本机后台 Worker 完成；文件不会离开内网浏览器。选择字段 Sheet 时，系统会保留其表结构关联。' : 'DDL 在本机解析为表结构与字段定义，与 Excel 数据源共用同一套本地索引。'}</span></div>{importing && <div className="import-progress" data-testid="import-progress"><div className="import-progress-label"><span>正在解析并建立本地索引</span><strong>{progress}%</strong></div><progress max="100" value={progress} /></div>}{error && <div className="import-error"><AlertTriangle size={15} />{error}</div>}<div className="dialog-actions"><button className="secondary-button" onClick={onClose}>取消</button>{mode === 'excel' ? (file ? <button className="primary-button" onClick={onConfirm} disabled={importing || inspecting || selectedSheets.length === 0}>{importing ? `正在导入 ${progress}%…` : '导入选中 Sheet'}</button> : <button className="primary-button" onClick={() => fileInputRef.current?.click()} disabled={inspecting}><Upload size={15} />选择文件</button>) : <button className="primary-button" data-testid="ddl-confirm" onClick={onDdlConfirm} disabled={importing || !ddlUsable}>{importing ? '正在解析…' : '解析并导入'}</button>}</div></div></div>
}

function KeyFlags({ field, large = false }: { field: FieldRecord; large?: boolean }) { const flags = [{ label: 'PK', active: field.isPrimaryKey, tone: 'red' }, { label: 'D', active: field.isDistributionKey, tone: 'orange' }, { label: 'P', active: field.isPartitionKey, tone: 'blue' }]; return <span className={`key-flags ${large ? 'large' : ''}`}>{flags.map((flag) => <span key={flag.label} className={`key-flag ${flag.active ? `active ${flag.tone}` : ''}`} title={flag.label === 'PK' ? '主键' : flag.label === 'D' ? '分布键' : '分区键'}>{flag.label}</span>)}</span> }
function Property({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="property"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value || '—'}</strong></div> }
function MetaItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`meta-item ${wide ? 'wide' : ''}`}><span>{label}</span><strong>{value}</strong></div> }
function CopyButton({ value, onCopy }: { value: string; onCopy: (value: string) => void }) { return <button className="copy-button" title="复制" onClick={(event) => { event.stopPropagation(); onCopy(value) }}><Clipboard size={13} /></button> }
function EmptyState({ title }: { title: string }) { return <div className="empty-state"><div className="empty-mark"><Database size={20} /></div><h3>{title}</h3><p>从左侧选择一个对象查看详情。</p></div> }
function BootstrapScreen({ state, hasSource, error, onRetry, onOpenImport }: { state: 'loading' | 'error' | 'ready'; hasSource: boolean; error: string; onRetry: () => void; onOpenImport: (mode?: 'excel' | 'ddl') => void }) {
  if (state === 'ready' && !hasSource) return <main className="bootstrap-screen" data-testid="dataset-empty"><div className="bootstrap-mark"><Database size={24} /></div><h1>从导入第一个数据源开始</h1><img className="bootstrap-illustration" src="/illustrations/import-flow.png" alt="先预览工作表，再勾选要导入的内容，全程在本机解析" /><p>导入 Excel 数据字典，或直接粘贴建表 DDL。<br />数据只保存在本机浏览器索引里，不会上传服务器。</p><div className="bootstrap-actions"><button className="primary-button" onClick={() => onOpenImport('excel')}><Upload size={15} />导入 Excel</button><button className="secondary-button" onClick={() => onOpenImport('ddl')}><Code2 size={15} />粘贴 DDL</button></div></main>
  return <main className="bootstrap-screen" data-testid={state === 'error' ? 'dataset-error' : 'dataset-loading'}><div className="bootstrap-mark"><Database size={24} /></div><h1>{state === 'error' ? '本地数据源读取失败' : '正在恢复本地数据字典'}</h1><p>{state === 'error' ? `${error}。可重新读取或直接导入内网数据文件。` : '正在从浏览器本地索引恢复上次导入的数据源…'}</p>{state === 'error' && <div className="bootstrap-actions"><button className="primary-button" onClick={() => onOpenImport('excel')}><Upload size={15} />导入数据字典</button><button className="secondary-button" onClick={onRetry}>重新加载</button></div>}</main>
}
function originLabel(origin: DatasetOrigin) { return origin === 'cache' ? '本地索引' : origin === 'uploaded' ? '本地导入' : '默认数据源' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) }

export default App
