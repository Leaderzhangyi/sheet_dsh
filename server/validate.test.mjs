import { describe, expect, it } from 'vitest'
import { assertSafeIdentifier, isSafeIdentifier, quoteIdentifier } from './validate.mjs'

describe('mysql identifier whitelist', () => {
  it('accepts ordinary table and database names', () => {
    expect(isSafeIdentifier('cust_info')).toBe(true)
    expect(isSafeIdentifier('A99')).toBe(true)
    expect(isSafeIdentifier('客户信息表')).toBe(true)
    expect(assertSafeIdentifier('acct_bal')).toBe('acct_bal')
    expect(quoteIdentifier('cust_info')).toBe('`cust_info`')
  })

  it('normalizes full-width characters produced by Chinese IME', () => {
    expect(assertSafeIdentifier('retail＿mart')).toBe('retail_mart')
    expect(assertSafeIdentifier('ＤＢ１')).toBe('DB1')
    expect(isSafeIdentifier('retail＿mart')).toBe(true)
  })

  it('rejects anything that could escape quoting', () => {
    for (const bad of ['`t`', 'a;b', 'a b', 'x.y', "a'b", 'a"b', '', 'x'.repeat(65), 42, null, undefined, { toString: () => 't' }]) {
      expect(() => assertSafeIdentifier(bad)).toThrow(/非法标识符/)
    }
    expect(isSafeIdentifier('DROP TABLE x--')).toBe(false)
  })
})
