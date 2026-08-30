import type { DictionaryDataset, FieldRecord, ImportIssue, TableRecord } from './types'

const CREATE_TABLE_PATTERN = /create\s+(?:table|view)\s+(?:if\s+not\s+exists\s+)?[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s*\(/gi
const COMMENT_ON_TABLE_PATTERN = /comment\s+on\s+(?:table|view)\s+[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s+is\s+'((?:[^']|'')*)'/gi
const COMMENT_ON_COLUMN_PATTERN = /comment\s+on\s+column\s+[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\.[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s+is\s+'((?:[^']|'')*)'/gi
const TRAILING_TABLE_COMMENT_PATTERN = /comment\s*=\s*'((?:[^']|'')*)'/i
const DISTRIBUTE_PATTERN = /distribut\w*\s+by\s*(?:hash|roundrobin|replication)?\s*\(?\s*[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s*\)?/i
const PARTITION_PATTERN = /partition\s+by\s*(?:range|list|hash)?\s*\(?\s*[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s*\)?/i
const PRIMARY_KEY_PATTERN = /primary\s+key\s*\(([^)]+)\)/i
const COLUMN_TYPE_PATTERN = /^([a-zA-Z_][\w$]*)\s+([a-zA-Z_][\w]*(?:\s*\([^)]*\))?)/

function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of body) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function normalizeQuotes(value: string): string {
  return value.trim().replace(/^["'`[]|["'`\]]$/g, '').replace(/''/g, "'")
}

function columnComment(columnDefinition: string): string {
  const match = /comment\s+'((?:[^']|'')*)'/i.exec(columnDefinition)
  return match ? match[1].replace(/''/g, "'") : ''
}

function dataLengthOfType(type: string): string {
  const match = /\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(type)
  return match ? match[1] : ''
}

function parseColumns(body: string, tableName: string, tableChineseName: string, issues: ImportIssue[]): { fields: FieldRecord[]; primaryKeyNames: Set<string>; tableConstraintFound: boolean } {
  const fields: FieldRecord[] = []
  const primaryKeyNames = new Set<string>()
  let tableConstraintFound = false
  let ordinal = 0
  for (const part of splitTopLevel(body)) {
    const lower = part.toLowerCase()
    if (/^(primary\s+key|constraint|unique|foreign\s+key|check|key|index)\b/.test(lower)) {
      tableConstraintFound = true
      const keyMatch = PRIMARY_KEY_PATTERN.exec(part)
      if (keyMatch) for (const name of keyMatch[1].split(',')) primaryKeyNames.add(normalizeQuotes(name))
      continue
    }
    const columnMatch = COLUMN_TYPE_PATTERN.exec(part.replace(/^\s*(?:if\s+not\s+exists\s+)?/i, ''))
    if (!columnMatch) {
      if (part) issues.push({ severity: 'warning', message: `无法识别的列定义：${part.slice(0, 40)}`, sourceSheet: tableName, sourceRow: ordinal + 1 })
      continue
    }
    ordinal += 1
    const englishName = normalizeQuotes(columnMatch[1])
    const rawType = columnMatch[2].replace(/\s+/g, ' ').trim()
    const chineseName = columnComment(part) || englishName
    const inlinePrimaryKey = /primary\s+key/i.test(part)
    if (inlinePrimaryKey) primaryKeyNames.add(englishName)
    fields.push({
      id: `${tableName}:${ordinal}:${englishName}`,
      tableId: tableName,
      tableChineseName,
      tableEnglishName: tableName,
      ordinal,
      chineseName,
      englishName,
      fieldType: rawType.toLowerCase(),
      srFieldType: rawType.toLowerCase(),
      dataLength: dataLengthOfType(rawType),
      standardNo: '',
      publicCodeName: '',
      remark: columnComment(part),
      isPrimaryKey: false,
      isDistributionKey: false,
      isPartitionKey: false,
      sourceSheet: 'DDL',
      sourceRow: ordinal,
    })
  }
  return { fields, primaryKeyNames, tableConstraintFound }
}

