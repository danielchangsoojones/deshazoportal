# Scheduled Jobs

## Top Crane Safety Digest

Heroku Scheduler does not support a native weekly schedule. Configure it to run hourly, and use the scheduled command below. The script only sends during Monday at 4:00 AM in `America/New_York`; all other hourly runs exit without sending.

Heroku Scheduler command:

```bash
npm run send:top-crane-safety-digest:scheduled
```

Scheduler frequency:

```text
Hourly at :00
```

Use this local dry run before enabling the scheduled send:

```bash
npm run send:top-crane-safety-digest:dry-run
```

Required Heroku config vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `TOP_CRANE_SAFETY_FROM_EMAIL` or `ASSET_NOTIFICATION_FROM_EMAIL`
- `TOP_CRANE_SAFETY_RECIPIENTS` as a comma-separated recipient list

Optional config vars:

- `TOP_CRANE_SAFETY_WINDOW_DAYS`, defaults to `30`
- `TOP_CRANE_SAFETY_MINIMUM_ISSUES`, defaults to `10`
- `TOP_CRANE_SAFETY_LIMIT`, defaults to `20`
- `TOP_CRANE_SAFETY_CUSTOMER`, filters to one normalized customer name
- `TOP_CRANE_SAFETY_SCHEDULE_TIME_ZONE`, defaults to `America/New_York`
- `TOP_CRANE_SAFETY_SCHEDULE_WEEKDAY`, defaults to `1` for Monday
- `TOP_CRANE_SAFETY_SCHEDULE_HOUR`, defaults to `4` for 4:00 AM

Optional one-off arguments:

```bash
node scripts/sendTopCraneSafetyDigest.mjs \
  --dry-run \
  --start-date=2026-05-01 \
  --end-date=2026-05-31 \
  --minimum-issues=10 \
  --limit=20 \
  --recipients=ops@example.com
```

Force a live send outside the scheduled window:

```bash
node scripts/sendTopCraneSafetyDigest.mjs --scheduled --force
```

The job reads inspection, crane, section, point, and work-order rows from Supabase, counts unique safety issue points with `REPAIR` or `DO NOT OPERATE / SAFETY` conditions, then sends one ranked digest through Resend.
