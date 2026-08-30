import { describe, expect, it } from 'vitest'
import { parseDdl } from './ddl'

const SAMPLE_DDL = `
-- 员工表
CREATE TABLE a_pub_staff_tab (
  data_dt date NOT NULL,
  lgpsncd varchar(4) NOT NULL COMMENT '法人代码',
  staff_id varchar(10) NOT NULL PRIMARY KEY,
  staff_name varchar(60) COMMENT '员工姓名',
  gender_cd varchar(1) COMMENT '性别代码'
) WITH (orientation = column)
DISTRIBUTE BY HASH(staff_id)
PARTITION BY RANGE(data_dt);
COMMENT ON TABLE a_pub_staff_tab IS '员工表';
COMMENT ON COLUMN a_pub_staff_tab.staff_name IS '员工完整姓名';

CREATE TABLE ods_cust_info (
  cust_no char(12) NOT NULL,
  cust_nm varchar(64),
  PRIMARY KEY (cust_no)
);
COMMENT ON TABLE ods_cust_info IS '客户信息表';
`

describe('parseDdl', () => {
  it('解析多张表并统计字段', () => {
    const dataset = parseDdl(SAMPLE_DDL, { sourceName: '员工域 DDL' })
    expect(dataset.sourceFile).toBe('员工域 DDL')
    expect(dataset.adapterName).toBe('ddl-parser')
    expect(dataset.stats.tableCount).toBe(2)
    expect(dataset.tables.map((table) => table.englishName)).toEqual(['a_pub_staff_tab', 'ods_cust_info'])
    expect(dataset.tables[0].fieldCount).toBe(5)
    expect(dataset.stats.fieldCount).toBe(7)
  })

  it('提取表中文名、字段中文名和 COMMENT ON 覆盖', () => {
    const dataset = parseDdl(SAMPLE_DDL)
    expect(dataset.tables[0].chineseName).toBe('员工表')
    expect(dataset.tables[1].chineseName).toBe('客户信息表')
    const lgpsncd = dataset.fields.find((field) => field.englishName === 'lgpsncd')
    expect(lgpsncd?.chineseName).toBe('法人代码')
    expect(lgpsncd?.remark).toBe('法人代码')
    expect(lgpsncd?.dataLength).toBe('4')
    const staffName = dataset.fields.find((field) => field.englishName === 'staff_name')
    expect(staffName?.chineseName).toBe('员工完整姓名')
  })

  it('识别主键、分布键和分区键', () => {
    const dataset = parseDdl(SAMPLE_DDL)
    const staffId = dataset.fields.find((field) => field.englishName === 'staff_id')
    expect(staffId?.isPrimaryKey).toBe(true)
    expect(staffId?.isDistributionKey).toBe(true)
    const dataDt = dataset.fields.find((field) => field.englishName === 'data_dt')
    expect(dataDt?.isPartitionKey).toBe(true)
    const custNo = dataset.fields.find((field) => field.englishName === 'cust_no')
    expect(custNo?.isPrimaryKey).toBe(true)
  })

  it('无 CREATE TABLE 时报告错误', () => {
    const dataset = parseDdl('SELECT * FROM dual;')
    expect(dataset.tables).toHaveLength(0)
    expect(dataset.issues.some((issue) => issue.message.includes('CREATE TABLE'))).toBe(true)
  })
})
