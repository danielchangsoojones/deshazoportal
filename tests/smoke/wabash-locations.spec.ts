import { expect, test } from '@playwright/test'

const smokeEmail = normalizeEmail(process.env.SMOKE_TEST_EMAIL)
const smokePassword = process.env.SMOKE_TEST_PASSWORD
const protectedInstallWorkOrderId = '61077'
const protectedInstallJobNo = '0265909'

function normalizeEmail(value: string | undefined) {
  const text = String(value || '').trim()
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || text
}

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

  const loginError = page.getByRole('alert')
  const signInResult = await Promise.race([
    waitForQuoteLoginToComplete(page).then(() => 'signed-in' as const),
    loginError.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'error' as const),
  ])

  if (signInResult === 'error') {
    throw new Error(`Smoke test login failed for ${smokeEmail}: ${await loginError.innerText()}`)
  }

  await waitForSupabaseSession(page)
  await page.goto(returnPath)
}

async function waitForQuoteLoginToComplete(page: import('@playwright/test').Page) {
  await page.waitForURL((url) => !url.pathname.endsWith('/quotelogin'), {
    timeout: 30_000,
  })
}

async function waitForSupabaseSession(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    return Object.keys(window.localStorage).some((key) => (
      key.includes('supabase') &&
      key.includes('auth-token') &&
      Boolean(window.localStorage.getItem(key))
    ))
  }, undefined, {
    timeout: 30_000,
  })
}

async function expectVisibleWithDiagnostics(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
  message: string,
) {
  try {
    await expect(locator).toBeVisible()
  } catch (error) {
    const pageText = await page.locator('body').innerText().catch(() => '')
    throw new Error(`${message}\nCurrent URL: ${page.url()}\n${error instanceof Error ? error.message : String(error)}\nVisible page text:\n${pageText.slice(0, 2000)}`)
  }
}

test('Wabash high-dollar installation stays bucketed to Phoenix instead of Jonestown', async ({ page }) => {
  const auditPath = '/wabash-location-mismatch'

  await page.goto(auditPath)
  await signInIfNeeded(page, auditPath)

  await expectVisibleWithDiagnostics(
    page,
    page.getByRole('heading', { name: 'Work Orders' }),
    'Wabash location audit page did not render the Work Orders heading.',
  )
  await expect(page.getByText('Loading Wabash work orders...')).toHaveCount(0)

  await page.getByPlaceholder('Search jobs').fill(protectedInstallWorkOrderId)

  const protectedInstallRow = page
    .getByRole('row')
    .filter({ hasText: `WO ${protectedInstallWorkOrderId}` })

  await expect(protectedInstallRow).toBeVisible()
  await expect(protectedInstallRow).toContainText(protectedInstallJobNo)
  await expect(protectedInstallRow).toContainText('Phoenix, AZ')
  await expect(protectedInstallRow).toContainText(/Phoenix, AZ ship-to/i)
  await expect(protectedInstallRow).toContainText('Source: Jonestown / Jonestown, PA')
  await expect(protectedInstallRow).not.toContainText('Phoenix / Jonestown')
})
