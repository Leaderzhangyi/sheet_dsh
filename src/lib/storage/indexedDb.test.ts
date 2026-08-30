import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearPersistedDataset, deleteWorkspaceDataset, loadPersistedDataset, loadPersistedWorkspace, savePersistedDataset, saveWorkspaceDataset } from './indexedDb'
import type { DictionaryDataset } from '../import/types'

const dataset: DictionaryDataset = {
  adapterName: 'test-adapter',
  importedAt: '2026-08-18T00:00:00.000Z',
  sourceFile: 'dp_ial.xlsx',
  tables: [{ id: 't1', chineseName: '机构信息表', englishName: 'a_pub_org_info_tab', fieldCount: 1, topic: 'org', businessScope: '', owner: '', loadFrequency: '日', loadStrategy: '全量', retention: '', collection: '', usage: '', sourceSheet: '目录', sourceRow: 2 }],
  fields: [{ id: 'f1', tableId: 't1', tableChineseName: '机构信息表', tableEnglishName: 'a_pub_org_info_tab', ordinal: 1, chineseName: '数据日期', englishName: 'data_dt', fieldType: 'date', srFieldType: 'date', dataLength: '', standardNo: '', publicCodeName: '', remark: '', isPrimaryKey: true, isDistributionKey: false, isPartitionKey: false, sourceSheet: '数据字典', sourceRow: 2 }],
  standards: [], codeItems: [], revisions: [], unknownSheets: [], issues: [],
  stats: { sheetCount: 2, tableCount: 1, fieldCount: 1, standardCount: 0, codeItemCount: 0, revisionCount: 0, issueCount: 0 },
}

describe('IndexedDB dataset cache', () => {
  beforeEach(async () => {
    await clearPersistedDataset()
  })

  it('stores and restores the complete normalized dataset with its source metadata', async () => {
    await savePersistedDataset(dataset, { kind: 'bundled', fingerprint: 'dp-ial-20260416' })

    const cached = await loadPersistedDataset()

    expect(cached?.dataset).toEqual(dataset)
    expect(cached?.source).toEqual({ kind: 'bundled', fingerprint: 'dp-ial-20260416' })
  })

  it('returns no dataset after the cache is cleared', async () => {
    await savePersistedDataset(dataset, { kind: 'uploaded', fingerprint: 'manual-001' })
    await clearPersistedDataset()

    await expect(loadPersistedDataset()).resolves.toBeNull()
  })

  it('keeps warehouse and retail datasets side by side in one local workspace', async () => {
    const retailDataset = { ...dataset, sourceFile: 'rcvp.xlsx', adapterName: 'rcvp-retail-mart-adapter' }
    await saveWorkspaceDataset('warehouse', dataset, { kind: 'bundled', fingerprint: 'dp-ial-v1' })
    await saveWorkspaceDataset('retail', retailDataset, { kind: 'uploaded', fingerprint: 'rcvp-v1' })

    const workspace = await loadPersistedWorkspace()

    expect(workspace.warehouse?.dataset.sourceFile).toBe('dp_ial.xlsx')
    expect(workspace.retail?.dataset.sourceFile).toBe('rcvp.xlsx')
    expect(workspace.warehouse?.source.fingerprint).toBe('dp-ial-v1')
    expect(workspace.retail?.source.fingerprint).toBe('rcvp-v1')
  })

  it('removes a workspace dataset completely without resurrecting it on reload', async () => {
    const retailDataset = { ...dataset, sourceFile: 'rcvp.xlsx', adapterName: 'rcvp-retail-mart-adapter' }
    await saveWorkspaceDataset('warehouse', dataset, { kind: 'uploaded', fingerprint: 'dp-ial-v1' })
    await saveWorkspaceDataset('retail', retailDataset, { kind: 'uploaded', fingerprint: 'rcvp-v1' })

    await deleteWorkspaceDataset('warehouse')

    const workspace = await loadPersistedWorkspace()
    expect(workspace.warehouse).toBeUndefined()
    expect(workspace.retail?.dataset.sourceFile).toBe('rcvp.xlsx')

    await deleteWorkspaceDataset('retail')
    await expect(loadPersistedWorkspace()).resolves.toEqual({})
  })

  it('persists large collections as multiple chunk records', async () => {
    const largeDataset = {
      ...dataset,
      fields: Array.from({ length: 1200 }, (_, index) => ({ ...dataset.fields[0], id: `f${index}` })),
    }
    await saveWorkspaceDataset('warehouse', largeDataset, { kind: 'uploaded', fingerprint: 'large-v1' })

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('data-dictionary-query-desk')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = database.transaction('datasets', 'readonly').objectStore('datasets').getAllKeys()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()

    expect(keys.some((key) => String(key).includes(':fields:'))).toBe(true)
    await expect(loadPersistedWorkspace()).resolves.toEqual(expect.objectContaining({ warehouse: expect.objectContaining({ dataset: largeDataset }) }))
  })

  it('restores an existing single-dataset cache into the appropriate workspace slot', async () => {
    const retailDataset = { ...dataset, sourceFile: 'rcvp.xlsx', adapterName: 'rcvp-retail-mart-adapter' }
    await savePersistedDataset(retailDataset, { kind: 'uploaded', fingerprint: 'legacy-rcvp' })

    const workspace = await loadPersistedWorkspace()

    expect(workspace.warehouse).toBeUndefined()
    expect(workspace.retail?.dataset.sourceFile).toBe('rcvp.xlsx')
  })
})
