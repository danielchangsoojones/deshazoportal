# Wabash Location Smoke Test

This smoke test verifies that the known high-dollar Wabash installation stays bucketed to `Phoenix, AZ` instead of falling back to its original Jonestown source location.

Protected install:

- Work order: `61077`
- Job number: `0265909`
- Source location in database: `Jonestown, PA`
- Required reporting bucket: `Phoenix, AZ`

## Commands

```bash
npm run smoke:locations:test
```

Runs the Playwright test directly.

```bash
npm run smoke:locations
```

Runs the wrapper. On failure it sends Slack and/or email alerts when notification environment variables are configured.

## Required Environment Variables

- `SMOKE_TEST_BASE_URL`: production app URL, for example `https://portal.blockstampsf.com`
- `SMOKE_TEST_EMAIL`: Supabase login email for a dedicated smoke-test user
- `SMOKE_TEST_PASSWORD`: Supabase login password for that user

## Optional Alert Variables

Slack:

- `SLACK_WEBHOOK_URL`

Email through Resend:

- `RESEND_API_KEY`
- `SMOKE_TEST_FROM_EMAIL`
- `SMOKE_TEST_ALERT_EMAIL`: comma-separated recipient list

## Heroku Scheduler

Playwright needs a Chromium runtime on Heroku. Add a Playwright/Chrome buildpack for the app before relying on Scheduler. For the Playwright Heroku buildpack, configure only Chromium to keep the slug smaller:

```bash
heroku config:set PLAYWRIGHT_BUILDPACK_BROWSERS=chromium
```

Configure Heroku Scheduler to run:

```bash
npm run smoke:locations
```

The job stays quiet when the smoke test passes and sends alerts only when it fails.
