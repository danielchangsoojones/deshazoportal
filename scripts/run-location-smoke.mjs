import { spawn } from 'node:child_process'

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = ['run', 'smoke:locations:test']

function trimForAlert(value, maxLength = 6000) {
  const text = String(value ?? '').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n... output truncated ...`
}

function runSmokeTest() {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output })
    })
  })
}

async function sendSlackAlert(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim()
  if (!webhookUrl) return false

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  })

  if (!response.ok) {
    throw new Error(`Slack webhook failed with status ${response.status}: ${await response.text()}`)
  }

  return true
}

async function sendEmailAlert(subject, html) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim()
  const fromEmail = process.env.SMOKE_TEST_FROM_EMAIL?.trim()
  const alertEmails = (process.env.SMOKE_TEST_ALERT_EMAIL || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)

  if (!resendApiKey || !fromEmail || alertEmails.length === 0) return false

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: alertEmails,
      subject,
      html,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend request failed with status ${response.status}: ${await response.text()}`)
  }

  return true
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function notifyFailure(result) {
  const baseUrl = process.env.SMOKE_TEST_BASE_URL || 'local dev server'
  const output = trimForAlert(result.output)
  const subject = 'Wabash location smoke test failed'
  const summary = [
    '*Wabash location smoke test failed*',
    `Base URL: ${baseUrl}`,
    `Exit code: ${result.code}`,
    '',
    'The smoke test checks that the Phoenix reporting override appears as `Phoenix, AZ` and that `Phoneix` is absent.',
    '',
    '```',
    output,
    '```',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px;color:#111827;">
      <h1 style="font-size:20px;">Wabash location smoke test failed</h1>
      <p><strong>Base URL:</strong> ${escapeHtml(baseUrl)}</p>
      <p><strong>Exit code:</strong> ${escapeHtml(result.code)}</p>
      <p>The smoke test checks that the Phoenix reporting override appears as <strong>Phoenix, AZ</strong> and that <strong>Phoneix</strong> is absent.</p>
      <pre style="white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">${escapeHtml(output)}</pre>
    </div>
  `

  const notificationResults = await Promise.allSettled([
    sendSlackAlert(summary),
    sendEmailAlert(subject, html),
  ])

  const sentAny = notificationResults.some((result) => result.status === 'fulfilled' && result.value)
  const errors = notificationResults
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))

  if (!sentAny) {
    console.warn('Smoke test failed, but no alert was sent. Configure SLACK_WEBHOOK_URL or RESEND_API_KEY + SMOKE_TEST_FROM_EMAIL + SMOKE_TEST_ALERT_EMAIL.')
  }

  errors.forEach((error) => console.warn(`Alert delivery failed: ${error}`))
}

const result = await runSmokeTest()

if (result.code !== 0) {
  await notifyFailure(result)
  process.exit(result.code)
}

console.log('Wabash location smoke test passed.')
