# Wiring n8n → real-time attention alerts

The Backoffice posts attention items in near-real-time when a workflow fails. On
Vercel Hobby (which caps crons at once/day), this webhook is the real-time driver;
on Pro you can additionally bump `/api/cron/notify` in `vercel.json` to `*/15 * * * *`.

## One-time setup in n8n
1. Create a workflow named **"Backoffice error hook"** with a single **Error Trigger** node.
2. Add an **HTTP Request** node wired to the trigger:
   `POST https://<your-app>/api/n8n/execution?secret=<N8N_WEBHOOK_SECRET>`
3. In **Settings → Error Workflow** of every workflow you want covered (or the
   instance-wide default), select **"Backoffice error hook"**.

## Env
Set `N8N_WEBHOOK_SECRET` in Vercel (any long random string) to match the query
`?secret=` above (or send it as the `x-n8n-secret` header). Requests without a
matching secret get `401`. If the env var is unset the endpoint is closed (401).

## Behaviour
Each error event triggers one **full** sweep, debounced to once per 30s. Because
it's a full sweep it also surfaces any new non-incident items (prompt / ownership /
governance / structure changes) detected since the last run — not just the failure
that fired it. Items already sent (by a prior sweep or the daily brief) are skipped,
and an item re-alerts only after its condition resolves and recurs.
