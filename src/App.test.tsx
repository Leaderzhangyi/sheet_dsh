import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(document.querySelector('.codes-animated-list .scroll-list')).not.toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: /完整机构信息表/ }))
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
})
