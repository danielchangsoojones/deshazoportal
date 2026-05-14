# Backend Endpoint: Deshazo Inspection Split

The portal calls a normal backend endpoint instead of a Supabase Edge Function.

Default URL used by the frontend:

```http
POST https://blockstamp-production-2b9f8bfc27a8.herokuapp.com/extend/deshazo-inspection-split
```

Override with:

```env
VITE_EXTEND_INSPECTION_SPLIT_UPLOAD_URL=https://your-backend.example.com/extend/deshazo-inspection-split
```

## Auth

The frontend sends the current Supabase access token:

```http
Authorization: Bearer <supabase-user-access-token>
```

Backend should verify the token with Supabase, then use the verified user id when inserting rows.

## Upload Request

```http
POST /extend/deshazo-inspection-split
Authorization: Bearer <supabase-user-access-token>
Content-Type: multipart/form-data
```

Form fields:

- `action`: `upload`
- `file`: PDF file

Backend steps:

1. Verify Supabase user token.
2. Insert a row into `jobs_quoting_runs` with status `uploading`.
3. Upload PDF to Extend.
4. Create an Extend workflow run using `EXTEND_INSPECTION_SPLIT_WORKFLOW_ID`.
5. Update `jobs_quoting_runs` with `extend_workflow_run_id`, status, and dashboard URL if available.
6. Return the run and an empty items list.

Expected JSON response:

```json
{
  "run": {
    "id": "uuid",
    "sourceFileName": "inspection.pdf",
    "status": "processing",
    "extendWorkflowRunId": "workflow_run_id",
    "extendWorkflowUrl": "https://dashboard.extend.ai/...",
    "errorMessage": null,
    "createdAt": "2026-05-13T00:00:00Z",
    "updatedAt": "2026-05-13T00:00:00Z"
  },
  "items": [],
  "message": "Inspection report sent to Extend. Use refresh when processing is complete."
}
```

## Sync Request

```http
POST /extend/deshazo-inspection-split
Authorization: Bearer <supabase-user-access-token>
Content-Type: application/json
```

Body:

```json
{
  "action": "sync",
  "runId": "uuid"
}
```

Backend steps:

1. Verify Supabase user token.
2. Load the matching `jobs_quoting_runs` row for the user.
3. Fetch the Extend workflow run by `extend_workflow_run_id`.
4. If status is not processed, update status and return existing items.
5. If processed, read split output files and extracted data.
6. Save split PDFs to Supabase Storage bucket `editable-inspection-documents`.
7. Insert matching rows into `editable_inspection_documents`.
8. Insert/update `jobs_quoting_items` only when `repair_count + safety_count > 0`.
9. Return run and items sorted by repair/safety count.

Expected JSON response:

```json
{
  "run": {
    "id": "uuid",
    "sourceFileName": "inspection.pdf",
    "status": "ready",
    "extendWorkflowRunId": "workflow_run_id",
    "extendWorkflowUrl": "https://dashboard.extend.ai/...",
    "errorMessage": null,
    "createdAt": "2026-05-13T00:00:00Z",
    "updatedAt": "2026-05-13T00:00:00Z"
  },
  "items": [
    {
      "id": "uuid",
      "runId": "uuid",
      "editableDocumentId": "uuid",
      "documentName": "D520987 - Repair Report",
      "splitType": "repair_or_safety_inspection_report",
      "splitIdentifier": "D520987",
      "repairCount": 2,
      "safetyCount": 1,
      "priorityCount": 3,
      "extendFileId": "file_id",
      "pdfUrl": "signed-supabase-url",
      "extractionData": {},
      "createdAt": "2026-05-13T00:00:00Z"
    }
  ],
  "message": "1 split report saved."
}
```

## Required Backend Secrets

Keep these backend-side only:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EXTEND_API_TOKEN=
EXTEND_INSPECTION_SPLIT_WORKFLOW_ID=workflow_...
EXTEND_API_VERSION=2025-04-21
```
