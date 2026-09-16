import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web'
import type { DictionaryDataset } from './lib/import/types'

const mocks = vi.hoisted(() => ({
  clearPersistedDataset: vi.fn(),
  deleteWorkspaceDataset: vi.fn(),
  inspectExcelFile: vi.fn(),
  readExcelFile: vi.fn(),
  fingerprintUploadedFile: vi.fn(),
  loadPersistedDataset: vi.fn(),
  loadPersistedWorkspace: vi.fn(),
  savePersistedDataset: vi.fn(),
  saveWorkspaceDataset: vi.fn(),
}))

vi.mock('./lib/import/file', () => ({
  inspectExcelFile: mocks.inspectExcelFile,
  readExcelFile: mocks.readExcelFile,
  fingerprintUploadedFile: mocks.fingerprintUploadedFile,
}))

vi.mock('./lib/storage/indexedDb', () => ({
  clearPersistedDataset: mocks.clearPersistedDataset,
  deleteWorkspaceDataset: mocks.deleteWorkspaceDataset,
  loadPersistedDataset: mocks.loadPersistedDataset,
  loadPersistedWorkspace: mocks.loadPersistedWorkspace,
  savePersistedDataset: mocks.savePersistedDataset,
  saveWorkspaceDataset: mocks.saveWorkspaceDataset,
}))

const dataset: DictionaryDataset = {
  adapterName: 'dp-ial-adapter', importedAt: '2026-08-18T00:00:00.000Z', sourceFile: 'dp_ial.xlsx',
  tables: [{ id: 't1', chineseName: '完整机构信息表', englishName: 'a_pub_org_info_tab', fieldCount: 1, topic: 'org', businessScope: '', owner: '', loadFrequency: '日', loadStrategy: '全量', retention: '', collection: '', usage: '', sourceSheet: '目录', sourceRow: 2 }],
  fields: [{ id: 'f1', tableId: 't1', tableChineseName: '完整机构信息表', tableEnglishName: 'a_pub_org_info_tab', ordinal: 1, chineseName: '机构类型', englishName: 'org_type', fieldType: 'varchar', srFieldType: 'string', dataLength: '2', standardNo: 'STD-001', publicCodeName: '机构类型代码', remark: '机构类型说明', isPrimaryKey: true, isDistributionKey: true, isPartitionKey: true, lineage: { sourceSystem: '数据平台', sourceTableChineseName: '机构基础表', sourceTableEnglishName: 'A_PUB_ORG_INFO_TAB', sourceFieldChineseName: '机构类型', sourceFieldEnglishName: 'ORG_TYPE', mappingRule: "CASE WHEN P1.ORG_TYPE = '1' THEN '总行' END", sourceRemark: '按机构类型映射' }, sourceSheet: '数据字典', sourceRow: 2 }],
  standards: [{ id: 'STD-001', standardNo: 'STD-001', chineseName: '机构类型', englishName: 'organization type', topic: '机构', dataType: 'varchar', dataLength: '2', precision: '', sourceSheet: '标准', sourceRow: 2 }],
  codeItems: [{ id: '机构类型代码:01', codeSetName: '机构类型代码', codeSetEnglishName: 'org_type_code', value: '01', valueDescription: '总行', standardNo: 'STD-001', standardName: '机构类型', sourceSheet: '代码', sourceRow: 2 }],
  revisions: [{ id: 'r1', modifiedAt: '2026-08-01', tableName: '完整机构信息表', operation: '新增', fieldBefore: '', fieldAfter: '机构类型', before: '', after: '', reason: '补充字段', operator: '管理员', sourceSheet: '修订', sourceRow: 2 }], unknownSheets: [], issues: [],
  stats: { sheetCount: 5, tableCount: 1, fieldCount: 1, standardCount: 1, codeItemCount: 1, revisionCount: 1, issueCount: 0 },
}

