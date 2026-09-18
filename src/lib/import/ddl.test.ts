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

  it('解析 mysqldump --no-data 导出的真实格式（免桥导入路径）', () => {
    const dataset = parseDdl([
      '-- MySQL dump 10.13  Distrib 8.0.36',
      '-- Host: 10.20.30.5    Database: retail_mart',
      '',
      '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;',
      '/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;',
      '',
      '-- Table structure for table `cust_info`',
      '',
      'DROP TABLE IF EXISTS `cust_info`;',
      '/*!40101 SET @saved_cs_client     = @@character_set_client */;',
      '',
      'CREATE TABLE `cust_info` (',
      "  `cust_no` varchar(20) NOT NULL COMMENT '客户编号',",
      "  `cust_nm` varchar(64) DEFAULT NULL COMMENT '客户名称',",
      '  `score` double precision DEFAULT NULL,',
      '  PRIMARY KEY (`cust_no`),',
      '  KEY `idx_cust_nm` (`cust_nm`)',
      ") ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户信息表';",
      '/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;',
      '',
      '-- Dump completed on 2026-09-18',
    ].join('\n'))
    expect(dataset.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)
    expect(dataset.tables).toHaveLength(1)
    expect(dataset.tables[0]).toMatchObject({ englishName: 'cust_info', chineseName: '客户信息表' })
    const names = dataset.fields.map((field) => field.englishName)
    expect(names).toEqual(['cust_no', 'cust_nm', 'score'])
    const custNo = dataset.fields.find((field) => field.englishName === 'cust_no')
    expect(custNo).toMatchObject({ chineseName: '客户编号', isPrimaryKey: true })
    const score = dataset.fields.find((field) => field.englishName === 'score')
    expect(score?.fieldType).toBe('double precision')
  })

  it('无 CREATE TABLE 时报告错误', () => {
    const dataset = parseDdl('SELECT * FROM dual;')
    expect(dataset.tables).toHaveLength(0)
    expect(dataset.issues.some((issue) => issue.message.includes('CREATE TABLE'))).toBe(true)
  })

  it('解析 schema 限定表名与对应的 COMMENT ON COLUMN', () => {
    const dataset = parseDdl(`
CREATE TABLE dwd.cust_info (
  cust_no char(12) NOT NULL,
  cust_nm varchar(64)
);
COMMENT ON TABLE dwd.cust_info IS '客户信息表';
COMMENT ON COLUMN dwd.cust_info.cust_nm IS '客户名称';
`)
    expect(dataset.tables.map((table) => table.englishName)).toEqual(['cust_info'])
    expect(dataset.tables[0].chineseName).toBe('客户信息表')
    const custNm = dataset.fields.find((field) => field.englishName === 'cust_nm')
    expect(custNm?.chineseName).toBe('客户名称')
  })

  it('支持带引号的列名、注释行与字符串内的逗号', () => {
    const dataset = parseDdl(`
-- 客户标签表
CREATE TABLE "dmp"."cust_tag" (
  -- 主键
  "tag_id" decimal(18,0) NOT NULL PRIMARY KEY,
  "cust_no" varchar(32) NOT NULL,
  flag char(1) DEFAULT 'Y,N' COMMENT '标识（字符串含逗号）',
  score double precision,
  created_at timestamp(6) with time zone
) DISTRIBUTE BY HASH("cust_no");
`)
    expect(dataset.tables[0].chineseName).toBe('cust_tag')
    const names = dataset.fields.map((field) => field.englishName)
    expect(names).toEqual(['tag_id', 'cust_no', 'flag', 'score', 'created_at'])
    const flag = dataset.fields.find((field) => field.englishName === 'flag')
    expect(flag?.chineseName).toBe('标识（字符串含逗号）')
    const score = dataset.fields.find((field) => field.englishName === 'score')
    expect(score?.fieldType).toBe('double precision')
    const createdAt = dataset.fields.find((field) => field.englishName === 'created_at')
    expect(createdAt?.fieldType).toBe('timestamp(6) with time zone')
    const custNo = dataset.fields.find((field) => field.englishName === 'cust_no')
    expect(custNo?.isDistributionKey).toBe(true)
  })

  it('支持 create or replace view 与表级约束块', () => {
    const dataset = parseDdl(`
CREATE OR REPLACE VIEW v_cust_overview AS SELECT 1;
CREATE TABLE ods.acct_bal (
  acct_no varchar(20),
  bal decimal(18,2),
  CONSTRAINT pk_acct PRIMARY KEY (acct_no),
  UNIQUE (acct_no)
) PARTITION BY RANGE (bal);
`)
    expect(dataset.tables.map((table) => table.englishName)).toEqual(['acct_bal'])
    const acctNo = dataset.fields.find((field) => field.englishName === 'acct_no')
    expect(acctNo?.isPrimaryKey).toBe(true)
    const bal = dataset.fields.find((field) => field.englishName === 'bal')
    expect(bal?.isPartitionKey).toBe(true)
    // 视图缺少列定义括号，应给出 warning 而不是静默丢失
    expect(dataset.issues.some((issue) => issue.message.includes('v_cust_overview'))).toBe(true)
  })
})
