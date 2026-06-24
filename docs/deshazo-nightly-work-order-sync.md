# DeShazo Nightly Work Order Sync

This project includes a Heroku Scheduler command for syncing DeShazo work orders and inspection documents into Supabase.

## Command

Use this Heroku Scheduler command:

```sh
npm run sync:deshazo-work-orders:nightly
```

The command calls:

```text
POST /api/external/work-orders/sync?page=1&pageSize=50&maxPages=5&latestByDate=true
```

## Required Heroku Config Vars

Set these on the Heroku app that runs the sync backend:

```sh
heroku config:set DESHAZO_SYNC_API_BASE_URL="https://deshazo-api.belovedrobot.com" --app YOUR_HEROKU_APP
heroku config:set DESHAZO_EXTERNAL_API_KEY="your-api-key" --app YOUR_HEROKU_APP
```

If that backend does not expose `/api/external/work-orders/sync`, either point
`DESHAZO_SYNC_API_BASE_URL` at the backend that does expose that route, or set
the route separately:

```sh
heroku config:set DESHAZO_SYNC_API_PATH="/api/external/work-orders/sync" --app YOUR_HEROKU_APP
```

Optional tuning:

```sh
heroku config:set DESHAZO_NIGHTLY_SYNC_PAGE_SIZE="50" --app YOUR_HEROKU_APP
heroku config:set DESHAZO_NIGHTLY_SYNC_MAX_PAGES="5" --app YOUR_HEROKU_APP
heroku config:set DESHAZO_NIGHTLY_SYNC_MODE="latestByDate" --app YOUR_HEROKU_APP
```

`DESHAZO_NIGHTLY_SYNC_MODE` can be:

- `latestByDate`: newest work orders first. Use this for normal nightly incremental sync.
- `nextMissingByDate`: backfill the next missing work orders from newest to oldest.
- `standard`: call the sync endpoint without either date mode flag.

Optional dry-run switch for testing command wiring without calling the sync endpoint:

```sh
heroku config:set DESHAZO_NIGHTLY_SYNC_DRY_RUN="true" --app YOUR_HEROKU_APP
```

Remove it or set it to `false` before enabling the real schedule.

## Test Before Scheduling

Run the command manually on Heroku:

```sh
heroku run npm run sync:deshazo-work-orders:nightly --app YOUR_HEROKU_APP
```

Then check logs:

```sh
heroku logs --ps run --app YOUR_HEROKU_APP
```

If the command fails with:

```text
Cannot POST /api/external/work-orders/sync
```

then the Heroku app is reachable, but the configured backend URL/path is wrong.
Fix `DESHAZO_SYNC_API_BASE_URL` or `DESHAZO_SYNC_API_PATH`, redeploy if needed,
and run the manual test again before scheduling.

## Schedule For 11 PM Eastern

Heroku Scheduler daily run times are configured in UTC.

- 11 PM Eastern Standard Time is `04:00` UTC.
- 11 PM Eastern Daylight Time is `03:00` UTC.

If you want the job to follow the Eastern wall clock year-round, update the Scheduler time when daylight saving changes. If you literally want 11 PM EST, use `04:00` UTC.

Setup:

```sh
heroku addons:create scheduler:standard --app YOUR_HEROKU_APP
heroku addons:open scheduler --app YOUR_HEROKU_APP
```

In the Scheduler dashboard:

1. Click `Add Job`.
2. Command: `npm run sync:deshazo-work-orders:nightly`
3. Frequency: `Daily`
4. Time: `04:00 UTC` for 11 PM EST, or `03:00 UTC` for 11 PM EDT.
5. Save.

## Monitoring

Heroku Scheduler runs one-off dynos. Check the job output with:

```sh
heroku logs --ps scheduler --app YOUR_HEROKU_APP
```

The app's Documents page also reads `deshazo_external_sync_checkpoints` and `deshazo_external_work_orders.synced_at` to show the latest sync time.
