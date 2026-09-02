export type ImportIssueSeverity = 'error' | 'warning'

export interface TableRecord {
  id: string
  chineseName: string
  englishName: string
  fieldCount: number
  topic: string
  businessScope: string
  owner: string
  loadFrequency: string
  loadStrategy: string
  retention: string
  collection: string
  usage: string
  /** 标签/视图类实体：默认不出现在表目录，可通过开关显示 */
  entityKind?: 'tag' | 'view'
  sourceSheet: string
  sourceRow: number
}

export interface FieldRecord {
  id: string
  tableId: string
  tableChineseName: string
  tableEnglishName: string
  ordinal: number
  chineseName: string
  englishName: string
  fieldType: string
  srFieldType: string
  dataLength: string
  standardNo: string
  publicCodeName: string
  remark: string
  isPrimaryKey: boolean
  isDistributionKey: boolean
  isPartitionKey: boolean
  lineage?: FieldLineage
  sourceSheet: string
  sourceRow: number
}

export interface FieldLineage {
  sourceSystem: string
  sourceTableChineseName: string
  sourceTableEnglishName: string
  sourceFieldChineseName: string
  sourceFieldEnglishName: string
  mappingRule: string
  sourceRemark: string
}

export interface StandardRecord {
  id: string
  standardNo: string
  chineseName: string
  englishName: string
  topic: string
  dataType: string
  dataLength: string
  precision: string
  /** 标准声明的关联公共代码集名称（rcvp 标准信息项的“引用代码中文名称”） */
  publicCodeName?: string
  sourceSheet: string
  sourceRow: number
}

export interface CodeItemRecord {
  id: string
  codeSetName: string
  codeSetEnglishName: string
  value: string
  valueDescription: string
  standardNo: string
  standardName: string
  sourceSheet: string
  sourceRow: number
}

export interface RevisionRecord {
  id: string
  modifiedAt: string
  tableName: string
  before: string
  after: string
  fieldBefore: string
  fieldAfter: string
  reason: string
  operation: string
  operator: string
  sourceSheet: string
  sourceRow: number
}

export interface UnknownSheet {
  name: string
  headers: string[]
  rowCount: number
  rows: unknown[][]
}

export interface ImportIssue {
  severity: ImportIssueSeverity
  message: string
  sourceSheet: string
  sourceRow?: number
  column?: string
}

export interface DictionaryDataset {
  adapterName: string
  importedAt: string
  sourceFile: string
  tables: TableRecord[]
  fields: FieldRecord[]
  standards: StandardRecord[]
  codeItems: CodeItemRecord[]
  revisions: RevisionRecord[]
  unknownSheets: UnknownSheet[]
  issues: ImportIssue[]
  stats: {
    sheetCount: number
    tableCount: number
    fieldCount: number
    standardCount: number
    codeItemCount: number
    revisionCount: number
    issueCount: number
  }
}
