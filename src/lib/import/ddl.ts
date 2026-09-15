import type { DictionaryDataset, FieldRecord, ImportIssue, TableRecord } from './types'

// 解析策略：先用"字符串字面量感知"的扫描器定位 CREATE 语句与列定义，
// 再用白名单关键字区分列与表级约束。括号/逗号/注释符出现在字符串里时不会误判。

const CREATE_HEAD_PATTERN = /\bcreate\s+(?:(?:or\s+replace|global|local|temporary|temp|external|unique)\s+)*(?:table|view)\b/gi
const COMMENT_ON_TABLE_PATTERN = /\bcomment\s+on\s+(?:table|view)\s+((?:["`\[]?[\w$\u4e00-\u9fa5]+["`\]]?)(?:\s*\.\s*(?:["`\[]?[\w$\u4e00-\u9fa5]+["`\]]?))*)\s+is\s+'((?:[^']|'')*)'/gi
const COMMENT_ON_COLUMN_PATTERN = /\bcomment\s+on\s+column\s+((?:["`\[]?[\w$\u4e00-\u9fa5]+["`\]]?)(?:\s*\.\s*(?:["`\[]?[\w$\u4e00-\u9fa5]+["`\]]?))*)\s+is\s+'((?:[^']|'')*)'/gi
const TRAILING_TABLE_COMMENT_PATTERN = /comment\s*=\s*'((?:[^']|'')*)'/i
const DISTRIBUTE_PATTERN = /distribut\w*\s+by\s*(?:hash|roundrobin|replication)?\s*\(?\s*[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s*\)?/i
const PARTITION_PATTERN = /partition\s+by\s*(?:range|list|hash)?\s*\(?\s*[`"[]?([a-zA-Z_][\w$]*)[`"\]]?\s*\)?/i
const PRIMARY_KEY_PATTERN = /primary\s+key\s*\(([^)]+)\)/i
const CONSTRAINT_GUARD = /^(primary\s+key|constraint|unique|foreign\s+key|check|key|index|exclude|like|period\s+for)\b/i
const TYPE_HEAD_PATTERN = /^([a-zA-Z_][\w$]*)/
const TYPE_PAREN_PATTERN = /^\s*\(([^)]*)\)/
const TYPE_SUFFIX_PATTERN = /^\s+(precision|varying|with|time|zone|unsigned|signed|zerofill)\b/i
const QUALIFIED_PART_PATTERN = /["`\[]?([\w$\u4e00-\u9fa5]+)["`\]]?/g

/** 去掉 -- 与块注释，但保留字符串字面量里的内容。 */
function stripSqlComments(text: string): string {
  let result = ''
  let inString = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      result += char
      if (char === "'") {
        if (text[i + 1] === "'") {
          result += "'"
          i += 1
        } else inString = false
      }
      continue
    }
    if (char === "'") {
      inString = true
      result += char
      continue
    }
    if (char === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i += 1
      result += '\n'
      continue
    }
    if (char === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') result += '\n'
        i += 1
      }
      i += 1
      continue
    }
    result += char
  }
  return result
}

/** 找到与 openIndex 的 '(' 匹配的 ')'，忽略字符串字面量内的括号。 */
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  let inString = false
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (char === "'") {
        if (text[i + 1] === "'") i += 1
        else inString = false
      }
      continue
    }
    if (char === "'") {
      inString = true
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 按顶层逗号切分列定义，字符串里的逗号不会切断。 */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let current = ''
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]
    if (inString) {
      current += char
      if (char === "'") {
        if (body[i + 1] === "'") {
          current += "'"
          i += 1
        } else inString = false
      }
      continue
    }
    if (char === "'") {
      inString = true
      current += char
      continue
    }
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function readIdentifier(text: string, start: number): { name: string; end: number } | null {
  let i = start
  while (i < text.length && /\s/.test(text[i])) i += 1
  if (i >= text.length) return null
  const char = text[i]
  if (char === '"' || char === '`' || char === '[') {
    const close = char === '[' ? ']' : char
    const end = text.indexOf(close, i + 1)
    if (end < 0) return null
    return { name: text.slice(i + 1, end).trim(), end: end + 1 }
  }
  if (!/[a-zA-Z_$\u4e00-\u9fa5]/.test(char)) return null
  let j = i
  while (j < text.length && /[\w$\u4e00-\u9fa5]/.test(text[j])) j += 1
  return { name: text.slice(i, j), end: j }
}

/** 读取 a.b.c 形式的限定名（每段可带引号），用于 schema.table / schema.table.column。 */
function readQualifiedName(text: string, start: number): { parts: string[]; end: number } | null {
  const parts: string[] = []
  let pos = start
  for (;;) {
    const identifier = readIdentifier(text, pos)
    if (!identifier) return parts.length ? { parts, end: pos } : null
    parts.push(identifier.name)
    pos = identifier.end
    let dot = pos
    while (dot < text.length && /\s/.test(text[dot])) dot += 1
    if (text[dot] === '.') {
      pos = dot + 1
      continue
    }
    return { parts, end: pos }
  }
}

function qualifiedParts(qualified: string): string[] {
  return [...qualified.matchAll(QUALIFIED_PART_PATTERN)].map((match) => match[1])
}

function unquote(value: string): string {
  return value.trim().replace(/^["'`[]|["'`\]]$/g, '').replace(/''/g, "'")
}

function columnComment(columnDefinition: string): string {
  const match = columnDefinition.match(/comment\s+'((?:[^']|'')*)'/i)
  return match ? match[1].replace(/''/g, "'") : ''
}

function dataLengthOfType(type: string): string {
  const match = type.match(/\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/)
  return match ? match[1] : ''
}

function readColumnType(definition: string, nameEnd: number): string | null {
  const rest = definition.slice(nameEnd).replace(/^\s+/, '')
  const head = rest.match(TYPE_HEAD_PATTERN)
  if (!head) return null
  let type = head[1]
  let consumed = head[0].length
  const paren = rest.slice(consumed).match(TYPE_PAREN_PATTERN)
  if (paren) {
    type += `(${paren[1].replace(/\s+/g, '')})`
    consumed += paren[0].length
  }
  let remainder = rest.slice(consumed)
  let suffix = remainder.match(TYPE_SUFFIX_PATTERN)
  while (suffix) {
    type += suffix[0]
    remainder = remainder.slice(suffix[0].length)
    suffix = remainder.match(TYPE_SUFFIX_PATTERN)
  }
  return type
}

function sliceStatementTail(text: string, start: number): string {
  const semi = text.indexOf(';', start)
  if (semi >= 0 && semi - start < 2000) return text.slice(start, semi)
  return text.slice(start, start + 800)
}

function parseColumns(body: string, tableName: string, tableChineseName: string, issues: ImportIssue[]): { fields: FieldRecord[]; primaryKeyNames: Set<string> } {
  const fields: FieldRecord[] = []
  const primaryKeyNames = new Set<string>()
  let ordinal = 0
  for (const part of splitTopLevel(body)) {
    if (!part) continue
    if (CONSTRAINT_GUARD.test(part)) {
      const keyMatch = part.match(PRIMARY_KEY_PATTERN)
      if (keyMatch) for (const name of keyMatch[1].split(',')) primaryKeyNames.add(unquote(name).toLowerCase())
      continue
    }
    const head = readIdentifier(part, 0)
    if (!head) {
      issues.push({ severity: 'warning', message: `无法识别的列定义：${part.slice(0, 40)}`, sourceSheet: tableName, sourceRow: ordinal + 1 })
      continue
    }
    const rawType = readColumnType(part, head.end)
    if (rawType === null) {
      issues.push({ severity: 'warning', message: `无法识别列 ${head.name} 的数据类型：${part.slice(0, 40)}`, sourceSheet: tableName, sourceRow: ordinal + 1 })
      continue
    }
    ordinal += 1
    const englishName = head.name
    const normalizedType = rawType.replace(/\s+/g, ' ').trim()
    const comment = columnComment(part)
    if (/primary\s+key/i.test(part)) primaryKeyNames.add(englishName.toLowerCase())
    fields.push({
      id: `${tableName}:${ordinal}:${englishName}`,
      tableId: tableName,
      tableChineseName,
      tableEnglishName: tableName,
      ordinal,
      chineseName: comment || englishName,
      englishName,
      fieldType: normalizedType.toLowerCase(),
      srFieldType: normalizedType.toLowerCase(),
      dataLength: dataLengthOfType(normalizedType),
      standardNo: '',
      publicCodeName: '',
      remark: comment,
      isPrimaryKey: false,
      isDistributionKey: false,
      isPartitionKey: false,
      sourceSheet: 'DDL',
      sourceRow: ordinal,
    })
  }
  return { fields, primaryKeyNames }
}

export function parseDdl(sourceText: string, options: { sourceName?: string } = {}): DictionaryDataset {
  const issues: ImportIssue[] = []
  const tables: TableRecord[] = []
  const fields: FieldRecord[] = []
  const tableChineseNames = new Map<string, string>()
  const columnComments = new Map<string, string>()
  const sourceName = options.sourceName?.trim() || 'DDL 导入'

  // COMMENT ON 语句可能出现在 CREATE 之前或之后，先整体收集一遍。
  const cleaned = stripSqlComments(sourceText)
  for (const match of cleaned.matchAll(COMMENT_ON_TABLE_PATTERN)) {
    const parts = qualifiedParts(match[1])
    if (parts.length) tableChineseNames.set(parts[parts.length - 1].toLowerCase(), match[2].replace(/''/g, "'"))
  }
  for (const match of cleaned.matchAll(COMMENT_ON_COLUMN_PATTERN)) {
    const parts = qualifiedParts(match[1])
    if (parts.length >= 2) {
      const tableName = parts[parts.length - 2].toLowerCase()
      columnComments.set(`${tableName}.${parts[parts.length - 1].toLowerCase()}`, match[2].replace(/''/g, "'"))
    }
  }

  let searchFrom = 0
  for (const headMatch of cleaned.matchAll(CREATE_HEAD_PATTERN)) {
    if (headMatch.index < searchFrom) continue
    const qualified = readQualifiedName(cleaned, headMatch.index + headMatch[0].length)
    if (!qualified || qualified.parts.length === 0) {
      issues.push({ severity: 'warning', message: 'CREATE 语句后未找到表名，已跳过。', sourceSheet: 'DDL' })
      continue
    }
    const tableName = qualified.parts[qualified.parts.length - 1]
    let pos = qualified.end
    while (pos < cleaned.length && /\s/.test(cleaned[pos])) pos += 1
    if (cleaned[pos] !== '(') {
      issues.push({ severity: 'warning', message: `跳过 ${tableName}：缺少列定义括号（不支持 CREATE TABLE … AS SELECT 形式）。`, sourceSheet: 'DDL' })
      searchFrom = qualified.end
      continue
    }
    const close = findMatchingParen(cleaned, pos)
    if (close < 0) {
      issues.push({ severity: 'error', message: `CREATE TABLE ${tableName} 缺少右括号。`, sourceSheet: 'DDL' })
      searchFrom = qualified.end
      continue
    }
    searchFrom = close + 1
    const body = cleaned.slice(pos + 1, close)
    const tail = sliceStatementTail(cleaned, close + 1)
    const trailingComment = tail.match(TRAILING_TABLE_COMMENT_PATTERN)?.[1]?.replace(/''/g, "'")
    const chineseName = tableChineseNames.get(tableName.toLowerCase()) || trailingComment || tableName
    const { fields: tableFields, primaryKeyNames } = parseColumns(body, tableName, chineseName, issues)
    const distributeName = tail.match(DISTRIBUTE_PATTERN)?.[1]?.toLowerCase()
    const partitionName = tail.match(PARTITION_PATTERN)?.[1]?.toLowerCase()
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
  }

  if (tables.length === 0) issues.push({ severity: 'error', message: '未找到 CREATE TABLE 语句，请检查 DDL 内容。', sourceSheet: 'DDL' })

  return {
    adapterName: 'ddl-parser',
    importedAt: new Date().toISOString(),
    sourceFile: sourceName,
    tables, fields, standards: [], codeItems: [], revisions: [], unknownSheets: [], issues,
    stats: { sheetCount: 1, tableCount: tables.length, fieldCount: fields.length, standardCount: 0, codeItemCount: 0, revisionCount: 0, issueCount: issues.length },
  }
}
