import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Settings2,
  Trash,
  Trash2,
  Upload,
} from "lucide-react";
import {
  fingerprintUploadedFile,
  inspectExcelFile,
  readExcelFile,
  type WorkbookSheetInfo,
} from "./lib/import/file";
import { parseDdl } from "./lib/import/ddl";
import type {
  DictionaryDataset,
  FieldLineage,
  FieldRecord,
  StandardRecord,
} from "./lib/import/types";
import {
  buildSearchIndex,
  searchDataset,
  type SearchType,
} from "./lib/search/search";
import {
  clearPersistedDataset,
  deleteWorkspaceDataset,
  loadPersistedWorkspace,
  saveWorkspaceDataset,
  type DatasetSlot,
  type PersistedWorkspace,
} from "./lib/storage/indexedDb";
import {
  navItems,
  readBrowserHistoryState,
  visibleSearchTypes,
  type NavigationState,
} from "./lib/navigation";
import {
  refreshStats,
  type WorkspaceDatasets,
  type WorkspaceOrigins,
  type WorkspaceSources,
} from "./lib/workspace";
import SearchView from "./views/SearchView";
import TablesView from "./views/TablesView";
import StandardsView from "./views/StandardsView";
import CodesView from "./views/CodesView";
import SourcesView from "./views/SourcesView";
import ImportDialog from "./views/ImportDialog";
import BootstrapScreen from "./views/BootstrapScreen";
import InsightsView from "./views/InsightsView";

