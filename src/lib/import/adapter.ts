import type {
  CodeItemRecord,
  DictionaryDataset,
  FieldRecord,
  ImportIssue,
  RevisionRecord,
  StandardRecord,
  TableRecord,
  UnknownSheet,
} from './types'

export interface RawSheet {
  name: string
  rows: unknown[][]
}

type ColumnKey =
  | 'tableChineseName'
  | 'tableEnglishName'
  | 'tableOrdinal'
  | 'fieldOrdinal'
  | 'fieldChineseName'
  | 'fieldEnglishName'
  | 'fieldType'
  | 'srFieldType'
  | 'primaryKey'
  | 'distributionKey'
  | 'partitionKey'
  | 'dataLength'
  | 'standardNo'
  | 'publicCodeName'
  | 'remark'
  | 'topic'
  | 'businessScope'
  | 'owner'
  | 'loadFrequency'
  | 'loadStrategy'
  | 'retention'
  | 'collection'
  | 'usage'
  | 'standardChineseName'
  | 'standardEnglishName'
  | 'dataType'
  | 'precision'
  | 'codeSetName'
  | 'codeSetEnglishName'
  | 'codeValue'
  | 'codeDescription'
  | 'codeStandardNo'
  | 'codeStandardName'
  | 'modifiedAt'
  | 'before'
  | 'after'
  | 'fieldBefore'
  | 'fieldAfter'
  | 'reason'
  | 'operation'
  | 'operator'
  | 'sourceSystem'
  | 'sourceTableChineseName'
  | 'sourceTableEnglishName'
  | 'sourceFieldChineseName'
  | 'sourceFieldEnglishName'
  | 'mappingRule'
  | 'sourceRemark'

const aliases: Record<ColumnKey, string[]> = {
  tableChineseName: ['模型中文名称', '目标表中文名称', '表中文名', 'table_cn', 'table_name_cn'],
  tableEnglishName: ['模型英文名称', '目标表英文名称', '表英文名称', '表英文名', 'table_en', 'table_name_en'],
  tableOrdinal: ['序号', 'table_no'],
  fieldOrdinal: ['目标字段序号', '字段序号', 'field_no', 'ordinal', 'field_ordinal'],
  fieldChineseName: ['目标字段中文名称', '字段中文名', 'field_cn', 'field_name_cn'],
  fieldEnglishName: ['目标字段英文名称', '字段英文名', 'field_en', 'field_name_en'],
  fieldType: ['高斯_目标字段数据类型', '目标字段数据类型', '字段类型', 'type', 'field_type'],
  srFieldType: ['SR_目标字段数据类型', 'sr_type', 'field_type_sr'],
  primaryKey: ['主键', 'primary_key', 'is_primary_key'],
  distributionKey: ['分布键', 'distribution_key', 'is_distribution_key'],
  partitionKey: ['分区键', 'partition_key', 'is_partition_key'],
  dataLength: ['数据标准长度', '字符型长度', '数据长度', 'data_length', 'length'],
  standardNo: ['映射标准编号(V2.0版)', '引用标准编号(中文匹配）', '标准编号', 'standard_no', 'standard_id'],
  publicCodeName: ['引用的公共代码', '公共代码', 'public_code', 'code_name'],
  remark: ['备注', '说明', 'remark', 'note'],
  topic: ['一级主题', '主题', 'topic'],
  businessScope: ['业务含义及范围说明', '业务范围', 'business_scope'],
  owner: ['责任人', 'owner'],
  loadFrequency: ['加载频度', '加载频率', 'load_frequency'],
  loadStrategy: ['加载策略', 'load_strategy'],
  retention: ['保留时效', 'retention'],
  collection: ['归集信息', '归集', 'collection'],
  usage: ['使用方式', 'usage'],
  standardChineseName: ['信息项中文名称', '标准中文名', 'standard_cn', 'standard_name_cn'],
  standardEnglishName: ['英文简称', '标准英文名', 'standard_en', 'standard_name_en'],
  dataType: ['数据类型', 'standard_type', 'data_type'],
  precision: ['数据精度', '精度', 'precision'],
  codeSetName: ['代码中文名称', '代码集中文名', 'code_set_cn', 'code_name_cn'],
  codeSetEnglishName: ['代码英文名称', '代码集英文名', 'code_set_en', 'code_name_en'],
  codeValue: ['代码值', 'code_value', 'value'],
  codeDescription: ['代码值说明', '代码值描述', '代码描述', 'code_description', 'value_description'],
  codeStandardNo: ['引用标准代码编号', '引用标准编号', 'code_standard_no'],
  codeStandardName: ['引用标准代码名称', '引用标准名称', 'code_standard_name'],
  modifiedAt: ['日期', '修改时间', '修改日期', 'modified_at', 'change_time'],
  before: ['修改前(中文名，英文名，字段类型）', '修改前', 'before'],
  after: ['修改后(中文名，英文名，字段类型）', '修改后', 'after'],
  fieldBefore: ['字段名称前', '字段修改前', 'field_before'],
  fieldAfter: ['字段名称后', '字段修改后', 'field_after'],
  reason: ['修订记录', '修改原因', '原因', 'reason'],
  operation: ['修订方式', '操作类型', '操作', 'operation'],
  operator: ['修订人', '操作人', 'operator'],
  sourceSystem: ['来源系统名称', 'source_system'],
  sourceTableChineseName: ['来源表中文名称', 'source_table_cn'],
  sourceTableEnglishName: ['来源表英文名称', 'source_table_en'],
  sourceFieldChineseName: ['来源字段中文名称', 'source_field_cn'],
  sourceFieldEnglishName: ['来源字段英文名称', 'source_field_en'],
  mappingRule: ['映射规则', '加工规则', 'mapping_rule', 'transform_rule'],
  sourceRemark: ['来源备注', 'source_remark'],
}

