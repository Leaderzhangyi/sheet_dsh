/**
 * MySQL 桥服务：让浏览器端"数据字典查询台"直连 MySQL 拉取 DDL。
 *
 * 仅在内网/本机运行，不要暴露到公网。
 * 只提供三个固定接口，不开放任意 SQL 透传：
 *   POST /api/mysql/test   测试连接（SELECT 1）
 *   POST /api/mysql/tables 拉取表清单（information_schema，值全部参数绑定）
 *   POST /api/mysql/ddl    拉取选中表的 SHOW CREATE TABLE 结果
 *
 * 安全约定：所有"值"一律参数绑定；表名/库名等标识符无法绑定，
 * 走白名单校验（server/validate.mjs）并与服务端实查清单比对。
 */
import http from 'node:http'
import mysql from 'mysql2/promise'
import { assertSafeIdentifier, quoteIdentifier } from './validate.mjs'

const PORT = Number(process.env.PORT || 4310)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = ''
    request.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error('请求体过大'))
    })
    request.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS })
  response.end(JSON.stringify(payload))
}

function friendlyError(error) {
  if (error && typeof error === 'object') {
    if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ER_PASSWORD_NOT_ALLOWED' || error.sqlMessage?.includes('Access denied')) {
      return '鉴权失败：用户名或密码不正确。'
    }
    if (error.code === 'ECONNREFUSED') return '无法连接：目标主机/端口拒绝连接，检查地址、端口与防火墙。'
    if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') return '无法连接：地址不存在或网络不通。'
    if (error.code === 'ER_BAD_DB_ERROR') return '数据库不存在：检查库名。'
  }
  return error instanceof Error ? error.message : '未知错误'
}

async function withConnection(config, handler) {
  const connection = await mysql.createConnection({
    host: config.host,
    port: Number(config.port) || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 8000,
    // 只读用途，禁止本地 infile 等危险特性
    localInfile: false,
    multipleStatements: false,
  })
  try {
    return await handler(connection)
  } finally {
    await connection.end().catch(() => {})
  }
}

async function listTables(connection, database) {
  // 值参数绑定：库名与表类型都是"值"，可用 ? 绑定
  const [rows] = await connection.query(
    'SELECT TABLE_NAME AS name, TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
    [database, 'BASE TABLE'],
  )
  return rows
}

async function fetchDdl(connection, database, tableNames) {
  // 先实查该库全部表名，请求里的表名必须存在于清单中（防伪造标识符）
  const rows = await listTables(connection, database)
  const liveNames = new Set(rows.map((row) => row.name))
  const ddlParts = []
  const imported = []
  for (const name of tableNames) {
    assertSafeIdentifier(name)
    if (!liveNames.has(name)) throw new Error(`表 ${name} 不在数据库 ${database} 中`)
    const [result] = await connection.query(`SHOW CREATE TABLE ${quoteIdentifier(database)}.${quoteIdentifier(name)}`)
    const row = result[0] ?? {}
    const create = row['Create Table'] ?? row['Create View'] ?? ''
    if (!create) continue
    ddlParts.push(`${create};`)
    imported.push(name)
  }
  return { ddl: ddlParts.join('\n'), imported }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS)
    response.end()
    return
  }
  const url = request.url ?? ''
  if (request.method !== 'POST' || !url.startsWith('/api/mysql/')) {
    sendJson(response, 404, { error: '接口不存在' })
    return
  }
  try {
    const body = await readBody(request)
    if (url === '/api/mysql/test') {
      const version = await withConnection(body, async (connection) => {
        const [rows] = await connection.query('SELECT VERSION() AS version')
        return rows[0]?.version ?? ''
      })
      sendJson(response, 200, { ok: true, version: String(version) })
      return
    }
    if (url === '/api/mysql/tables') {
      if (!body.database) throw new Error('请先填写数据库名。')
      const tables = await withConnection(body, (connection) => listTables(connection, body.database))
      sendJson(response, 200, { ok: true, tables })
      return
    }
    if (url === '/api/mysql/ddl') {
      if (!body.database || !Array.isArray(body.tables) || body.tables.length === 0) throw new Error('请先选择要导入的表。')
      // 先过白名单再连库：任何恶意标识符在建立连接前就被拒绝
      assertSafeIdentifier(body.database)
      for (const name of body.tables) assertSafeIdentifier(name)
      const result = await withConnection(body, (connection) => fetchDdl(connection, body.database, body.tables))
      sendJson(response, 200, { ok: true, ...result })
      return
    }
    sendJson(response, 404, { error: '接口不存在' })
  } catch (error) {
    sendJson(response, 400, { error: friendlyError(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MySQL 桥服务已启动: http://127.0.0.1:${PORT}（仅限内网/本机使用）`)
})