function App() {
  const [datasets, setDatasets] = useState<WorkspaceDatasets>({});
  const [datasetOrigins, setDatasetOrigins] = useState<WorkspaceOrigins>({});
  const [datasetSources, setDatasetSources] = useState<WorkspaceSources>({});
  const [activeWorkspace, setActiveWorkspace] =
    useState<DatasetSlot>("warehouse");
  const [bootstrapState, setBootstrapState] = useState<
    "loading" | "error" | "ready"
  >("loading");
  const [bootstrapError, setBootstrapError] = useState("");
  const [cacheAvailable, setCacheAvailable] = useState(true);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [activeNav, setActiveNav] = useState<NavigationState["activeNav"]>("search");
  const [query, setQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchType | "all">("all");
  const [selectedTableId, setSelectedTableId] = useState("a_pub_org_info_tab");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedStandardId, setSelectedStandardId] = useState<string | null>(
    null,
  );
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [navigationStack, setNavigationStack] = useState<NavigationState[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [inspecting, setInspecting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSheets, setImportSheets] = useState<WorkbookSheetInfo[]>([]);
  const [selectedImportSheets, setSelectedImportSheets] = useState<string[]>(
    [],
  );
  const [importMode, setImportMode] = useState<"excel" | "ddl">("excel");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsConfirm, setSettingsConfirm] = useState<"delete" | "clear" | null>(null);
  const [ddlText, setDdlText] = useState("");
  const [ddlName, setDdlName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const browserBackPendingRef = useRef(false);
  const dataset = datasets[activeWorkspace] ?? null;
  const datasetOrigin = datasetOrigins[activeWorkspace] ?? "bundled";
  const searchIndex = useMemo(
    () => (dataset ? buildSearchIndex(dataset) : null),
    [dataset],
  );

  // 事件处理器里读取“最新状态”的引用，让传给 memo 视图的回调保持稳定，
  // 避免搜索框每敲一个字就触发无关视图整树重渲染。
  const viewRef = useRef<NavigationState | null>(null);
  viewRef.current = {
    activeWorkspace,
    activeNav,
    query,
    searchFilter,
    selectedTableId,
    selectedFieldId,
    selectedStandardId,
    selectedCodeId,
  };
  const stackRef = useRef(navigationStack);
  stackRef.current = navigationStack;
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const datasetSourcesRef = useRef(datasetSources);
  datasetSourcesRef.current = datasetSources;

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setBootstrapState("loading");
      setBootstrapError("");
      try {
        const cachedWorkspace = await Promise.resolve(
          loadPersistedWorkspace(),
        ).catch((): PersistedWorkspace => {
          if (!cancelled) setCacheAvailable(false);
          return {};
        });
        const workspace = cachedWorkspace ?? {};
        if (cancelled) return;
        const nextDatasets: WorkspaceDatasets = {};
        const nextOrigins: WorkspaceOrigins = {};
        const nextSources: WorkspaceSources = {};
        for (const slot of ["retail", "warehouse"] as const) {
          const cached = workspace[slot];
          if (!cached) continue;
          nextDatasets[slot] = cached.dataset;
          nextOrigins[slot] = "cache";
          nextSources[slot] = cached.source;
        }
        setDatasets(nextDatasets);
        setDatasetOrigins(nextOrigins);
        setDatasetSources(nextSources);
        const firstSlot = (Object.keys(nextDatasets) as DatasetSlot[])[0];
        setActiveWorkspace(firstSlot ?? "warehouse");
        setSelectedTableId(
          firstSlot ? (nextDatasets[firstSlot]?.tables[0]?.id ?? "") : "",
        );
        setBootstrapState("ready");
      } catch (error) {
        if (cancelled) return;
        setBootstrapError(
          error instanceof Error ? error.message : "本地数据源读取失败。",
        );
        setBootstrapState("error");
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt]);

  const searchResponse = useMemo(
    () =>
      dataset
        ? searchDataset(dataset, query, {
            index: searchIndex ?? undefined,
            types: searchFilter === "all" ? visibleSearchTypes : [searchFilter],
          })
        : { results: [], groups: [] },
    [dataset, query, searchFilter, searchIndex],
  );

  const restoreLocation = useCallback(
    (location: NavigationState, stack: NavigationState[]) => {
      setNavigationStack(stack);
      setActiveWorkspace(location.activeWorkspace);
      setActiveNav(location.activeNav);
      setQuery(location.query);
      setSearchFilter(location.searchFilter);
      setSelectedTableId(location.selectedTableId);
      setSelectedFieldId(location.selectedFieldId);
      setSelectedStandardId(location.selectedStandardId);
      setSelectedCodeId(location.selectedCodeId);
    },
    [],
  );

  const rememberCurrentLocation = useCallback(() => {
    const current = viewRef.current;
    if (!current) return;
    const nextStack = [...stackRef.current.slice(-19), current];
    setNavigationStack(nextStack);
    window.history.pushState(
      {
        ...window.history.state,
        dataDictionaryQueryDesk: { view: current, navigationStack: nextStack },
      },
      "",
    );
  }, []);

  const goBack = useCallback(() => {
    const previous = stackRef.current.at(-1);
    if (!previous) return;
    browserBackPendingRef.current = true;
    restoreLocation(previous, stackRef.current.slice(0, -1));
    window.history.back();
  }, [restoreLocation]);

  const openTable = useCallback(
    (tableId: string) => {
      rememberCurrentLocation();
      setSelectedTableId(tableId);
      setSelectedFieldId(null);
      setActiveNav("tables");
    },
    [rememberCurrentLocation],
  );

  const openField = useCallback(
    (field: FieldRecord) => {
      rememberCurrentLocation();
      setSelectedTableId(field.tableId);
      setSelectedFieldId(field.id);
      setActiveNav("tables");
    },
    [rememberCurrentLocation],
  );

  const openStandard = useCallback(
    (standard: StandardRecord) => {
      rememberCurrentLocation();
      setSelectedStandardId(standard.id);
      setActiveNav("standards");
    },
    [rememberCurrentLocation],
  );

  const openCode = useCallback(
    (id: string) => {
      rememberCurrentLocation();
      setSelectedCodeId(id);
      setActiveNav("codes");
    },
    [rememberCurrentLocation],
  );

  const copyValue = useCallback(async (value: string) => {
    await navigator.clipboard?.writeText(value);
  }, []);

  const selectWorkspace = useCallback((slot: DatasetSlot) => {
    const target = datasetsRef.current[slot];
    if (!target) return;
    setActiveWorkspace(slot);
    setQuery("");
    setSelectedFieldId(null);
    setSelectedStandardId(null);
    setSelectedCodeId(null);
    setSelectedTableId(target.tables[0]?.id ?? "");
    setActiveNav("search");
    setNavigationStack([]);
  }, []);

  const openWarehouseLineage = useCallback(
    (lineage: FieldLineage) => {
      const warehouse = datasetsRef.current.warehouse;
      if (!warehouse) return;
      const sourceTable =
        warehouse.tables.find(
          (table) =>
            table.englishName.toLowerCase() ===
            lineage.sourceTableEnglishName.toLowerCase(),
        ) ??
        warehouse.tables.find(
          (table) => table.chineseName === lineage.sourceTableChineseName,
        );
      const sourceField =
        warehouse.fields.find(
          (field) =>
            field.tableId === sourceTable?.id &&
            field.englishName.toLowerCase() ===
              lineage.sourceFieldEnglishName.toLowerCase(),
        ) ??
        warehouse.fields.find(
          (field) =>
            field.tableId === sourceTable?.id &&
            field.chineseName === lineage.sourceFieldChineseName,
        );
      rememberCurrentLocation();
      setActiveWorkspace("warehouse");
      setSelectedTableId(sourceTable?.id ?? warehouse.tables[0]?.id ?? "");
      setSelectedFieldId(sourceField?.id ?? null);
      setActiveNav("tables");
      setQuery("");
    },
    [rememberCurrentLocation],
  );

  const inspectImportFile = async (file: File) => {
    setInspecting(true);
    setImportError("");
    try {
      const sheets = await inspectExcelFile(file);
      setImportFile(file);
      setImportSheets(sheets);
      setSelectedImportSheets(
        sheets
          .filter((sheet) => !sheet.likelyRevision)
          .map((sheet) => sheet.name),
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "文件读取失败，请检查文件格式。",
      );
    } finally {
      setInspecting(false);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await inspectImportFile(file);
    event.target.value = "";
  };

  const openImport = (mode: "excel" | "ddl" = "excel") => {
    setImportMode(mode);
    setImportError("");
    setShowImport(true);
  };

  const finalizeImport = async (
    imported: DictionaryDataset,
    slot: DatasetSlot,
    fingerprint: string,
    onProgress?: (progress: number) => void,
  ) => {
    try {
      await saveWorkspaceDataset(
        slot,
        imported,
        { kind: "uploaded", fingerprint },
        onProgress,
      );
      setCacheAvailable(true);
    } catch {
      setCacheAvailable(false);
    }
    setDatasets((current) => ({ ...current, [slot]: imported }));
    setDatasetOrigins((current) => ({ ...current, [slot]: "uploaded" }));
    setDatasetSources((current) => ({
      ...current,
      [slot]: { kind: "uploaded", fingerprint },
    }));
    setActiveWorkspace(slot);
    setQuery("");
    setSelectedFieldId(null);
    setSelectedStandardId(null);
    setSelectedCodeId(null);
    setSelectedTableId(imported.tables[0]?.id ?? "");
    setShowImport(false);
    setNavigationStack([]);
    setImportFile(null);
    setImportSheets([]);
    setSelectedImportSheets([]);
    setDdlText("");
    setDdlName("");
  };

  const handleImportConfirm = async () => {
    if (!importFile || selectedImportSheets.length === 0) {
      setImportError("请至少选择一个工作表。");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      setImportProgress(5);
      const imported = await readExcelFile(
        importFile,
        selectedImportSheets,
        (progress) => setImportProgress(Math.round(progress * 0.8)),
      );
      const slot: DatasetSlot =
        imported.adapterName === "rcvp-retail-mart-adapter"
          ? "retail"
          : "warehouse";
      await finalizeImport(
        imported,
        slot,
        fingerprintUploadedFile(importFile),
        (progress) => setImportProgress(80 + Math.round(progress * 0.2)),
      );
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "文件读取失败，请检查文件格式。",
      );
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  const handleDdlConfirm = async () => {
    if (!ddlText.trim()) {
      setImportError("请粘贴 DDL 语句（CREATE TABLE …）。");
      return;
    }
    setImporting(true);
    setImportError("");
    try {
      const sourceName =
        ddlName.trim() ||
        `DDL 导入 · ${new Date().toLocaleDateString("zh-CN")}`;
      const imported = parseDdl(ddlText, { sourceName });
      if (imported.tables.length === 0) {
        setImportError(
          imported.issues[0]?.message ??
            "未解析出任何数据表，请检查 DDL 内容。",
        );
        return;
      }
      await finalizeImport(
        imported,
        "warehouse",
        `ddl:${sourceName}:${ddlText.length}`,
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "DDL 解析失败。");
    } finally {
      setImporting(false);
    }
  };

  const closeSettings = () => {
    setShowSettings(false);
    setSettingsConfirm(null);
  };

  const handleDeleteActiveSource = async () => {
    const slot = activeWorkspace;
    closeSettings();
    try {
      await deleteWorkspaceDataset(slot);
    } catch {
      setCacheAvailable(false);
      return;
    }
    const nextDatasets: WorkspaceDatasets = { ...datasets };
    delete nextDatasets[slot];
    const nextOrigins: WorkspaceOrigins = { ...datasetOrigins };
    delete nextOrigins[slot];
    const nextSources: WorkspaceSources = { ...datasetSources };
    delete nextSources[slot];
    setDatasets(nextDatasets);
    setDatasetOrigins(nextOrigins);
    setDatasetSources(nextSources);
    const remaining = (Object.keys(nextDatasets) as DatasetSlot[])[0];
    if (remaining) {
      selectWorkspace(remaining);
    } else {
      setActiveWorkspace("warehouse");
      setSelectedTableId("");
      setSelectedFieldId(null);
      setSelectedStandardId(null);
      setSelectedCodeId(null);
      setQuery("");
      setNavigationStack([]);
    }
  };

  const handleClearAllData = async () => {
    closeSettings();
    try {
      await clearPersistedDataset();
    } catch {
      setCacheAvailable(false);
      return;
    }
    setDatasets({});
    setDatasetOrigins({});
    setDatasetSources({});
    setActiveWorkspace("warehouse");
    setSelectedTableId("");
    setSelectedFieldId(null);
    setSelectedStandardId(null);
    setSelectedCodeId(null);
    setQuery("");
    setNavigationStack([]);
  };

  const commitDataset = useCallback(
    (next: DictionaryDataset) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const refreshed = refreshStats(next);
      setDatasets((current) => ({ ...current, [slot]: refreshed }));
      const source =
        datasetSourcesRef.current[slot] ?? {
          kind: "uploaded" as const,
          fingerprint: "manual-edit",
        };
      saveWorkspaceDataset(slot, refreshed, source)
        .then(() => setCacheAvailable(true))
        .catch(() => setCacheAvailable(false));
    },
    [],
  );

  const handleDeleteTable = useCallback(
    (tableId: string) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const current = datasetsRef.current[slot];
      if (!current) return;
      commitDataset({
        ...current,
        tables: current.tables.filter((table) => table.id !== tableId),
        fields: current.fields.filter((field) => field.tableId !== tableId),
      });
      const view = viewRef.current;
      const selectedFieldTableId = view?.selectedFieldId
        ? current.fields.find((field) => field.id === view.selectedFieldId)
            ?.tableId
        : undefined;
      if (selectedFieldTableId === tableId) setSelectedFieldId(null);
      if (view?.selectedTableId === tableId) {
        setSelectedTableId(
          current.tables.find((table) => table.id !== tableId)?.id ?? "",
        );
      }
    },
    [commitDataset],
  );

  const handleDeleteField = useCallback(
    (fieldId: string) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const current = datasetsRef.current[slot];
      if (!current) return;
      const target = current.fields.find((field) => field.id === fieldId);
      if (!target) return;
      const remainingFields = current.fields.filter(
        (field) => field.id !== fieldId,
      );
      commitDataset({
        ...current,
        fields: remainingFields,
        tables: current.tables.map((table) =>
          table.id === target.tableId
            ? {
                ...table,
                fieldCount: remainingFields.filter(
                  (field) => field.tableId === table.id,
                ).length,
              }
            : table,
        ),
      });
      if (viewRef.current?.selectedFieldId === fieldId)
        setSelectedFieldId(null);
    },
    [commitDataset],
  );

  const handleDeleteStandard = useCallback(
    (standardId: string) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const current = datasetsRef.current[slot];
      if (!current) return;
      commitDataset({
        ...current,
        standards: current.standards.filter(
          (standard) => standard.id !== standardId,
        ),
      });
      if (viewRef.current?.selectedStandardId === standardId)
        setSelectedStandardId(null);
    },
    [commitDataset],
  );

  const handleDeleteCodeSet = useCallback(
    (codeSetName: string) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const current = datasetsRef.current[slot];
      if (!current) return;
      commitDataset({
        ...current,
        codeItems: current.codeItems.filter(
          (code) => code.codeSetName !== codeSetName,
        ),
      });
      setSelectedCodeId((id) =>
        id &&
        (id === codeSetName ||
          id === `${codeSetName}:` ||
          id.startsWith(`${codeSetName}:`))
          ? null
          : id,
      );
    },
    [commitDataset],
  );

  const handleDeleteCodeValue = useCallback(
    (codeId: string) => {
      const slot = viewRef.current?.activeWorkspace ?? "warehouse";
      const current = datasetsRef.current[slot];
      if (!current) return;
      const target = current.codeItems.find((code) => code.id === codeId);
      if (!target) return;
      const remainingItems = current.codeItems.filter(
        (code) => code.id !== codeId,
      );
      commitDataset({ ...current, codeItems: remainingItems });
      if (viewRef.current?.selectedCodeId === codeId) {
        setSelectedCodeId(
          remainingItems.find((code) => code.codeSetName === target.codeSetName)
            ?.id ?? null,
        );
      }
    },
    [commitDataset],
  );

  const resetImport = () => {
    setShowImport(false);
    setImportError("");
    setImportFile(null);
    setImportSheets([]);
    setSelectedImportSheets([]);
    setDdlText("");
    setDdlName("");
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (browserBackPendingRef.current) {
        browserBackPendingRef.current = false;
        return;
      }
      const saved = readBrowserHistoryState(event.state);
      if (!saved) return;
      restoreLocation(saved.view, saved.navigationStack);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [restoreLocation]);

  useEffect(() => {
    if (!dataset) return;
    window.history.replaceState(
      {
        ...window.history.state,
        dataDictionaryQueryDesk: {
          view: {
            activeWorkspace,
            activeNav,
            query,
            searchFilter,
            selectedTableId,
            selectedFieldId,
            selectedStandardId,
            selectedCodeId,
          },
          navigationStack,
        },
      },
      "",
    );
  }, [
    dataset,
    activeWorkspace,
    activeNav,
    query,
    searchFilter,
    selectedTableId,
    selectedFieldId,
    selectedStandardId,
    selectedCodeId,
    navigationStack,
  ]);

  const importDialog = showImport ? (
    <ImportDialog
      importing={importing}
      inspecting={inspecting}
      progress={importProgress}
      error={importError}
      file={importFile}
      sheets={importSheets}
      selectedSheets={selectedImportSheets}
      mode={importMode}
      onModeChange={setImportMode}
      ddlText={ddlText}
      onDdlTextChange={setDdlText}
      ddlName={ddlName}
      onDdlNameChange={setDdlName}
      onDdlConfirm={handleDdlConfirm}
      fileInputRef={fileInputRef}
      onClose={resetImport}
      onFileChange={handleFileChange}
      onToggleSheet={(name) =>
        setSelectedImportSheets((current) =>
          current.includes(name)
            ? current.filter((item) => item !== name)
            : [...current, name],
        )
      }
      onConfirm={handleImportConfirm}
    />
  ) : null;

  const renderContent = () => {
    if (!dataset) return null;
    const selectedTable =
      dataset.tables.find((table) => table.id === selectedTableId) ??
      dataset.tables.find((table) => !table.entityKind) ??
      dataset.tables[0];
    const selectedField =
      dataset.fields.find((field) => field.id === selectedFieldId) ?? null;
    const selectedStandard =
      dataset.standards.find(
        (standard) => standard.id === selectedStandardId,
      ) ?? null;
    const selectedCode =
      dataset.codeItems.find((code) => code.id === selectedCodeId) ??
      (selectedCodeId
        ? dataset.codeItems.find(
            (code) => code.codeSetName === selectedCodeId.replace(/:$/, ""),
          )
        : undefined) ??
      null;
    if (activeNav === "search") {
      return (
        <SearchView
          dataset={dataset}
          origin={datasetOrigin}
          cacheAvailable={cacheAvailable}
          query={query}
          setQuery={setQuery}
          searchFilter={searchFilter}
          setSearchFilter={setSearchFilter}
          response={searchResponse}
          onOpenTable={openTable}
          onOpenField={openField}
          onOpenStandard={openStandard}
          onOpenCode={openCode}
        />
      );
    }
    if (activeNav === "tables") {
      return (
        <TablesView
          dataset={dataset}
          selectedTable={selectedTable}
          selectedField={selectedField}
          onSelectTable={openTable}
          onSelectField={openField}
          onCloseField={goBack}
          onCopy={copyValue}
          onOpenStandard={openStandard}
          onOpenCode={openCode}
          onOpenWarehouseLineage={openWarehouseLineage}
          onDeleteTable={handleDeleteTable}
          onDeleteField={handleDeleteField}
        />
      );
    }
    if (activeNav === "standards") {
      return (
        <StandardsView
          dataset={dataset}
          selectedStandard={selectedStandard}
          onSelect={openStandard}
          onOpenField={openField}
          onOpenCode={openCode}
          onDeleteStandard={handleDeleteStandard}
        />
      );
    }
    if (activeNav === "codes") {
      return (
        <CodesView
          dataset={dataset}
          selectedCode={selectedCode}
          onSelect={(code) => openCode(code.id)}
          onOpenField={openField}
          onDeleteCodeSet={handleDeleteCodeSet}
          onDeleteCodeValue={handleDeleteCodeValue}
        />
      );
    }
    if (activeNav === "insights") {
      return <InsightsView dataset={dataset} />;
    }
    return (
      <SourcesView
        dataset={dataset}
        origin={datasetOrigin}
        cacheAvailable={cacheAvailable}
        onOpenImport={openImport}
      />
    );
  };

  if (!dataset)
    return (
      <>
        <BootstrapScreen
          state={bootstrapState}
          hasSource={Object.keys(datasets).length > 0}
          error={bootstrapError}
          onRetry={() => setBootstrapAttempt((attempt) => attempt + 1)}
          onOpenImport={openImport}
        />
        {importDialog}
      </>
    );

  return (
    <div className="app-shell" data-testid="dataset-ready">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Database size={19} strokeWidth={2.3} />
          </div>
          <div>
            <div className="brand-name">查询台</div>
            <div className="brand-caption">DATA DICTIONARY</div>
          </div>
        </div>
        <div className="sidebar-section-label">工作区</div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ key, label, icon: Icon, divider }) => (
            <Fragment key={key}>
              {divider && <div className="nav-divider" role="separator" />}
              <button
                className={`nav-item ${activeNav === key ? "active" : ""}`}
                onClick={() => {
                  setActiveNav(key);
                  setSelectedFieldId(null);
                  setNavigationStack([]);
                }}
                data-testid={`nav-${key}`}
              >
                <Icon size={17} />
                <span>{label}</span>
                {key === "search" && <kbd>⌘ K</kbd>}
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="sidebar-section-label source-label">
          数据源
          {Object.keys(datasets).length > 0
            ? ` · ${Object.keys(datasets).length}`
            : ""}
        </div>
        <div className="source-list">
          {(["warehouse", "retail"] as const)
            .filter((slot) => datasets[slot])
            .map((slot) => (
              <button
                key={slot}
                className={`source-card ${activeWorkspace === slot ? "active" : ""}`}
                data-testid={`source-${slot}`}
                onClick={() => {
                  selectWorkspace(slot);
                  setActiveNav("sources");
                  setNavigationStack([]);
                }}
              >
                <div className="source-card-icon">
                  <FileSpreadsheet size={16} />
                </div>
                <div className="source-card-copy">
                  <strong>{datasets[slot]?.sourceFile}</strong>
                  <span>
                    {datasets[slot]?.stats.tableCount.toLocaleString("zh-CN")}{" "}
                    张表 ·{" "}
                    {datasets[slot]?.stats.fieldCount.toLocaleString("zh-CN")}{" "}
                    字段
                  </span>
                </div>
                <ChevronRight size={15} className="source-arrow" />
              </button>
            ))}
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          本地索引就绪<span className="footer-version">v0.1</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            {navigationStack.length > 0 && (
              <button
                className="back-button"
                data-testid="navigation-back"
                onClick={goBack}
              >
                <ArrowLeft size={14} />
                返回
              </button>
            )}
            <span>工作区</span>
            <ChevronRight size={13} />
            <strong>
              {navItems.find((item) => item.key === activeNav)?.label ??
                "数据源"}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              className="quiet-button"
              title="打开导入向导"
              onClick={() => openImport("excel")}
            >
              <Upload size={15} />
              导入文件
            </button>
            <div className="settings-wrap">
              <button
                className="icon-button"
                title="设置"
                data-testid="settings-button"
                aria-haspopup="menu"
                aria-expanded={showSettings}
                onClick={() => {
                  setShowSettings((open) => !open);
                  setSettingsConfirm(null);
                }}
              >
                <Settings2 size={17} />
              </button>
              {showSettings && (
                <>
                  <div className="settings-backdrop" onClick={closeSettings} />
                  <div className="settings-menu" role="menu" data-testid="settings-menu">
                    <div className="settings-menu-head">
                      <span>数据源管理</span>
                      <small>{datasets[activeWorkspace]?.sourceFile ?? "未选择"}</small>
                    </div>
                    <button
                      role="menuitem"
                      className="settings-menu-item danger"
                      data-testid="settings-delete-source"
                      onClick={() =>
                        settingsConfirm === "delete"
                          ? void handleDeleteActiveSource()
                          : setSettingsConfirm("delete")
                      }
                    >
                      <Trash2 size={15} />
                      {settingsConfirm === "delete"
                        ? "再点一次，确认删除"
                        : "删除当前数据源"}
                    </button>
                    <button
                      role="menuitem"
                      className="settings-menu-item danger"
                      data-testid="settings-clear-all"
                      onClick={() =>
                        settingsConfirm === "clear"
                          ? void handleClearAllData()
                          : setSettingsConfirm("clear")
                      }
                    >
                      <Trash size={15} />
                      {settingsConfirm === "clear"
                        ? "再点一次，确认清空"
                        : "清空全部本地索引"}
                    </button>
                    <div className="settings-menu-note">
                      {cacheAvailable
                        ? "删除仅影响本机浏览器索引，不影响原始文件。"
                        : "浏览器拒绝了 IndexedDB，当前数据只在页面内存中。"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="content-area">{renderContent()}</div>
      </main>

      {importDialog}
    </div>
  );
}

export default App;
