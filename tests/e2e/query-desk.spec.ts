import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

async function importWorkbook(page: Page, fileName: string) {
  await page.goto('/')
  await expect(page.getByTestId('dataset-empty')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: '导入 Excel' }).click()
  await page.getByTestId('import-input').setInputFiles(path.join(process.cwd(), fileName))
  await page.getByTestId('sheet-list').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: '导入选中 Sheet' }).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 120000 })
}

test.describe('数据字典查询台', () => {
  test('首次进入为空状态，导入后建立本地索引并在刷新后恢复', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('dataset-empty')).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: '粘贴 DDL' })).toBeVisible()

    await importWorkbook(page, 'dp_ial.xlsx')
    await expect(page.getByTestId('dataset-ready')).toBeVisible()
    await expect(page.getByTestId('source-warehouse')).toContainText('dp_ial.xlsx')

    await page.reload()
    await expect(page.getByTestId('dataset-ready')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('cache-status')).toContainText('已从 IndexedDB 恢复')
  })

  test('通过 DDL 文本导入并搜索字段', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('dataset-empty')).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: '粘贴 DDL' }).click()
    await page.getByTestId('ddl-name').fill('员工域 DDL')
    await page.getByTestId('ddl-text').fill(`CREATE TABLE a_pub_staff_tab (
  data_dt date NOT NULL,
  staff_id varchar(10) NOT NULL PRIMARY KEY COMMENT '员工编号'
) DISTRIBUTE BY HASH(staff_id);
COMMENT ON TABLE a_pub_staff_tab IS '员工表';`)
    await page.getByTestId('ddl-confirm').click()
    await expect(page.getByTestId('dataset-ready')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('source-warehouse')).toContainText('员工域 DDL')

    await page.getByTestId('global-search').fill('员工编号')
    await expect(page.getByTestId('field-result').first()).toBeVisible()
    await page.getByTestId('field-result').first().click()
    await expect(page.getByTestId('field-detail')).toContainText('staff_id')
  })

  test('搜索字段并查看结构详情', async ({ page }) => {
    await importWorkbook(page, 'dp_ial.xlsx')
    await expect(page.getByRole('heading', { name: '找到你要的字段。' })).toBeVisible()

    await page.getByTestId('global-search').fill('法人代码')
    await expect(page.getByTestId('search-results')).toContainText('找到')
    await expect(page.getByTestId('field-result').first()).toBeVisible()

    await page.getByTestId('field-result').first().click()
    await expect(page.getByTestId('table-detail')).toBeVisible()
    await expect(page.getByTestId('field-detail')).toBeVisible()
    await expect(page.getByTestId('field-detail')).toContainText('法人代码')
    const detailBox = await page.getByTestId('field-detail').boundingBox()
    expect(detailBox?.y).toBeLessThan(page.viewportSize()?.height ?? 720)
    await page.getByTestId('field-detail').locator('.relation-list button').first().click()
    await expect(page.getByTestId('code-values')).toBeVisible()
    await expect(page.getByTestId('code-related-fields')).toBeVisible()
    await expect(page.getByTestId('code-values')).toHaveCSS('overflow-y', 'auto')
    await expect(page.getByTestId('code-related-fields-list')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.codes-animated-list .scroll-list')).toHaveCSS('overflow-y', 'auto')
    const codeValuesBox = await page.getByTestId('code-values').boundingBox()
    const relatedFieldsBox = await page.getByTestId('code-related-fields').boundingBox()
    expect(relatedFieldsBox?.x).toBeGreaterThan(codeValuesBox?.x ?? 0)
    await page.goBack()
    await expect(page.getByTestId('field-detail')).toBeVisible()
    await expect(page.getByTestId('field-detail')).toContainText('法人代码')
    await page.screenshot({ path: 'test-results/query-desk-desktop.png', fullPage: true })
  })

  test('从导入向导载入真实 Excel 并更新数据源', async ({ page }) => {
    await importWorkbook(page, 'dp_ial.xlsx')
    await page.getByTestId('source-warehouse').click()
    await expect(page.getByText('dp_ial.xlsx').first()).toBeVisible()
    await expect(page.getByRole('main').getByText('10,902', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '导入文件' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('import-input').setInputFiles(path.join(process.cwd(), 'dp_ial.xlsx'))
    await page.getByRole('button', { name: '导入选中 Sheet' }).click()
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60000 })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'test-results/query-desk-mobile.png', fullPage: true })
  })

  test('数据标准页动画列表与设置菜单删除数据源', async ({ page }) => {
    test.setTimeout(120000)
    await importWorkbook(page, 'dp_ial.xlsx')
    await page.getByTestId('nav-standards').click()
    await expect(page.locator('.compact-row').first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('standards-more')).toContainText('滚动加载更多')

    await page.getByTestId('standards-filter').fill('法人代码')
    await page.locator('.compact-row').first().click()
    await expect(page.locator('.compact-detail .detail-header h2')).toContainText('法人代码', { timeout: 10000 })
    await page.getByTestId('standards-filter').fill('不存在的东西')
    await expect(page.getByText('没有匹配的标准')).toBeVisible()

    await page.getByTestId('standards-filter').fill('')
    await page.getByTestId('settings-button').click()
    await expect(page.getByTestId('settings-menu')).toBeVisible()
    await page.getByTestId('settings-delete-source').click()
    await expect(page.getByTestId('settings-delete-source')).toContainText('再点一次')
    await expect(async () => {
      await page.getByTestId('settings-delete-source').click()
      await expect(page.getByTestId('dataset-empty')).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })

    await page.reload()

    await page.reload()
    await expect(page.getByTestId('dataset-empty')).toBeVisible({ timeout: 30000 })
  })

  test('导入 RCVP 零售集市库并查看 DP_IAL 字段血缘', async ({ page }) => {
    test.setTimeout(180000)
    await importWorkbook(page, 'dp_ial.xlsx')
    await page.getByRole('button', { name: '导入文件' }).click()
    await page.getByTestId('import-input').setInputFiles(path.join(process.cwd(), 'rcvp.xlsx'))
    await page.getByRole('button', { name: '导入选中 Sheet' }).click()
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 120000 })
    await expect(page.getByTestId('source-retail')).toContainText('rcvp.xlsx')

    await page.getByTestId('global-search').fill('CUST_ID')
    await expect(page.getByTestId('field-result').first()).toBeVisible({ timeout: 30000 })
    await page.getByTestId('field-result').first().click()
    await expect(page.getByTestId('field-lineage')).toBeVisible()
    await expect(page.getByTestId('field-lineage')).toContainText('来源表')
    await expect(page.getByTestId('field-lineage')).toContainText('SQL 加工 / 映射规则')
    await page.getByRole('button', { name: '跳转至 DP_IAL 字段' }).click()
    await expect(page.getByTestId('source-warehouse')).toContainText('dp_ial.xlsx')
    await page.getByTestId('navigation-back').click()
    await expect(page.getByTestId('source-retail')).toContainText('rcvp.xlsx')
    await expect(page.getByTestId('field-detail')).toBeVisible()
    await page.getByRole('button', { name: '跳转至 DP_IAL 字段' }).click()
    await page.getByTestId('source-retail').click()
    await expect(page.getByTestId('source-retail')).toContainText('rcvp.xlsx')
    await page.reload()
    await expect(page.getByTestId('dataset-ready')).toBeVisible({ timeout: 30000 })
    await page.getByTestId('source-retail').click()
    await expect(page.getByTestId('source-retail')).toContainText('rcvp.xlsx')
  })
})