export function parseDdl(sourceText: string, options: { sourceName?: string } = {}): DictionaryDataset {
  const issues: ImportIssue[] = []
  const tables: TableRecord[] = []
  const fields: FieldRecord[] = []
  const tableChineseNames = new Map<string, string>()
  const columnComments = new Map<string, string>()
  const importedAt = new Date().toISOString()
  const sourceName = options.sourceName?.trim() || 'DDL 导入'

  for (const match of sourceText.matchAll(COMMENT_ON_TABLE_PATTERN)) tableChineseNames.set(match[1].toLowerCase(), match[2].replace(/''/g, "'"))
  for (const match of sourceText.matchAll(COMMENT_ON_COLUMN_PATTERN)) columnComments.set(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`, match[3].replace(/''/g, "'"))

  CREATE_TABLE_PATTERN.lastIndex = 0
  let createMatch: RegExpExecArray | null
  while ((createMatch = CREATE_TABLE_PATTERN.exec(sourceText)) !== null) {
    const tableName = createMatch[1]
    let depth = 0
    let bodyEnd = -1
    for (let index = createMatch.index + createMatch[0].length; index < sourceText.length; index += 1) {
      const char = sourceText[index]
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth < 0) { bodyEnd = index; break }
      }
    }
    if (bodyEnd < 0) {
      issues.push({ severity: 'error', message: `CREATE TABLE ${tableName} 缺少右括号。`, sourceSheet: 'DDL' })
      continue
    }
    const body = sourceText.slice(createMatch.index + createMatch[0].length, bodyEnd)
    const tail = sourceText.slice(bodyEnd + 1, bodyEnd + 600)
    const chineseName = tableChineseNames.get(tableName.toLowerCase()) ?? ((TRAILING_TABLE_COMMENT_PATTERN.exec(tail)?.[1]?.replace(/''/g, "'") ?? '') || tableName)
    const { fields: tableFields, primaryKeyNames } = parseColumns(body, tableName, chineseName, issues)
    const distributeName = DISTRIBUTE_PATTERN.exec(tail)?.[1]?.toLowerCase()
    const partitionName = PARTITION_PATTERN.exec(tail)?.[1]?.toLowerCase()
    for (const field of tableFields) {
      const lowerName = field.englishName.toLowerCase()
      if (primaryKeyNames.has(lowerName)) field.isPrimaryKey = true
      if (distributeName && lowerName === distributeName) field.isDistributionKey = true
      if (partitionName && lowerName === partitionName) field.isPartitionKey = true
      const overrideComment = columnComments.get(`${tableName.toLowerCase()}.${lowerName}`)
      if (overrideComment) {
        field.chineseName = overrideComment
        if (!field.remark) field.remark = overrideComment
      }
      fields.push(field)
    }
    tables.push({
      id: tableName, chineseName, englishName: tableName, fieldCount: tableFields.length,
      topic: '', businessScope: chineseName === tableName ? '' : chineseName, owner: '',
      loadFrequency: '', loadStrategy: '', retention: '', collection: '', usage: '',
      sourceSheet: 'DDL', sourceRow: tables.length + 1,
    })
    CREATE_TABLE_PATTERN.lastIndex = bodyEnd + 1
  }

  if (tables.length === 0) issues.push({ severity: 'error', message: '未找到 CREATE TABLE 语句，请检查 DDL 内容。', sourceSheet: 'DDL' })

  return {
    adapterName: 'ddl-parser',
    importedAt,
    sourceFile: sourceName,
    tables, fields, standards: [], codeItems: [], revisions: [], unknownSheets: [], issues,
    stats: { sheetCount: 1, tableCount: tables.length, fieldCount: fields.length, standardCount: 0, codeItemCount: 0, revisionCount: 0, issueCount: issues.length },
  }
}
