import { describe, expect, it } from 'vitest'
import { importWorkbook, type RawSheet } from './adapter'

const makeSheet = (name: string, rows: unknown[][]): RawSheet => ({ name, rows })

describe('workbook import adapters', () => {
  it('imports the current dp_ial shape without depending on sheet order', () => {
    const dataset = importWorkbook([
      makeSheet('随手备注', [['说明'], ['保留这个 sheet']]),
      makeSheet('字段定义', [
        ['目标表中文名称', '目标表英文名称', '目标字段序号', '目标字段中文名称', '目标字段英文名称', '高斯_目标字段数据类型', 'SR_目标字段数据类型', '主键', '分布键', '分区键', '数据标准长度', '映射标准编号(V2.0版)', '引用的公共代码', '备注'],
        ['机构信息表', 'a_pub_org_info_tab', 1, '数据日期', 'data_dt', 'date', 'date', 'Y', '', '', '', 'SCBTS0004749', '', ''],
      ]),
      makeSheet('表目录', [
        ['模型中文名称', '模型英文名称', '加载策略', '加载频度', '保留时效', '业务范围', '责任人', '主题'],
        ['机构信息表', 'a_pub_org_info_tab', '全量', '日', '近一年', '机构信息', '数据管理员', 'org'],
      ]),
      makeSheet('标准', [
        ['信息项中文名称', '英文简称', '主题', '数据类型', '字符型长度', '数据精度', '标准编号'],
        ['数据日期', 'Data Date', '公共', '日期', '', '', 'SCBTS0004749'],
      ]),
      makeSheet('代码表', [
        ['代码中文名称', '代码英文名称', '代码值', '代码值描述', '引用标准代码编号', '引用标准代码名称'],
        ['性别代码', 'gender_cd', '1', '男', 'CDCS0001', '性别代码'],
      ]),
    ])

    expect(dataset.tables).toHaveLength(1)
    expect(dataset.fields[0]).toMatchObject({
      tableEnglishName: 'a_pub_org_info_tab',
      englishName: 'data_dt',
      fieldType: 'date',
    })
    expect(dataset.standards[0].standardNo).toBe('SCBTS0004749')
    expect(dataset.codeItems[0].valueDescription).toBe('男')
    expect(dataset.unknownSheets[0].name).toBe('随手备注')
    expect(dataset.stats.sheetCount).toBe(5)
  })

  it('reports missing required columns instead of silently dropping a sheet', () => {
    const dataset = importWorkbook([
      makeSheet('数据字典', [['目标表中文名称', '目标字段中文名称'], ['机构信息表', '数据日期']]),
    ])

    expect(dataset.fields).toHaveLength(0)
    expect(dataset.issues.some((issue) => issue.severity === 'error')).toBe(true)
    expect(dataset.issues[0].sourceSheet).toBe('数据字典')
  })

  it('normalizes aliases and preserves source coordinates for future formats', () => {
    const dataset = importWorkbook([
      makeSheet('fields_v3', [
        ['table_cn', 'table_en', 'field_no', 'field_cn', 'field_en', 'type', 'primary_key'],
        ['客户表', 'customer_tab', 2, '客户编号', 'customer_id', 'VARCHAR(32)', 'Y'],
      ]),
    ])

    expect(dataset.fields[0]).toMatchObject({
      tableChineseName: '客户表',
      englishName: 'customer_id',
      fieldType: 'varchar(32)',
      isPrimaryKey: true,
      sourceRow: 2,
    })
    expect(dataset.adapterName).toBe('generic-schema-adapter')
  })

  it('imports the RCVP retail mart layout and preserves DP_IAL lineage rules', () => {
    const dataset = importWorkbook([
      makeSheet('模型实体清单', [
        ['序号', '一级主题', '二级主题', '表中文名', '表英文名', '业务含义及范围说明'],
        [1, '零售集市', '明细层', '零售客户基本信息表', 'M07_D_P_CUST_INFO', '个人客户信息'],
      ]),
      makeSheet('零售客户基本信息表', [
        ['数据开始日期', '20241120'],
        ['层级', '明细层'],
        ['使用系统', '数据平台'],
        ['存储策略', '切片'],
        ['历史数据保留', '近一年'],
        ['字段序号', '表中文名', '表英文名称', '字段中文名', '数据类型', '是否敏感字段', '字段英文名', '字段类型', '是否主键', '是否可为空', '引用标准编号(中文匹配）', '引用标准编号(英文匹配）', '引用代码中文名称', '引用标准代码（码值）', '自定义码值', '字段含义', '数据库为空处置', '展示为空处置', '备注', '创建日期', '修改日期', '修改类型（新增、修改、删除）', '修改人', '评审记录', '来源系统名称', '来源表中文名称', '来源表英文名称', '来源字段中文名称', '来源字段英文名称', '映射规则', '来源备注'],
        [1, '零售客户基本信息表', 'M07_D_P_CUST_INFO', '客户编号', '字符串', '', 'CUST_ID', 'VARCHAR(13)', 'Y', 'N', 'SCBTS0001400', 'SCBTS0001400', '/', '42', '', '', '', '', '', '', '', '', '', '', '数据平台', '个人客户基本情况表', 'A_PUB_INDV_CUST_BASIC_SITU_TAB', '客户编号', 'CUST_ID', 'P1.CUST_ID', '主表直取'],
      ]),
      makeSheet('标准信息项（7月修订）', [
        ['标准体系', '标准类型', '信息项中文名称', '英文名称', '英文简称', '标准编号', '主题', '数据类型', '数据长度', '数据精度'],
        ['四川银行数据标准体系', '技术数据标准', '客户编号', 'Customer ID', 'CUST_ID', 'SCBTS0001400', '客户', '变长字符串', '13', ''],
      ]),
      makeSheet('公共代码标准(版本时刻与信息项保持一致）', [
        ['代码编号', '代码中文名称', '代码值', '代码值说明', '业务说明'],
        ['CDAS000001', '客户类型代码', '01', '个人客户', '客户分类'],
      ]),
      makeSheet('修订记录', [
        ['日期', '版本号', '修订记录', '修订方式', '修订人'],
        ['20241111', '2.2', '新增客户编号字段', '新增', '王洋'],
      ]),
    ])

    expect(dataset.adapterName).toBe('rcvp-retail-mart-adapter')
    expect(dataset.tables).toEqual(expect.arrayContaining([expect.objectContaining({ englishName: 'M07_D_P_CUST_INFO', topic: '零售集市', businessScope: '个人客户信息' })]))
    expect(dataset.fields[0]).toMatchObject({
      tableEnglishName: 'M07_D_P_CUST_INFO',
      englishName: 'CUST_ID',
      lineage: {
        sourceSystem: '数据平台',
        sourceTableEnglishName: 'A_PUB_INDV_CUST_BASIC_SITU_TAB',
        sourceFieldEnglishName: 'CUST_ID',
        mappingRule: 'P1.CUST_ID',
      },
    })
    expect(dataset.standards[0].standardNo).toBe('SCBTS0001400')
    expect(dataset.codeItems[0]).toMatchObject({ codeSetName: '客户类型代码', valueDescription: '个人客户' })
    expect(dataset.revisions[0]).toMatchObject({ modifiedAt: '20241111', reason: '新增客户编号字段', operation: '新增', operator: '王洋' })
  })
})
