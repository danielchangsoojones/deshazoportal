// Auth client for the live DeShazo application API (deshazo-api.belovedrobot.com).
// This is separate from the portal's Supabase auth: it authenticates against the
// same backend the production DeShazo app at deshazo.belovedrobot.com uses.
//
// The sign-in endpoint returns the session as an HttpOnly `auth` cookie (the token
// value is never exposed to JS), so every request must be sent with credentials.
// In the browser that cookie is only sent back when the API is same-origin, which is
// why local dev proxies `/deshazo-api` -> deshazo-api.belovedrobot.com/api (see
// vite.config.ts). A deployed build needs an equivalent same-origin rewrite, or the
// cookie will be dropped as cross-site.

import { getFullApplicationSampleResponse, isFullApplicationSampleRoute } from './fullApplicationSampleData'

// Both Vite in development and server.mjs in production expose this same-origin
// route. Keeping the browser on the portal origin ensures the HttpOnly auth cookie
// is stored for, and sent back to, the server that handles subsequent API calls.
const defaultDeshazoApiUrl = '/deshazo-api'

const deshazoApiUrl =
  (import.meta.env.VITE_DESHAZO_APP_API_URL as string | undefined)?.trim().replace(/\/$/, '') ||
  defaultDeshazoApiUrl

// Sent by the production app on every request; some endpoints expect it.
const webVersion = '2026-05-09_04-05-39'

export type DeshazoAppUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  roleId: number
  role?: { id: number; name: string }
  serviceLocations?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export async function deshazoAppFetch(path: string, init?: RequestInit) {
  if (isFullApplicationSampleRoute()) return getFullApplicationSampleResponse(path)

  const headers = new Headers(init?.headers)
  headers.set('web-version', webVersion)
  if (init?.body) headers.set('Content-Type', 'application/json')

  try {
    return await fetch(`${deshazoApiUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `DeShazo API is unreachable at ${deshazoApiUrl}. In local dev the Vite proxy must be running; ` +
          `for a deployed build set VITE_DESHAZO_APP_API_URL to a same-origin rewrite of the DeShazo API.`,
      )
    }
    throw error
  }
}

export function getDeshazoAppUserName(user: DeshazoAppUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.email || 'DeShazo User'
}

// POST /api/auth/w/sign-in — sets the HttpOnly `auth` cookie and returns the user.
export async function deshazoAppSignIn(email: string, password: string): Promise<DeshazoAppUser> {
  const response = await deshazoAppFetch('/auth/w/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 400) {
      throw new Error('Incorrect email or password.')
    }
    throw new Error(`Sign in failed (${response.status}).`)
  }

  return (await response.json()) as DeshazoAppUser
}

// GET /api/auth/w/validate — returns the current user when the session cookie is valid,
// or null when there is no session (401).
export async function deshazoAppValidate(): Promise<DeshazoAppUser | null> {
  const response = await deshazoAppFetch('/auth/w/validate', { method: 'GET' })
  if (response.status === 401) return null
  if (!response.ok) throw new Error(`Session check failed (${response.status}).`)
  return (await response.json()) as DeshazoAppUser
}

// POST /api/auth/logout — clears the session cookie.
export async function deshazoAppLogout(): Promise<void> {
  try {
    await deshazoAppFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Best effort — ignore network/logout errors so local state can still be cleared.
  }
}