const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_\-()（）]/g, '')
const clean = (value: unknown) => String(value ?? '').trim()
const normalizeType = (value: unknown) => clean(value).toLowerCase()
const toFlag = (value: unknown) => ['y', 'yes', 'true', '是', '1'].includes(clean(value).toLowerCase())
const toOrdinal = (value: unknown) => Number.parseInt(clean(value), 10) || 0

const indexHeaders = (headers: unknown[]) => {
  const normalized = headers.map(normalizeHeader)
  const result = new Map<ColumnKey, number>()
  for (const [key, candidates] of Object.entries(aliases) as [ColumnKey, string[]][]) {
    const index = candidates.findIndex((candidate) => normalized.includes(normalizeHeader(candidate)))
    if (index >= 0) result.set(key, normalized.indexOf(normalizeHeader(candidates[index])))
  }
  return result
}

const findHeaderRow = (rows: unknown[][]) => {
  let best = { index: 0, score: 0 }
  rows.slice(0, 6).forEach((row, index) => {
    const headers = indexHeaders(row)
    if (headers.size > best.score) best = { index, score: headers.size }
  })
  return best
}

const valueAt = (row: unknown[], indexes: Map<ColumnKey, number>, key: ColumnKey) => {
  const index = indexes.get(key)
  return index === undefined ? '' : row[index]
}

const issue = (issues: ImportIssue[], sheet: RawSheet, message: string, column?: string) => {
  issues.push({ severity: 'error', message, sourceSheet: sheet.name, column })
}

const has = (indexes: Map<ColumnKey, number>, ...keys: ColumnKey[]) => keys.every((key) => indexes.has(key))

const classify = (indexes: Map<ColumnKey, number>): 'table' | 'field' | 'standard' | 'code' | 'revision' | 'unknown' => {
  if (has(indexes, 'fieldChineseName', 'tableChineseName')) return 'field'
  if (has(indexes, 'tableChineseName', 'tableEnglishName') && indexes.has('businessScope')) return 'table'
  if (has(indexes, 'standardChineseName', 'standardNo')) return 'standard'
  if (has(indexes, 'codeSetName', 'codeValue', 'codeDescription')) return 'code'
  if (has(indexes, 'modifiedAt', 'reason')) return 'revision'
  if (has(indexes, 'modifiedAt', 'tableChineseName')) return 'revision'
  if (has(indexes, 'tableChineseName', 'tableEnglishName')) return 'table'
  return 'unknown'
}

const tableId = (chineseName: string, englishName: string) => englishName || chineseName

