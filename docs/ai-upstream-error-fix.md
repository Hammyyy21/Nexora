# AI Guide: upstream request and Structured Outputs compatibility fix

This patch addresses a possible HTTP 400 rejection from the model-facing JSON Schema added with multi-project AI design actions. The previous schema exposed Pydantic implementation constraints such as `prefixItems` for fixed-length XYZ tuples, length limits, and defaults. It now sends a simpler nullable `AIResponseOutput` wire schema and **then** converts it back to the fully validated `GuideAnswer` and `DesignAction` models. This preserves safety checks and approval requirements.

The API also logs only request ID, upstream HTTP status, provider error code, and provider parameter. It never logs API keys, prompts, upstream bodies, or raw exception messages. A different provider error (e.g. unavailable model) is still possible and can be distinguished from server logs after installing this patch.

## Install on macOS

1. Back up `backend/main.py` and `backend/models.py`.
2. Merge the ZIP from `~/Downloads` into `~/Desktop` with `unzip -o ~/Downloads/Nexora_AI_Upstream_Fix.zip -d ~/Desktop`.
3. Keep `backend/.env` and the configured model unchanged.
4. Restart FastAPI from the Nexora root.

```bash
cd ~/Desktop/Nexora
backend/.venv/bin/python -m unittest discover -s backend/tests -v
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Then test “Remove cooling fan” in the AI tab. If it fails again, examine the FastAPI terminal for a line containing `AI upstream rejected request_id=`, which reports HTTP status, provider error code, and parameter without revealing private request data. Provide those fields only, not the contents of `backend/.env` or the raw provider response.

The full model request was not exercised from this offline container; tests are unit/mocked. The browser will still require user approval before modifying the project.
