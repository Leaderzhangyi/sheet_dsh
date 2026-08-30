import type { DictionaryDataset } from '../import/types'

export type SearchType = 'table' | 'field' | 'standard' | 'code' | 'revision'

export interface SearchResult {
  id: string
  type: SearchType
  title: string
  subtitle: string
  matchedOn: string[]
  score: number
  tableId?: string
  recordId: string
}

interface SearchOptions {
  types?: SearchType[]
  limit?: number
  index?: SearchIndex
}

interface SearchResponse {
  results: SearchResult[]
  groups: SearchType[]
}

export interface SearchIndexEntry {
  type: SearchType
  recordId: string
  tableId?: string
  title: string
  subtitle: string
  candidates: [string, string][]
  searchText: string
}

export interface SearchIndex {
  entries: SearchIndexEntry[]
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase()

function scoreText(query: string, value: string, label: string) {
  const normalized = normalize(value)
  if (!normalized || !normalized.includes(query)) return null
  const score = normalized === query ? 100 : normalized.startsWith(query) ? 85 : 55
  return { score, label }
}

function bestMatch(query: string, candidates: [string, string][]) {
  const matches = candidates.map(([value, label]) => scoreText(query, value, label)).filter(Boolean) as { score: number; label: string }[]
  if (!matches.length) return null
  return { score: Math.max(...matches.map((match) => match.score)), matchedOn: matches.filter((match) => match.score === Math.max(...matches.map((item) => item.score))).map((match) => match.label) }
}

export function searchDataset(dataset: DictionaryDataset, rawQuery: string, options: SearchOptions = {}): SearchResponse {
  const query = normalize(rawQuery)
  if (!query) return { results: [], groups: [] }
  const allowed = options.types ? new Set(options.types) : null
  const results: SearchResult[] = []
  const index = options.index ?? buildSearchIndex(dataset)
  for (const entry of index.entries) {
    if (allowed && !allowed.has(entry.type)) continue
    const match = bestMatch(query, entry.candidates)
    if (!match) continue
    results.push({ id: `${entry.type}:${entry.recordId}`, recordId: entry.recordId, type: entry.type, title: entry.title, subtitle: entry.subtitle, matchedOn: match.matchedOn, score: match.score, ...(entry.tableId ? { tableId: entry.tableId } : {}) })
  }
  const typePriority: Record<SearchType, number> = { table: 5, field: 4, standard: 3, code: 2, revision: 1 }
  results.sort((left, right) => right.score - left.score || typePriority[right.type] - typePriority[left.type] || left.title.localeCompare(right.title, 'zh-CN'))
  const limited = results.slice(0, options.limit ?? 80)
  return { results: limited, groups: [...new Set(limited.map((result) => result.type))] }
}

const makeIndexEntry = (type: SearchType, recordId: string, title: string, subtitle: string, candidates: [string, string][], tableId?: string): SearchIndexEntry => ({
  type, recordId, title, subtitle, candidates, tableId, searchText: candidates.map(([value]) => normalize(value)).filter(Boolean).join(' '),
})

export function buildSearchIndex(dataset: DictionaryDataset): SearchIndex {
  const entries: SearchIndexEntry[] = []
  for (const table of dataset.tables) entries.push(makeIndexEntry('table', table.id, table.chineseName, table.englishName, [[table.chineseName, '中文名'], [table.englishName, '英文名'], [table.businessScope, '业务范围'], [table.owner, '责任人']]))
  for (const field of dataset.fields) entries.push(makeIndexEntry('field', field.id, field.chineseName, `${field.tableChineseName} · ${field.englishName}`, [[field.chineseName, '中文名'], [field.englishName, '英文名'], [field.tableChineseName, '所属表'], [field.tableEnglishName, '所属表英文名'], [field.standardNo, '标准编号'], [field.publicCodeName, '公共代码'], [field.remark, '备注']], field.tableId))
  for (const standard of dataset.standards) entries.push(makeIndexEntry('standard', standard.id, standard.chineseName, standard.standardNo, [[standard.standardNo, '标准编号'], [standard.chineseName, '中文名'], [standard.englishName, '英文名'], [standard.topic, '主题']]))
  for (const code of dataset.codeItems) entries.push(makeIndexEntry('code', code.id, code.codeSetName, `${code.value} · ${code.valueDescription}`, [[code.codeSetName, '代码中文名'], [code.codeSetEnglishName, '代码英文名'], [code.value, '代码值'], [code.valueDescription, '代码值描述'], [code.standardNo, '标准编号']]))
  for (const revision of dataset.revisions) entries.push(makeIndexEntry('revision', revision.id, revision.tableName, `${revision.modifiedAt} · ${revision.operation}`, [[revision.tableName, '表名'], [revision.fieldBefore, '修改前字段'], [revision.fieldAfter, '修改后字段'], [revision.reason, '修改原因'], [revision.operator, '操作人']]))
  return { entries }
}