export function importWorkbook(sheets: RawSheet[], options: { sourceFile?: string } = {}): DictionaryDataset {
  const importedAt = new Date().toISOString()
  const tables: TableRecord[] = []
  const fields: FieldRecord[] = []
  const standards: StandardRecord[] = []
  const codeItems: CodeItemRecord[] = []
  const revisions: RevisionRecord[] = []
  const unknownSheets: UnknownSheet[] = []
  const issues: ImportIssue[] = []
  let usedGeneric = false
  const usesRcvpLayout = sheets.some((sheet) => sheet.name === '模型实体清单')

  for (const sheet of sheets) {
    const { index: headerRowIndex } = findHeaderRow(sheet.rows)
    const header = sheet.rows[headerRowIndex] ?? []
    const indexes = indexHeaders(header)
    if (sheet.name.includes('附件')) {
      unknownSheets.push({ name: sheet.name, headers: header.map(clean), rowCount: Math.max(sheet.rows.length - headerRowIndex - 1, 0), rows: sheet.rows.slice(headerRowIndex + 1) })
      continue
    }
    const kind = classify(indexes)
    if (kind === 'unknown') {
      unknownSheets.push({ name: sheet.name, headers: header.map(clean), rowCount: Math.max(sheet.rows.length - headerRowIndex - 1, 0), rows: sheet.rows.slice(headerRowIndex + 1) })
      continue
    }
    if (!sheet.name.includes('目录') && !sheet.name.includes('字典') && !['目录', '数据字典', '数据标准V2.0', '公共代码', '历史修订记录'].includes(sheet.name)) usedGeneric = true

    const rows = sheet.rows.slice(headerRowIndex + 1)
    rows.forEach((row, offset) => {
      const sourceRow = headerRowIndex + offset + 2
      if (row.every((cell) => clean(cell) === '')) return
      if (kind === 'table') {
        if (!has(indexes, 'tableChineseName', 'tableEnglishName')) {
          issue(issues, sheet, '表目录缺少表中文名或表英文名', 'table')
          return
        }
        const chineseName = clean(valueAt(row, indexes, 'tableChineseName'))
        const englishName = clean(valueAt(row, indexes, 'tableEnglishName'))
        tables.push({
          id: tableId(chineseName, englishName), chineseName, englishName, fieldCount: 0,
          topic: clean(valueAt(row, indexes, 'topic')), businessScope: clean(valueAt(row, indexes, 'businessScope')),
          owner: clean(valueAt(row, indexes, 'owner')), loadFrequency: clean(valueAt(row, indexes, 'loadFrequency')),
          loadStrategy: clean(valueAt(row, indexes, 'loadStrategy')), retention: clean(valueAt(row, indexes, 'retention')),
          collection: clean(valueAt(row, indexes, 'collection')), usage: clean(valueAt(row, indexes, 'usage')),
          sourceSheet: sheet.name, sourceRow,
        })
      }
      if (kind === 'field') {
        const required: [ColumnKey, string][] = [
          ['tableChineseName', '目标表中文名称'], ['tableEnglishName', '目标表英文名称'], ['fieldOrdinal', '目标字段序号'],
          ['fieldChineseName', '目标字段中文名称'], ['fieldEnglishName', '目标字段英文名称'],
        ]
        const missing = required.find(([key]) => !indexes.has(key))
        if (missing) {
          issue(issues, sheet, `字段定义缺少必需列：${missing[1]}`, missing[1])
          return
        }
        const tableChineseName = clean(valueAt(row, indexes, 'tableChineseName'))
        const tableEnglishName = clean(valueAt(row, indexes, 'tableEnglishName'))
        const lineage = {
          sourceSystem: clean(valueAt(row, indexes, 'sourceSystem')),
          sourceTableChineseName: clean(valueAt(row, indexes, 'sourceTableChineseName')),
          sourceTableEnglishName: clean(valueAt(row, indexes, 'sourceTableEnglishName')),
          sourceFieldChineseName: clean(valueAt(row, indexes, 'sourceFieldChineseName')),
          sourceFieldEnglishName: clean(valueAt(row, indexes, 'sourceFieldEnglishName')),
          mappingRule: clean(valueAt(row, indexes, 'mappingRule')),
          sourceRemark: clean(valueAt(row, indexes, 'sourceRemark')),
        }
        const hasLineage = Object.values(lineage).some(Boolean)
        fields.push({
          id: `${tableId(tableChineseName, tableEnglishName)}:${toOrdinal(valueAt(row, indexes, 'fieldOrdinal'))}:${clean(valueAt(row, indexes, 'fieldEnglishName'))}`,
          tableId: tableId(tableChineseName, tableEnglishName), tableChineseName, tableEnglishName,
          ordinal: toOrdinal(valueAt(row, indexes, 'fieldOrdinal')), chineseName: clean(valueAt(row, indexes, 'fieldChineseName')),
          englishName: clean(valueAt(row, indexes, 'fieldEnglishName')), fieldType: normalizeType(valueAt(row, indexes, 'fieldType')),
          srFieldType: normalizeType(valueAt(row, indexes, 'srFieldType')), dataLength: clean(valueAt(row, indexes, 'dataLength')),
          standardNo: clean(valueAt(row, indexes, 'standardNo')), publicCodeName: clean(valueAt(row, indexes, 'publicCodeName')),
          remark: clean(valueAt(row, indexes, 'remark')), isPrimaryKey: toFlag(valueAt(row, indexes, 'primaryKey')),
          isDistributionKey: toFlag(valueAt(row, indexes, 'distributionKey')), isPartitionKey: toFlag(valueAt(row, indexes, 'partitionKey')),
          ...(hasLineage ? { lineage } : {}),
          sourceSheet: sheet.name, sourceRow,
        })
      }
      if (kind === 'standard') {
        const standardNo = clean(valueAt(row, indexes, 'standardNo'))
        if (!standardNo) return
        standards.push({
          id: standardNo, standardNo, chineseName: clean(valueAt(row, indexes, 'standardChineseName')),
          englishName: clean(valueAt(row, indexes, 'standardEnglishName')), topic: clean(valueAt(row, indexes, 'topic')),
          dataType: clean(valueAt(row, indexes, 'dataType')), dataLength: clean(valueAt(row, indexes, 'dataLength')),
          precision: clean(valueAt(row, indexes, 'precision')), sourceSheet: sheet.name, sourceRow,
        })
      }
      if (kind === 'code') {
        codeItems.push({
          id: `${clean(valueAt(row, indexes, 'codeSetName'))}:${clean(valueAt(row, indexes, 'codeValue'))}:${sourceRow}`,
          codeSetName: clean(valueAt(row, indexes, 'codeSetName')), codeSetEnglishName: clean(valueAt(row, indexes, 'codeSetEnglishName')),
          value: clean(valueAt(row, indexes, 'codeValue')), valueDescription: clean(valueAt(row, indexes, 'codeDescription')),
          standardNo: clean(valueAt(row, indexes, 'codeStandardNo')), standardName: clean(valueAt(row, indexes, 'codeStandardName')),
          sourceSheet: sheet.name, sourceRow,
        })
      }
      if (kind === 'revision') {
        revisions.push({
          id: `${sheet.name}:${sourceRow}`, modifiedAt: clean(valueAt(row, indexes, 'modifiedAt')),
          tableName: clean(valueAt(row, indexes, 'tableChineseName')), before: clean(valueAt(row, indexes, 'before')),
          after: clean(valueAt(row, indexes, 'after')), fieldBefore: clean(valueAt(row, indexes, 'fieldBefore')),
          fieldAfter: clean(valueAt(row, indexes, 'fieldAfter')), reason: clean(valueAt(row, indexes, 'reason')),
          operation: clean(valueAt(row, indexes, 'operation')), operator: clean(valueAt(row, indexes, 'operator')),
          sourceSheet: sheet.name, sourceRow,
        })
      }
    })
  }

  const uniqueTables = new Map<string, TableRecord>()
  tables.forEach((table) => uniqueTables.set(table.id, table))
  for (const field of fields) {
    const table = uniqueTables.get(field.tableId)
    if (table) table.fieldCount += 1
    else uniqueTables.set(field.tableId, {
      id: field.tableId, chineseName: field.tableChineseName, englishName: field.tableEnglishName, fieldCount: 1,
      topic: '', businessScope: '', owner: '', loadFrequency: '', loadStrategy: '', retention: '', collection: '', usage: '',
      sourceSheet: field.sourceSheet, sourceRow: field.sourceRow,
    })
  }

  return {
    adapterName: usesRcvpLayout ? 'rcvp-retail-mart-adapter' : usedGeneric ? 'generic-schema-adapter' : 'dp-ial-adapter', importedAt,
    sourceFile: options.sourceFile ?? 'local-workbook.xlsx', tables: [...uniqueTables.values()], fields,
    standards, codeItems, revisions, unknownSheets, issues,
    stats: { sheetCount: sheets.length, tableCount: uniqueTables.size, fieldCount: fields.length, standardCount: standards.length, codeItemCount: codeItems.length, revisionCount: revisions.length, issueCount: issues.length },
  }
}
