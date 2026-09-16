/**
 * 数据库标识符白名单校验。
 *
 * 背景：MySQL 预处理语句只支持对"值"做参数绑定（? 占位），
 * 表名/库名这类标识符无法绑定。因此标识符采用两重防护：
 * 1. 严格的白名单正则（仅字母/数字/下划线/中文/美元符，禁反引号、点、引号等一切可逃逸字符）；
 * 2. 使用前与 information_schema 实查的表清单比对，确保只接受真实存在的对象名。
 */

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$\u4e00-\u9fa5]{1,64}$/

export function isSafeIdentifier(name) {
  return typeof name === 'string' && IDENTIFIER_PATTERN.test(name)
}

export function assertSafeIdentifier(name) {
  if (!isSafeIdentifier(name)) {
    throw new Error(`非法标识符：${String(name).slice(0, 40)}`)
  }
  return name
}

/** 输出反引号包裹的安全标识符（入参先过白名单）。 */
export function quoteIdentifier(name) {
  return `\`${assertSafeIdentifier(name)}\``
}
