# Extend Workflow Runs

Use Extend to send a document into a configured workflow and track the resulting workflow run.

Docs: https://docs.extend.ai/developers/api-reference/endpoints/workflow/create-workflow-run

## Endpoint

```http
POST https://api.extend.ai/workflow_runs
Authorization: Bearer <EXTEND_API_TOKEN>
Content-Type: application/json
x-extend-api-version: 2026-02-09
```

The `x-extend-api-version` header is optional when using the official SDK, but include it for direct HTTP requests so behavior stays pinned.

## Required Inputs

- `workflow.id`: the Extend workflow id to run, for example `wf_1234567890`.
- `file`: the file to process. Extend supports file input by URL, Extend file id, or raw text.

Common PDF-by-URL payload:

```json
{
  "workflow": {
    "id": "wf_1234567890"
  },
  "file": {
    "url": "https://example.com/document.pdf"
  },
  "metadata": {
    "source": "deshazoportal",
    "documentId": "local-or-supabase-document-id"
  }
}
```

## TypeScript SDK

```ts
import { ExtendClient } from "extend-ai"

const client = new ExtendClient({
  token: process.env.EXTEND_API_TOKEN,
  extendApiVersion: "2026-02-09",
})

const workflowRun = await client.workflowRuns.create({
  workflow: {
    id: process.env.EXTEND_WORKFLOW_ID,
  },
  file: {
    url: signedPdfUrl,
  },
  metadata: {
    source: "deshazoportal",
    documentId,
  },
})

console.log(workflowRun.id, workflowRun.status, workflowRun.dashboardUrl)
```

For shorter server-side jobs, the SDK also supports polling until the run reaches a terminal status:

```ts
const result = await client.workflowRuns.createAndPoll({
  workflow: {
    id: process.env.EXTEND_WORKFLOW_ID,
  },
  file: {
    url: signedPdfUrl,
  },
})

console.log(result.status, result.stepRuns)
```

Terminal statuses include `PROCESSED`, `FAILED`, `CANCELLED`, `NEEDS_REVIEW`, and `REJECTED`. For workflows that can take a long time, prefer Extend webhooks instead of long polling.

## Direct Fetch Example

```ts
type CreateExtendWorkflowRunInput = {
  workflowId: string
  fileUrl: string
  documentId?: string
}

export async function createExtendWorkflowRun(input: CreateExtendWorkflowRunInput) {
  const response = await fetch("https://api.extend.ai/workflow_runs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.EXTEND_API_TOKEN}`,
      "Content-Type": "application/json",
      "x-extend-api-version": "2026-02-09",
    },
    body: JSON.stringify({
      workflow: {
        id: input.workflowId,
      },
      file: {
        url: input.fileUrl,
      },
      metadata: {
        source: "deshazoportal",
        documentId: input.documentId,
      },
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Extend workflow run failed: ${response.status} ${message}`)
  }

  return response.json()
}
```

## Deshazo Portal Notes

- Keep `EXTEND_API_TOKEN` server-side only. Do not expose it through `VITE_` environment variables.
- For PDFs stored in Supabase private Storage, create a short-lived signed URL and pass that as `file.url`.
- Store the returned workflow run id, status, and `dashboardUrl` with the related document if the app needs to show processing progress later.
- Use `metadata` to connect Extend runs back to portal records, such as Supabase document ids, customer ids, asset ids, or quote ids.
- Use batch workflow runs for large groups of documents instead of looping many single requests from the browser.

## Response Fields To Persist

Useful fields from the response:

- `id`: Extend workflow run id.
- `status`: current workflow run status.
- `dashboardUrl`: direct Extend dashboard link.
- `workflow.id`: workflow that processed the file.
- `workflowVersion.id`: workflow version used for the run.
- `files`: Extend file records created for the run.
- `failureReason` and `failureMessage`: error details when processing fails.
