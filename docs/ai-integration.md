> **Current MVP:** See [hackathon-demo.md](hackathon-demo.md) for current setup and workflows. The gateway now defaults to `gpt-6.1-sol`, reads `backend/.env`, and supports validated connection, firmware, review, specification and placement proposals in addition to the original actions. Bounded context now includes relevant component IDs, terminal IDs and connections; existing firmware source is never sent. This document's original Phase 4 Step 1 description below is historical.

# Phase 4, Step 1 — optional AI Guide

The React/Three.js application still works without a backend. A small FastAPI service adds read-only hardware explanations through the official OpenAI Python SDK. No database, tool execution, autonomous editing, project generation, or compiler has been added.

## Start locally

Use Python 3.10+ and Node 20.19+ (or 22.12+). From the repository root:

```sh
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
cp -n .env.example .env
# Edit .env locally: set OPENAI_API_KEY and, if needed, OPENAI_MODEL.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

In a second terminal at the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend on loopback port 8000. Set additional exact development origins in `CORS_ORIGINS` if you use another frontend origin/port. There is no frontend API key or `VITE_OPENAI_API_KEY`. `.env` is ignored; environment variables override that file. Restart the backend after changing settings.

Leave the key blank to test fallback. **Demo Assistant · local** stays usable when the key is absent or the backend is offline. With a configured backend, the guide switches to **AI Guide · online**. The mode selector always allows local commands, and **Check AI connection** retries health discovery. Health reports configuration, not whether the key has sufficient quota/model permissions. Provider errors appear when a chat request is attempted.

**Local shortcuts** always execute the existing deterministic commands. AI requests and AI responses never execute local commands, including after an error. Catalog details use the same guide service for **Explain this component**.

## Request and response contract

`GET /api/health` returns configuration and catalog availability without secrets:

```json
{"status":"ok","ai_configured":false,"model":null,"catalog_count":29}
```

`POST /api/ai/chat`, Content-Type `application/json`:

```json
{
  "messages": [{"role":"user","content":"Explain this component"}],
  "context": {
    "project_name":"Smart Cooling Controller",
    "selected_component_id":"mcu",
    "selected_component_type":"microcontroller",
    "catalog_ids":["rp2040"]
  }
}
```

Context is optional. Only send an actual catalog identity; a generic demo MCU does not imply RP2040. Messages accept `user` or `assistant`, must end with `user`, and have limits of 10 messages, 4,000 characters per message, 12,000 combined characters, and 20 KB per request. Unknown properties, unknown catalog IDs and client-supplied specifications/model overrides are rejected. At most three context catalog IDs are accepted.

Success returns `mode: "ai"`, `request_id`, `answer`, `missing_data`, `unverified_recommendations`, `cited_catalog_ids`, server-resolved `references` and a fixed verification `notice`. The frontend displays these as plain text, not executable HTML or commands. It sends only the latest question and a small context snapshot; displayed conversation history, C source, scene transforms, full project files and API keys are not sent. The endpoint supports bounded conversation history for a future richer client.

Errors return:

```json
{"error":{"code":"AI_NOT_CONFIGURED","message":"Live AI is not configured. Choose the local Demo Assistant.","retryable":false,"request_id":"..."}}
```

| HTTP | Codes |
| --- | --- |
| 403 | `ORIGIN_NOT_ALLOWED` |
| 413 / 415 | `REQUEST_TOO_LARGE` / `INVALID_CONTENT_TYPE` |
| 422 | `INVALID_INPUT`, `INVALID_CONTEXT`, `AI_REFUSED` |
| 429 | `RATE_LIMITED`, `UPSTREAM_RATE_LIMIT` (also `Retry-After: 60`) |
| 502 | `UPSTREAM_UNAVAILABLE`, `UPSTREAM_ERROR`, `INVALID_AI_RESPONSE`, `AI_INCOMPLETE` |
| 503 | `AI_NOT_CONFIGURED`, `UPSTREAM_AUTH_ERROR` |
| 504 | `UPSTREAM_TIMEOUT` |
| 500 | `INTERNAL_ERROR` |

Failures do not include upstream exception text, request contents or credentials. Correlate issues using `X-Request-ID`. Requests and prompts are not logged by application code.

## Catalog grounding and its limits

`src/catalog/parts.json` is the single authoritative 29-record catalog used by both the TypeScript adapter and Python loader. Existing values and provenance are preserved. The backend resolves explicit catalog IDs, then matches exact names, part numbers or manufacturer phrases in the last message, supplying at most six records. No client-provided specification is trusted.

The instructions require missing facts to remain unknown and recommendations to be unverified. Source links are resolved from server catalog records, and citations to IDs outside the supplied context are rejected. All current catalog records are partial. Generic scene components without an exact catalog ID do not receive invented specifications. This is bounded retrieval and model guidance, **not a factual verifier**; natural-language claims can still be wrong. The guide does not establish compatibility or electrical safety and does not fetch or re-verify manufacturer pages at runtime.

The implementation uses [`responses.parse` with a Pydantic schema](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). `OPENAI_MODEL` must support Responses structured outputs; the default is `gpt-4.1-mini`. `store=False` disables API response storage for this request; it is not a promise about all provider retention policies. Automatic SDK retries are disabled; a total timeout and maximum output-token budget bound each call.

## Development security boundary

Run one backend worker bound to loopback. CORS allows only configured exact origins, with no credentials or wildcards. Unlisted browser origins are rejected before chat processing. The process allows two in-flight AI requests and a configurable global rolling rate limit (default 20/minute); no user-IP header is trusted. The limit resets on restart and is not shared across workers.

This is a local-development service, **not an authenticated public API**. CORS is not authentication. Before public hosting, add authenticated access, durable/shared rate and spending controls, HTTPS, request limits at the reverse proxy, and operational monitoring. Production frontend hosting must route same-origin `/api` requests to the backend; the Vite development proxy is not part of static `dist/`. Package the shared catalog JSON alongside the backend. No public deployment is included here.

## Validation commands

```sh
python3 -m unittest discover -s backend/tests -v
npm test
npm run lint
npm run build
npm run test:e2e
```

Backend tests use in-process ASGI requests, mocked model responses, and the real SDK with `httpx.MockTransport`; they need no key, paid API request or listening socket. A live provider call remains a separate verification step.

## Changed files

- New: `backend/config.py`, `backend/models.py`, `backend/catalog.py`, `backend/main.py`, `backend/requirements.txt`, `backend/tests/test_api.py`.
- New: `.env.example`, `src/catalog/parts.json`, `src/ai/client.ts`, `src/ai/store.ts`, `tests/ai-guide.test.tsx`, this document.
- Updated: `src/catalog/parts.ts` (shared JSON adapter), `src/catalog/ComponentsWorkspace.tsx`, `src/components/layout/CommandBar.tsx`, `src/styles/index.css`, `vite.config.ts`, `README.md`, `AGENTS.md`, `docs/validation.md`.
- No scene, firmware, project save schema, transform or animation implementation changed.
