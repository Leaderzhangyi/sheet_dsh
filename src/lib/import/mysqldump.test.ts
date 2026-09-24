import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseDdl } from './ddl'

// 夹具来自真实环境：Docker MySQL 8 容器中 mysqldump --no-data --skip-comments
// --default-character-set=utf8mb4 的原样输出（含 /*!40101 版本注释、DROP TABLE、
// 反引号标识符、ENGINE/CHARSET 尾部选项），用于固化免桥导入路径的兼容性。
describe('real mysqldump fixture', () => {
  it('parses the genuine mysqldump --no-data output from MySQL 8', () => {
    const dump = readFileSync(
      path.join(__dirname, 'fixtures/mysqldump-8-no-data.sql'),
      'utf-8',
    )
    expect(dump).toContain('客户信息表')
    const dataset = parseDdl(dump, { sourceName: 'mysqldump 实测' })

    expect(dataset.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
    expect(dataset.tables.map((table) => table.englishName)).toEqual(['acct_bal', 'cust_info'])
    const custInfo = dataset.tables.find((table) => table.englishName === 'cust_info')
    expect(custInfo).toMatchObject({ chineseName: '客户信息表', fieldCount: 3 })

    const custNo = dataset.fields.find((field) => field.englishName === 'cust_no')
    expect(custNo).toMatchObject({ chineseName: '客户编号', isPrimaryKey: true, fieldType: 'varchar(20)' })
    const bal = dataset.fields.find((field) => field.englishName === 'bal')
    expect(bal).toMatchObject({ chineseName: '余额', dataLength: '18' })
  })
})
