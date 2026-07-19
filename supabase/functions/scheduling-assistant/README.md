# Scheduling Assistant Edge Function

Authenticated, cost-bounded scheduling pipeline for the portal scheduling page.

## Pipeline

1. GPT-4o mini receives only the user's sentence and visible date range and converts them into structured search constraints.
2. The Edge Function checks the complete supplied schedule locally and creates a maximum of 48 non-overlapping candidate slots.
3. Claude Fable 5 receives only that shortlist, nearby evidence, and aggregate counts for final ranking and rationale.
4. The response includes provider token usage and an estimated request cost for display in the developer-only UI.

If OpenAI is temporarily unavailable, deterministic request parsing is used and the scheduling request can still continue.

## Security model

- Supabase JWT verification remains enabled at the Edge Function gateway.
- The function validates the calling user and requires `public.user_tags.tag = 'developer'`.
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are read only from Supabase project secrets.
- The browser never receives either provider credential.
- OpenAI receives no schedule, employee, customer, or work-order records.
- OpenAI response storage is disabled for the request interpreter.
- Payloads are capped at 300 resources, 3,000 events, 200 pending work orders, and 3 MB total.
- Responses are read-only scheduling suggestions; the function has no schedule-write capability.

## Required secrets

```sh
supabase secrets set --project-ref <project-ref> ANTHROPIC_API_KEY=<secret>
supabase secrets set --project-ref <project-ref> OPENAI_API_KEY=<secret>
```

Do not put the key in a Vite environment variable or any committed `.env` file.

## Deploy

```sh
supabase functions deploy scheduling-assistant --project-ref <project-ref> --use-api
```