const retailDataset: DictionaryDataset = {
  ...dataset,
  adapterName: 'rcvp-retail-mart-adapter',
  sourceFile: 'rcvp.xlsx',
  tables: [{ ...dataset.tables[0], id: 'M07_D_P_CUST_INFO', chineseName: '零售客户基本信息表', englishName: 'M07_D_P_CUST_INFO' }],
  fields: [{ ...dataset.fields[0], id: 'M07_D_P_CUST_INFO:1:CUST_ID', tableId: 'M07_D_P_CUST_INFO', tableChineseName: '零售客户基本信息表', tableEnglishName: 'M07_D_P_CUST_INFO', chineseName: '客户编号', englishName: 'CUST_ID' }],
}

const groupedCodeDataset: DictionaryDataset = {
  ...dataset,
  codeItems: [
    { ...dataset.codeItems[0], id: '抵债物处置方式代码:01:2', codeSetName: '抵债物处置方式代码', codeSetEnglishName: '', value: '01', valueDescription: '拍卖', sourceRow: 2 },
    { ...dataset.codeItems[0], id: '抵债物处置方式代码:02:3', codeSetName: '抵债物处置方式代码', codeSetEnglishName: '', value: '02', valueDescription: '变卖', sourceRow: 3 },
    { ...dataset.codeItems[0], id: '机构类型代码:01:5', codeSetName: '机构类型代码', value: '01', valueDescription: '总行', sourceRow: 5 },
  ],
  stats: { ...dataset.stats, codeItemCount: 3 },
}

const SAMPLE_DDL = `CREATE TABLE a_pub_staff_tab (
  data_dt date NOT NULL,
  staff_id varchar(10) NOT NULL PRIMARY KEY COMMENT '员工编号'
) DISTRIBUTE BY HASH(staff_id);
COMMENT ON TABLE a_pub_staff_tab IS '员工表';`

