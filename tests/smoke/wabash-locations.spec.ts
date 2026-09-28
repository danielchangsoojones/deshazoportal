import { expect, test } from '@playwright/test'

const smokeEmail = process.env.SMOKE_TEST_EMAIL
const smokePassword = process.env.SMOKE_TEST_PASSWORD
const protectedInstallWorkOrderId = '61077'
const protectedInstallJobNo = '0265909'

async function signInIfNeeded(page: import('@playwright/test').Page, returnPath: string) {
  const auditHeading = page.getByRole('heading', { name: 'Work Orders' })
  const signInButton = page.getByRole('button', { name: /sign in/i })
  await expect(auditHeading.or(signInButton)).toBeVisible()

  const isLoginVisible = await signInButton.isVisible().catch(() => false)
  if (!isLoginVisible) return

  if (!smokeEmail || !smokePassword) {
    throw new Error('Set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to run the Wabash location smoke test.')
  }

  await page.locator('input[type="email"]').fill(smokeEmail)
  await page.locator('input[type="password"]').fill(smokePassword)
  await signInButton.click()
  await expect(signInButton).toBeHidden()
  await page.goto(returnPath)
}

test('Wabash high-dollar installation stays bucketed to Phoenix instead of Jonestown', async ({ page }) => {
  const auditPath = '/wabash-location-mismatch'

  await page.goto(auditPath)
  await signInIfNeeded(page, auditPath)

  await expect(page.getByRole('heading', { name: 'Work Orders' })).toBeVisible()
  await expect(page.getByText('Loading Wabash work orders...')).toHaveCount(0)

  await page.getByPlaceholder('Search jobs').fill(protectedInstallWorkOrderId)

  const protectedInstallRow = page
    .getByRole('row')
    .filter({ hasText: `WO ${protectedInstallWorkOrderId}` })

  await expect(protectedInstallRow).toBeVisible()
  await expect(protectedInstallRow).toContainText(protectedInstallJobNo)
  await expect(protectedInstallRow).toContainText('Phoenix, AZ')
  await expect(protectedInstallRow).toContainText('Phoenix, AZ ship-to')
  await expect(protectedInstallRow).toContainText('Source: Jonestown / Jonestown, PA')
  await expect(protectedInstallRow).not.toContainText('Phoenix / Jonestown')
})
