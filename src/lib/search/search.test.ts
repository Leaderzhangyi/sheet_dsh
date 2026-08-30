import { describe, expect, it } from 'vitest'
import { buildSearchIndex, searchDataset } from './search'
import type { DictionaryDataset } from '../import/types'

const dataset = {
  adapterName: 'test',
  importedAt: '2026-08-18T00:00:00.000Z',
  sourceFile: 'fixture.xlsx',
  tables: [
    { id: 't1', chineseName: '机构信息表', englishName: 'a_pub_org_info_tab', fieldCount: 2, topic: 'org', businessScope: '机构基本信息', owner: '数据管理员', loadFrequency: '日', loadStrategy: '全量', retention: '近一年', collection: '机构', usage: '', sourceSheet: '目录', sourceRow: 2 },
  ],
  fields: [
    { id: 'f1', tableId: 't1', tableChineseName: '机构信息表', tableEnglishName: 'a_pub_org_info_tab', ordinal: 1, chineseName: '数据日期', englishName: 'data_dt', fieldType: 'date', srFieldType: 'date', dataLength: '', standardNo: 'SCBTS0004749', publicCodeName: '', remark: '', isPrimaryKey: true, isDistributionKey: false, isPartitionKey: false, sourceSheet: '数据字典', sourceRow: 2 },
    { id: 'f2', tableId: 't1', tableChineseName: '机构信息表', tableEnglishName: 'a_pub_org_info_tab', ordinal: 2, chineseName: '法人代码', englishName: 'lgpsncd', fieldType: 'varchar(4)', srFieldType: 'varchar(4)', dataLength: '', standardNo: 'SCBTS0000046', publicCodeName: '法人代码', remark: '', isPrimaryKey: true, isDistributionKey: false, isPartitionKey: false, sourceSheet: '数据字典', sourceRow: 3 },
  ],
  standards: [{ id: 's1', standardNo: 'SCBTS0000046', chineseName: '法人代码', englishName: 'Legal Person Code', topic: '机构', dataType: '变长字符串', dataLength: '4', precision: '', sourceSheet: '数据标准V2.0', sourceRow: 2 }],
  codeItems: [{ id: 'c1', codeSetName: '法人代码', codeSetEnglishName: 'lgpsncd', value: '0001', valueDescription: '总行', standardNo: 'CDCS0001', standardName: '法人代码', sourceSheet: '公共代码', sourceRow: 2 }],
  revisions: [],
  unknownSheets: [],
  issues: [],
  stats: { sheetCount: 3, tableCount: 1, fieldCount: 2, standardCount: 1, codeItemCount: 1, revisionCount: 0, issueCount: 0 },
} satisfies DictionaryDataset

describe('dataset search', () => {
  it('builds a reusable normalized index for a dataset', () => {
    const index = buildSearchIndex(dataset)

    expect(index.entries.length).toBe(5)
    expect(index.entries[0].searchText).toContain('机构信息表')
    expect(searchDataset(dataset, '法人代码', { index }).results.map((result) => result.recordId)).toContain('f2')
  })

  it('searches across Chinese, English and standard identifiers', () => {
    expect(searchDataset(dataset, '法人代码').results.map((result) => result.recordId)).toContain('f2')
    expect(searchDataset(dataset, 'a_pub_org_info_tab').results[0].type).toBe('table')
    expect(searchDataset(dataset, 'SCBTS0000046').results.map((result) => result.type)).toEqual(expect.arrayContaining(['field', 'standard']))
  })

  it('groups results by object type and returns empty state for blank queries', () => {
    const empty = searchDataset(dataset, '   ')
    expect(empty.results).toHaveLength(0)
    expect(empty.groups).toEqual([])
    expect(searchDataset(dataset, '机构').groups).toEqual(expect.arrayContaining(['table', 'field']))
  })

  it('supports type filters and ranked prefix matches', () => {
    const fields = searchDataset(dataset, 'data', { types: ['field'] })
    expect(fields.results.every((result) => result.type === 'field')).toBe(true)
    expect(fields.results[0].matchedOn).toContain('英文名')
  })
})