describe('application bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    mocks.loadPersistedWorkspace.mockResolvedValue({})
    mocks.saveWorkspaceDataset.mockResolvedValue(undefined)
    mocks.deleteWorkspaceDataset.mockResolvedValue(undefined)
    mocks.clearPersistedDataset.mockResolvedValue(undefined)
    mocks.inspectExcelFile.mockResolvedValue([{ name: '数据字典', rowCount: 2, preview: [['表中文名']], likelyRevision: false }])
  })

  it('starts from an empty state when no local dataset exists and never fetches a default workbook', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({})
    const { default: App } = await import('./App')

    render(<App />)

    await expect(screen.findByTestId('dataset-empty')).resolves.toBeTruthy()
    expect(screen.getByRole('button', { name: '导入 Excel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '粘贴 DDL' })).toBeInTheDocument()
    expect(mocks.readExcelFile).not.toHaveBeenCalled()
    expect(mocks.saveWorkspaceDataset).not.toHaveBeenCalled()
  })

  it('restores a persisted uploaded dataset without re-parsing anything', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('dataset-ready')).toBeInTheDocument())
    expect(mocks.readExcelFile).not.toHaveBeenCalled()
    expect(screen.getByTestId('source-warehouse')).toHaveTextContent('dp_ial.xlsx')
    expect(screen.getByTestId('cache-status')).toHaveTextContent('已从 IndexedDB 恢复')
  })

  it('imports an Excel workbook from the empty state and persists it', async () => {
    mocks.readExcelFile.mockResolvedValue(dataset)
    mocks.fingerprintUploadedFile.mockReturnValue('manual-1')
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-empty')).resolves.toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '导入 Excel' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['workbook'], 'dp_ial.xlsx')] } })
    await waitFor(() => expect(screen.getByTestId('sheet-list')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '导入选中 Sheet' }))

    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith('warehouse', dataset, { kind: 'uploaded', fingerprint: 'manual-1' }, expect.any(Function))
    expect(screen.getByTestId('source-warehouse')).toHaveTextContent('dp_ial.xlsx')
  })

  it('parses pasted DDL into a searchable dataset', async () => {
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-empty')).resolves.toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '粘贴 DDL' }))
    fireEvent.change(screen.getByTestId('ddl-name'), { target: { value: '员工域 DDL' } })
    fireEvent.change(screen.getByTestId('ddl-text'), { target: { value: SAMPLE_DDL } })
    fireEvent.click(screen.getByTestId('ddl-confirm'))

    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith('warehouse', expect.objectContaining({ adapterName: 'ddl-parser', sourceFile: '员工域 DDL' }), { kind: 'uploaded', fingerprint: expect.stringContaining('员工域 DDL') }, undefined)
    expect(screen.getByTestId('source-warehouse')).toHaveTextContent('员工域 DDL')

    fireEvent.change(screen.getByTestId('global-search'), { target: { value: '员工编号' } })
    expect(screen.getByTestId('field-result')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('field-result'))
    expect(screen.getByTestId('field-detail')).toHaveTextContent('staff_id')
  })

  it('opens a field in the current view and returns to the previous context', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()

    fireEvent.change(screen.getByTestId('global-search'), { target: { value: '机构类型' } })
    expect(screen.getByTestId('field-result')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('field-result'))
    await expect(screen.findByTestId('field-detail')).resolves.toBeTruthy()
    expect(screen.getByTestId('field-detail')).toHaveTextContent('机构类型代码')
    expect(screen.getByTestId('field-lineage')).toHaveTextContent('A_PUB_ORG_INFO_TAB')
    expect(screen.getByTestId('field-lineage')).toHaveTextContent('CASE WHEN P1.ORG_TYPE')
    fireEvent.click(screen.getAllByTitle('复制')[0])

    fireEvent.click(screen.getByText('STD-001', { selector: 'button' }))
    expect(screen.getByRole('heading', { name: '机构类型' })).toBeInTheDocument()
    expect(screen.getByTestId('navigation-back')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('navigation-back'))
    await expect(screen.findByTestId('field-detail')).resolves.toBeTruthy()
    expect(screen.getByTestId('field-detail')).toHaveClass('field-detail-drawer')
    expect(screen.getByTestId('table-detail')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('navigation-back'))
    expect(screen.getByTestId('global-search')).toHaveValue('机构类型')
    fireEvent.click(screen.getByTestId('nav-codes'))
    fireEvent.click(screen.getByText('机构类型代码', { selector: 'strong' }))
    expect(screen.getByText('总行')).toBeInTheDocument()
    expect(screen.getByTestId('code-values')).toHaveClass('code-values-scroll')
    expect(screen.getByTestId('code-directory-search')).toBeInTheDocument()
    expect(document.querySelector('.codes-list .scroll-list')).not.toBeNull()
    expect(screen.getByTestId('code-related-fields')).toHaveClass('code-related-fields-scroll')
    fireEvent.click(screen.getByTitle('复制'))
    expect(screen.queryByTestId('nav-revisions')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-search'))
    fireEvent.change(screen.getByTestId('global-search'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /法人代码/ }))
    expect(screen.getByText('没有匹配结果')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '字段' }))
    fireEvent.click(screen.getByTestId('nav-tables'))
    fireEvent.change(screen.getByPlaceholderText('筛选表'), { target: { value: '完整机构' } })
    fireEvent.click(screen.getByText('完整机构信息表', { selector: '.table-list-copy strong' }))
    fireEvent.change(screen.getByPlaceholderText('筛选字段'), { target: { value: '机构类型' } })
    fireEvent.click(screen.getByText('机构类型', { selector: 'td strong' }))
    fireEvent.click(screen.getByTitle('关闭字段详情'))
  })

  it('restores the previous field when the browser native back event is triggered', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.change(screen.getByTestId('global-search'), { target: { value: '机构类型' } })
    fireEvent.click(screen.getByTestId('field-result'))
    fireEvent.click(screen.getByText('STD-001', { selector: 'button' }))
    expect(screen.getByRole('heading', { name: '机构类型' })).toBeInTheDocument()

    window.dispatchEvent(new PopStateEvent('popstate', {
      state: {
        dataDictionaryQueryDesk: {
          view: { activeWorkspace: 'warehouse', activeNav: 'tables', query: '机构类型', searchFilter: 'all', selectedTableId: 't1', selectedFieldId: 'f1', selectedStandardId: null, selectedCodeId: null },
          navigationStack: [{ activeWorkspace: 'warehouse', activeNav: 'search', query: '机构类型', searchFilter: 'all', selectedTableId: 't1', selectedFieldId: null, selectedStandardId: null, selectedCodeId: null }],
        },
      },
    }))

    await expect(screen.findByTestId('field-detail')).resolves.toBeTruthy()
    expect(screen.getByTestId('field-detail')).toHaveTextContent('机构类型')
  })

  it('imports a user workbook even when its cache write is unavailable', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    mocks.readExcelFile.mockResolvedValue(dataset)
    mocks.fingerprintUploadedFile.mockReturnValue('manual-2')
    mocks.saveWorkspaceDataset.mockRejectedValue(new Error('配额不足'))
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '导入文件' }))
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['workbook'], '自定义字典.xlsx')] } })
    await waitFor(() => expect(screen.getByTestId('sheet-list')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '导入选中 Sheet' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByTestId('source-warehouse'))
    expect(screen.getAllByText('本地导入')).not.toHaveLength(0)
    expect(screen.getByText('文件仅保留在当前页面内存中')).toBeInTheDocument()
  })

  it('keeps the import dialog open and explains a workbook parsing failure', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    mocks.readExcelFile.mockRejectedValue(new Error('未找到可识别的表头'))
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '导入文件' }))
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['bad'], '错误格式.xlsx')] } })
    await waitFor(() => expect(screen.getByTestId('sheet-list')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '导入选中 Sheet' }))

    await expect(screen.findByText('未找到可识别的表头')).resolves.toBeTruthy()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders the standards library through the animated list', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-standards'))
    expect(screen.getByText('机构类型', { selector: '.compact-row strong' })).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('standards-filter'), { target: { value: '法人' } })
    expect(screen.getByText('没有匹配的标准')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('standards-filter'), { target: { value: '' } })
    fireEvent.click(screen.getByText('机构类型', { selector: '.compact-row strong' }))
    expect(screen.getByRole('heading', { name: '机构类型' })).toBeInTheDocument()
    expect(screen.getAllByText('机构类型', { selector: '.related-row strong' })[0]).toBeInTheDocument()
  })

  it('deletes the active source from the settings menu', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('settings-button'))
    fireEvent.click(screen.getByTestId('settings-delete-source'))
    expect(screen.getByTestId('settings-delete-source')).toHaveTextContent('再点一次')
    fireEvent.click(screen.getByTestId('settings-delete-source'))

    await expect(screen.findByTestId('dataset-empty')).resolves.toBeTruthy()
    expect(mocks.deleteWorkspaceDataset).toHaveBeenCalledWith('warehouse')
  })

  it('clears all local data from the settings menu', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({
      warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' },
      retail: { dataset: retailDataset, source: { kind: 'uploaded', fingerprint: 'rcvp-v1' }, savedAt: '2026-08-18T00:00:00.000Z' },
    })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('settings-button'))
    fireEvent.click(screen.getByTestId('settings-clear-all'))
    fireEvent.click(screen.getByTestId('settings-clear-all'))

    await expect(screen.findByTestId('dataset-empty')).resolves.toBeTruthy()
    expect(mocks.clearPersistedDataset).toHaveBeenCalledOnce()
  })

  it('switches between the retail and warehouse sources and follows a lineage link', async () => {
    mocks.loadPersistedDataset.mockResolvedValue(null)
    mocks.loadPersistedWorkspace.mockResolvedValue({
      warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' },
      retail: { dataset: retailDataset, source: { kind: 'uploaded', fingerprint: 'rcvp-v1' }, savedAt: '2026-08-18T00:00:00.000Z' },
    })
    mocks.saveWorkspaceDataset.mockResolvedValue(undefined)
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    expect(screen.getByTestId('source-warehouse')).toHaveTextContent('dp_ial.xlsx')
    expect(screen.getByTestId('source-retail')).toHaveTextContent('rcvp.xlsx')
    fireEvent.click(screen.getByTestId('source-retail'))
    expect(screen.getByTestId('source-retail')).toHaveClass('active')
    fireEvent.click(screen.getByTestId('nav-search'))
    fireEvent.change(screen.getByTestId('global-search'), { target: { value: 'CUST_ID' } })
    fireEvent.click(screen.getByTestId('field-result'))
    fireEvent.click(screen.getByRole('button', { name: '跳转至 DP_IAL 字段' }))
    expect(screen.getByTestId('source-warehouse')).toHaveClass('active')
    expect(screen.getByTestId('field-detail')).toHaveTextContent('org_type')
  })

  it('lists each public code set once regardless of how many values it contains', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset: groupedCodeDataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-codes'))
    expect(screen.getAllByText('抵债物处置方式代码', { selector: '.compact-row strong' })).toHaveLength(1)
    expect(screen.getByText('2 个代码值')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('抵债物处置方式代码', { selector: '.compact-row strong' }))
    expect(screen.getByText('拍卖')).toBeInTheDocument()
    expect(screen.getByText('变卖')).toBeInTheDocument()
    expect(mocks.readExcelFile).not.toHaveBeenCalled()
  })

  it('deletes a table manually from the catalog and persists the change', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-tables'))
    const deleteButton = screen.getByRole('button', { name: '删除表：完整机构信息表' })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    await waitFor(() => expect(screen.getByText('请选择一张表')).toBeInTheDocument())
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith('warehouse', expect.objectContaining({ tables: [], fields: [] }), { kind: 'uploaded', fingerprint: 'manual-1' })
  })

  it('deletes a single field from the schema table and updates the field count', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-tables'))
    const deleteButton = screen.getByRole('button', { name: '删除字段：机构类型' })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    await waitFor(() => expect(screen.getByText('没有匹配字段')).toBeInTheDocument())
    expect(screen.getByText('0', { selector: '.field-count' })).toBeInTheDocument()
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith('warehouse', expect.objectContaining({ fields: [] }), expect.anything())
  })

  it('deletes a data standard manually', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-standards'))
    const deleteButton = screen.getByRole('button', { name: '删除标准：机构类型' })
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    await waitFor(() => expect(screen.getByText('没有匹配的标准')).toBeInTheDocument())
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith('warehouse', expect.objectContaining({ standards: [] }), expect.anything())
  })

  it('deletes a single code value and then a whole code set', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset: groupedCodeDataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-codes'))
    fireEvent.click(screen.getByText('抵债物处置方式代码', { selector: '.compact-row strong' }))
    const deleteValue = screen.getByRole('button', { name: '删除代码值：02' })
    fireEvent.click(deleteValue)
    fireEvent.click(deleteValue)

    await waitFor(() => expect(screen.queryByRole('button', { name: '删除代码值：02' })).not.toBeInTheDocument())
    expect(screen.getByText('1 个值')).toBeInTheDocument()

    const deleteSet = screen.getByRole('button', { name: '删除代码集：抵债物处置方式代码' })
    fireEvent.click(deleteSet)
    fireEvent.click(deleteSet)

    await waitFor(() => expect(screen.queryByText('抵债物处置方式代码', { selector: '.compact-row strong' })).not.toBeInTheDocument())
    expect(screen.getByText('机构类型代码', { selector: '.compact-row strong' })).toBeInTheDocument()
    expect(mocks.saveWorkspaceDataset).toHaveBeenCalledTimes(2)
  })

  it('hides tag/view entities by default and links standards to code sets', async () => {
    const tagDataset: DictionaryDataset = {
      ...dataset,
      tables: [
        dataset.tables[0],
        { ...dataset.tables[0], id: 't-tag', chineseName: '标签管理系统标签表', englishName: 'M07_A_TAG_P_CUST_INFO_LMP', entityKind: 'tag' },
        { ...dataset.tables[0], id: 't-view', chineseName: '零售客户视图贷款明细表', englishName: 'M07_S_P_LOAN_DETAIL', entityKind: 'view' },
      ],
      standards: [{ ...dataset.standards[0], publicCodeName: '机构类型代码' }],
    }
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset: tagDataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-tables'))
    expect(screen.queryByText('标签管理系统标签表', { selector: '.table-list-copy strong' })).not.toBeInTheDocument()
    expect(screen.getByText('1 +2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toggle-tag-views'))
    expect(screen.getByText('标签管理系统标签表', { selector: '.table-list-copy strong' })).toBeInTheDocument()
    expect(screen.getByText('标签', { selector: '.entity-badge' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('toggle-tag-views'))
    expect(screen.queryByText('标签管理系统标签表', { selector: '.table-list-copy strong' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-standards'))
    fireEvent.click(screen.getByText('机构类型', { selector: '.compact-row strong' }))
    fireEvent.click(screen.getByTestId('standard-code-link'))
    expect(screen.getByRole('heading', { name: '机构类型代码' })).toBeInTheDocument()
    expect(screen.getByText('总行')).toBeInTheDocument()
  })

  it('generates dataset-level insights after testing the model connection', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    expect(document.querySelector('.nav-divider')).not.toBeNull()
    fireEvent.click(screen.getByTestId('nav-insights'))
    expect(screen.getByRole('heading', { name: '洞察思路' })).toBeInTheDocument()
    expect(screen.getByText('dp_ial.xlsx')).toBeInTheDocument()

    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4-flash' }, { id: 'glm-4' }] }) }
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '## 一、数据资产全景\n- 全行机构数据资产' } }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    // 未测试连接前：模型下拉禁用，生成按钮禁用
    expect(screen.getByTestId('insight-model')).toBeDisabled()
    expect(screen.getByTestId('insight-generate')).toBeDisabled()

    fireEvent.change(screen.getByTestId('insight-base'), { target: { value: 'http://llm.intra/v1' } })
    fireEvent.change(screen.getByTestId('insight-key'), { target: { value: 'sk-test' } })
    fireEvent.click(screen.getByTestId('insight-test'))
    await screen.findByText(/已连接，发现 2 个可用模型/)

    // 测试成功后自动选中第一个模型，可切换
    fireEvent.change(screen.getByTestId('insight-model'), { target: { value: 'glm-4' } })
    expect(screen.getByTestId('insight-generate')).toBeEnabled()

    fireEvent.click(screen.getByTestId('insight-generate'))
    await screen.findByText('全行机构数据资产')

    const modelsCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/models'))
    expect(modelsCall?.[0]).toBe('http://llm.intra/v1/models')
    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/chat/completions')) as unknown as [string, RequestInit]
    expect(chatCall[0]).toBe('http://llm.intra/v1/chat/completions')
    expect(chatCall[1].method).toBe('POST')
    const requestBody = JSON.parse(String(chatCall[1].body))
    expect(requestBody.model).toBe('glm-4')
    expect(requestBody.messages[0].content).toContain('dp_ial.xlsx')
    expect(requestBody.messages[0].content).toContain('完整机构信息表')
    vi.unstubAllGlobals()
  })

  it('streams insights progressively and exposes the prompt basis', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-insights'))

    const encoder = new TextEncoder()
    const sse = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sse({ choices: [{ delta: { content: '## 一、数据资产全景\n' } }] }))
        controller.enqueue(sse({ choices: [{ delta: { content: '- 覆盖机构与存款主题域' } }] }))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4' }] }) }
      }
      return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body }
    })
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.change(screen.getByTestId('insight-base'), { target: { value: 'http://llm.intra/v1' } })
    fireEvent.click(screen.getByTestId('insight-test'))
    await screen.findByText(/已连接，发现 1 个可用模型/)
    fireEvent.click(screen.getByTestId('insight-generate'))

    await screen.findByText('覆盖机构与存款主题域')
    expect(screen.getByRole('heading', { name: '一、数据资产全景' })).toBeInTheDocument()
    expect(screen.getByTestId('insight-basis')).toBeInTheDocument()
    expect(screen.getByTestId('insight-basis')).toHaveTextContent('完整机构信息表')

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/chat/completions')) as unknown as [string, RequestInit]
    const requestBody = JSON.parse(String(chatCall[1].body))
    expect(requestBody.stream).toBe(true)
    vi.unstubAllGlobals()
  })

  it('surfaces reasoning progress, renders markdown tables and offers preview actions', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-insights'))

    const encoder = new TextEncoder()
    const sse = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
    const content =
      '## 一、数据资产全景\n' +
      '| 主题域 | 核心实体 | 建议指标 |\n' +
      '| --- | --- | --- |\n' +
      '| 机构 | a_pub_org_info_tab | 机构数量 |\n' +
      '| 存款 | a_pub_dpsit_tab | 存款余额 |\n'
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sse({ choices: [{ delta: { reasoning_content: '先分析主题分布…' } }] }))
        controller.enqueue(sse({ choices: [{ delta: { reasoning_content: '再确定核心实体。' } }] }))
        controller.enqueue(sse({ choices: [{ delta: { content } }] }))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4.5' }] }) }
      }
      return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body }
    })
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.change(screen.getByTestId('insight-base'), { target: { value: 'http://llm.intra/v1' } })
    fireEvent.click(screen.getByTestId('insight-test'))
    await screen.findByText(/已连接，发现 1 个可用模型/)
    fireEvent.click(screen.getByTestId('insight-generate'))

    await screen.findByRole('table')
    expect(screen.getByRole('columnheader', { name: '主题域' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'a_pub_org_info_tab' })).toBeInTheDocument()
    expect(screen.getByTestId('insight-reasoning')).toHaveTextContent('先分析主题分布')
    expect(screen.getByTestId('insight-copy')).toBeInTheDocument()
    expect(screen.getByTestId('insight-download-md')).toBeInTheDocument()
    expect(screen.getByTestId('insight-download-html')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('keeps generating in the background while navigating to other pages', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    const encoder = new TextEncoder()
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4' }] }) }
      }
      return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body }
    })
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.click(screen.getByTestId('nav-insights'))
    fireEvent.change(screen.getByTestId('insight-base'), { target: { value: 'http://llm.intra/v1' } })
    fireEvent.click(screen.getByTestId('insight-test'))
    await screen.findByText(/已连接，发现 1 个可用模型/)

    streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '## 一、开头段落' } }] })}\n\n`))
    fireEvent.click(screen.getByTestId('insight-generate'))
    await screen.findByText('一、开头段落')
    expect(screen.getByTestId('insights-live-dot')).toBeInTheDocument()

    // 切到表目录：洞察组件卸载，但流仍在后台推进
    fireEvent.click(screen.getByTestId('nav-tables'))
    expect(screen.queryByTestId('insight-progress')).not.toBeInTheDocument()
    expect(screen.getByTestId('insights-live-dot')).toBeInTheDocument()
    streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '\n结尾段落' } }] })}\n\n`))
    streamController.enqueue(encoder.encode('data: [DONE]\n\n'))
    streamController.close()

    // 回到洞察页：完整结果仍在
    fireEvent.click(screen.getByTestId('nav-insights'))
    await screen.findByText('结尾段落')
    expect(screen.getByText('一、开头段落')).toBeInTheDocument()
    expect(screen.queryByTestId('insights-live-dot')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('persists the insight result across page reloads and supports a custom prompt', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    const first = render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-insights'))

    // 自定义提示词：含占位符
    fireEvent.click(screen.getByTestId('insight-prompt-editor').querySelector('summary')!)
    const promptBox = screen.getByTestId('insight-prompt')
    fireEvent.change(promptBox, { target: { value: '你是零售客户全生命周期建模顾问。请围绕首购/资产提升/流失预警给出建议。\n{数据摘要}' } })
    expect(screen.getByTestId('insight-prompt-reset')).toBeInTheDocument()

    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'glm-4' }] }) }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '## 一、模型建议\n- 首购模型优先使用自然人特征' } }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.change(screen.getByTestId('insight-base'), { target: { value: 'http://llm.intra/v1' } })
    fireEvent.click(screen.getByTestId('insight-test'))
    await screen.findByText(/已连接，发现 1 个可用模型/)
    fireEvent.click(screen.getByTestId('insight-generate'))
    await screen.findByText('首购模型优先使用自然人特征')

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/chat/completions')) as unknown as [string, RequestInit]
    const requestBody = JSON.parse(String(chatCall[1].body))
    expect(requestBody.messages[0].content).toContain('零售客户全生命周期建模顾问')
    expect(requestBody.messages[0].content).toContain('dp_ial.xlsx')
    expect(requestBody.messages[0].content).toContain('完整机构信息表')

    // 刷新模拟：卸载后重新挂载，结果从 localStorage 恢复
    first.unmount()
    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-insights'))
    expect(await screen.findByText('首购模型优先使用自然人特征')).toBeInTheDocument()
    expect(screen.getByText(/生成于/)).toBeInTheDocument()
    // 自定义提示词也被恢复
    expect(screen.getByTestId('insight-prompt')).toHaveValue('你是零售客户全生命周期建模顾问。请围绕首购/资产提升/流失预警给出建议。\n{数据摘要}')
    vi.unstubAllGlobals()
  })

  it('imports tables from a MySQL database through the bridge', async () => {
    window.localStorage.clear()
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('db-connect-button'))

    fireEvent.change(screen.getByTestId('db-host'), { target: { value: '10.20.30.5' } })
    fireEvent.change(screen.getByTestId('db-user'), { target: { value: 'ro_user' } })
    fireEvent.change(screen.getByTestId('db-password'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByTestId('db-database'), { target: { value: 'retail_mart' } })

    const ddl = [
      'CREATE TABLE `cust_info` (',
      "  `cust_no` varchar(20) NOT NULL COMMENT '客户编号',",
      '  PRIMARY KEY (`cust_no`)',
      ") ENGINE=InnoDB COMMENT='客户信息表';",
      'CREATE TABLE `acct_bal` (',
      '  `acct_no` varchar(20)',
      ') ENGINE=InnoDB;',
    ].join('\n')
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      const path = String(url)
      const body = JSON.parse(String(init?.body ?? '{}'))
      if (path.endsWith('/api/mysql/test')) return { ok: true, status: 200, json: async () => ({ ok: true, version: '8.0.36' }) }
      if (path.endsWith('/api/mysql/tables')) {
        expect(body.database).toBe('retail_mart')
        expect(body.password).toBe('secret')
        return { ok: true, status: 200, json: async () => ({ ok: true, tables: [{ name: 'cust_info', comment: '客户信息表' }, { name: 'acct_bal', comment: '' }] }) }
      }
      if (path.endsWith('/api/mysql/ddl')) {
        expect(body.tables).toEqual(['cust_info', 'acct_bal'])
        return { ok: true, status: 200, json: async () => ({ ok: true, ddl, imported: ['cust_info', 'acct_bal'] }) }
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(screen.getByTestId('db-fetch-tables')).toBeDisabled()
    fireEvent.click(screen.getByTestId('db-test'))
    await screen.findByText(/已连接（MySQL 8.0.36）/)
    fireEvent.click(screen.getByTestId('db-fetch-tables'))
    await screen.findByTestId('db-table-list')
    expect(screen.getByText('客户信息表', { selector: '.sheet-option small' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('db-confirm'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(mocks.saveWorkspaceDataset).toHaveBeenCalledWith(
        'warehouse',
        expect.objectContaining({
          sourceFile: 'MySQL retail_mart@10.20.30.5',
          tables: expect.arrayContaining([
            expect.objectContaining({ englishName: 'cust_info', chineseName: '客户信息表' }),
            expect.objectContaining({ englishName: 'acct_bal' }),
          ]),
        }),
        expect.objectContaining({ fingerprint: expect.stringContaining('mysql:10.20.30.5/retail_mart') }),
        undefined,
      ),
    )
    vi.unstubAllGlobals()
  })

  it('toggles field columns from the schema settings button', async () => {
    mocks.loadPersistedWorkspace.mockResolvedValue({ warehouse: { dataset, source: { kind: 'uploaded', fingerprint: 'manual-1' }, savedAt: '2026-08-18T00:00:00.000Z' } })
    const { default: App } = await import('./App')

    render(<App />)
    await expect(screen.findByTestId('dataset-ready')).resolves.toBeTruthy()
    fireEvent.click(screen.getByTestId('nav-tables'))
    fireEvent.click(screen.getByTestId('field-column-toggle'))
    expect(screen.getByTestId('field-column-menu')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('field-column-type'))
    expect(screen.queryByText('类型', { selector: '.field-table th' })).not.toBeInTheDocument()
    expect(screen.queryByText('varchar')).not.toBeInTheDocument()
    expect(screen.getByText('键', { selector: '.field-table th' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('field-column-type'))
    expect(screen.getByText('类型', { selector: '.field-table th' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('field-column-code'))
    expect(screen.queryByText('机构类型代码', { selector: '.field-table .code-link' })).not.toBeInTheDocument()
  })
})
