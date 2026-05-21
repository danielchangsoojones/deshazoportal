# Asset Report Notifications

This Edge Function sends `new report` notifications for units that have subscribers in `public.asset_notification_subscribers`.

## Required Supabase SQL

Run these SQL files in Supabase before deploying the function:

- `supabase/asset_notification_subscribers.sql`
- `supabase/asset_notification_events.sql`

## Required Environment Variables

Set these on the Supabase project for the function:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ASSET_NOTIFICATION_FROM_EMAIL`
- `PORTAL_PARSE_BASE_URL` (optional if using the default Parse URL in code)
- `PORTAL_PARSE_APP_ID` (optional if using the default Parse app id in code)
- `PORTAL_PARSE_REST_API_KEY` or `PORTAL_PARSE_MASTER_KEY`
- `ASSET_NOTIFICATION_FUNCTION_SECRET` (recommended)

## Deploy

```bash
supabase functions deploy asset-report-notifications
```

## First Run

Use `baseline` mode first so historical reports are marked as seen without emailing subscribers.

```bash
curl -X POST \
  'https://<project-ref>.functions.supabase.co/asset-report-notifications' \
  -H 'Content-Type: application/json' \
  -H 'x-notification-secret: <your-secret>' \
  -d '{"mode":"baseline"}'
```

## Live Send Run

After the baseline is complete, switch to normal `send` mode:

```bash
curl -X POST \
  'https://<project-ref>.functions.supabase.co/asset-report-notifications' \
  -H 'Content-Type: application/json' \
  -H 'x-notification-secret: <your-secret>' \
  -d '{"mode":"send"}'
```

## Optional Single-Unit Run

You can limit a run to one asset:

```bash
curl -X POST \
  'https://<project-ref>.functions.supabase.co/asset-report-notifications' \
  -H 'Content-Type: application/json' \
  -H 'x-notification-secret: <your-secret>' \
  -d '{"mode":"send","unitId":"UNIT123"}'
```

## Current Scope

- `new report` notifications are fully wired
- `repair completed` subscribers are still stored in the table, but no automatic sender is attached yet because the repo does not currently define a reliable repair-completion event source
