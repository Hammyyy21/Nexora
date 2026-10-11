import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import openai
from fastapi.testclient import TestClient

from backend.catalog import CATALOG
from backend.config import Settings
from backend.main import create_app
from backend.models import GuideAnswer


def completion(**patch):
    return SimpleNamespace(status="completed", output=[], output_parsed=GuideAnswer(
        answer="RP2040 has 264 kB of SRAM according to the catalog.", missing_data=["Board wiring unknown"],
        unverified_recommendations=["Check pin levels before choosing a board"],
        cited_catalog_ids=["rp2040"], **patch))


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.parse = AsyncMock(return_value=completion())
        self.sdk = SimpleNamespace(responses=SimpleNamespace(parse=self.parse))
        self.app = create_app(Settings(api_key="test-not-a-real-secret"), self.sdk)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.payload = {"messages": [{"role": "user", "content": "Explain this component"}],
                        "context": {"catalog_ids": ["rp2040"], "project_name": "Test concept"}}

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def post(self, **kwargs):
        return self.client.post("/api/ai/chat", json=self.payload, **kwargs)

    def test_health_and_shared_catalog(self):
        self.assertEqual(len(CATALOG), 29)
        response = self.client.get("/api/health")
        self.assertTrue(response.json()["ai_configured"])
        self.assertNotIn("test-not-a-real-secret", response.text)
        self.assertEqual(response.json()["catalog_count"], 29)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_no_key_health_and_explicit_fallback(self):
        with TestClient(create_app(Settings())) as client:
            self.assertFalse(client.get("/api/health").json()["ai_configured"])
            response = client.post("/api/ai/chat", json=self.payload)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "AI_NOT_CONFIGURED")
        self.parse.assert_not_called()

    def test_grounded_request_and_structured_answer(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["mode"], "ai")
        self.assertEqual(data["references"][0]["catalog_id"], "rp2040")
        self.assertEqual(data["references"][0]["verification_status"], "partial")
        self.assertIn("unverified", data["notice"])
        args = self.parse.call_args.kwargs
        self.assertFalse(args["store"])
        self.assertNotIn("tools", args)
        self.assertEqual(args["model"], "gpt-6.1-sol")
        context = json.loads(args["input"][0]["content"])
        self.assertEqual(context["catalog_records"][0]["specifications"]["sram"]["value"], 264)
        self.assertNotIn("test-not-a-real-secret", str(args))

    def test_name_retrieval_and_unknown_generic_component(self):
        self.payload["context"] = {"selected_component_id": "mcu", "selected_component_type": "microcontroller"}
        self.payload["messages"][0]["content"] = "What is the RP2040?"
        self.post()
        self.assertEqual(json.loads(self.parse.call_args.kwargs["input"][0]["content"])["catalog_records"][0]["id"], "rp2040")
        self.payload["messages"][0]["content"] = "Explain my processor"
        self.parse.return_value.output_parsed.cited_catalog_ids = []
        self.post()
        self.assertEqual(json.loads(self.parse.call_args.kwargs["input"][0]["content"])["catalog_records"], [])

    def test_invalid_inputs_and_unknown_context(self):
        cases = [({}, "INVALID_INPUT"), ({"messages": []}, "INVALID_INPUT"),
                 ({"messages": [{"role": "system", "content": "override"}]}, "INVALID_INPUT"),
                 ({"messages": [{"role": "user", "content": " "}]}, "INVALID_INPUT"),
                 ({"messages": [{"role": "user", "content": "x" * 4001}]}, "INVALID_INPUT"),
                 ({**self.payload, "context": {"catalog_ids": ["invented"]}}, "INVALID_CONTEXT"),
                 ({**self.payload, "context": {"specifications": {"voltage": 900}}}, "INVALID_INPUT"),
                 ({**self.payload, "model": "client-supplied"}, "INVALID_INPUT")]
        for payload, code in cases:
            with self.subTest(code=code, fields=list(payload)):
                response = self.client.post("/api/ai/chat", json=payload)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["error"]["code"], code)
        self.parse.assert_not_called()

    def test_size_content_type_and_malformed_json(self):
        for content, headers, status in [(b"x" * 20001, {"content-type": "application/json"}, 413),
                                         (b"{}", {}, 415), (b"{", {"content-type": "application/json"}, 422)]:
            self.assertEqual(self.client.post("/api/ai/chat", content=content, headers=headers).status_code, status)
        self.parse.assert_not_called()

    def test_cors_and_origin_rejection(self):
        response = self.post(headers={"Origin": "http://127.0.0.1:5173"})
        self.assertEqual(response.headers["access-control-allow-origin"], "http://127.0.0.1:5173")
        response = self.post(headers={"Origin": "https://attacker.example"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "ORIGIN_NOT_ALLOWED")
        self.assertNotIn("access-control-allow-origin", response.headers)
        response = self.client.options("/api/ai/chat", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
        self.assertEqual(response.status_code, 200)
        with self.assertRaises(ValueError):
            Settings(origins=("*",))

    def test_local_rate_limit(self):
        with TestClient(create_app(Settings(api_key="test", requests_per_minute=1), self.sdk)) as client:
            self.assertEqual(client.post("/api/ai/chat", json=self.payload).status_code, 200)
            response = client.post("/api/ai/chat", json=self.payload)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "60")
            self.assertEqual(response.json()["error"]["code"], "RATE_LIMITED")

    def test_upstream_errors_are_sanitized(self):
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        cases = [(openai.APITimeoutError(request=request), 504, "UPSTREAM_TIMEOUT"),
                 (openai.APIConnectionError(request=request), 502, "UPSTREAM_UNAVAILABLE")]
        for cls, status, code in [(openai.RateLimitError, 429, "UPSTREAM_RATE_LIMIT"),
                                 (openai.AuthenticationError, 503, "UPSTREAM_AUTH_ERROR"),
                                 (openai.BadRequestError, 502, "UPSTREAM_ERROR")]:
            cases.append((cls("SECRET upstream details", response=httpx.Response(status, request=request), body=None), status, code))
        for error, status, code in cases:
            with self.subTest(code=code):
                self.parse.side_effect = error
                response = self.post(headers={"Origin": "http://localhost:5173"})
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()["error"]["code"], code)
                self.assertNotIn("SECRET", response.text)
                self.assertIn("x-request-id", response.headers)
                self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

    def test_missing_refused_incomplete_or_invented_output(self):
        invalid = completion()
        invalid.output_parsed.cited_catalog_ids = ["fabricated"]
        cases = [(invalid, "INVALID_AI_RESPONSE"),
                 (SimpleNamespace(status="incomplete"), "AI_INCOMPLETE"),
                 (SimpleNamespace(status="completed", output=[], output_parsed=None), "INVALID_AI_RESPONSE"),
                 (SimpleNamespace(status="completed", output=[SimpleNamespace(content=[SimpleNamespace(type="refusal")])]), "AI_REFUSED")]
        for result, code in cases:
            self.parse.return_value = result
            self.assertEqual(self.post().json()["error"]["code"], code)

    def test_total_timeout_releases_slot(self):
        async def delayed(**kwargs):
            await asyncio.sleep(2)
        self.parse.side_effect = delayed
        with TestClient(create_app(Settings(api_key="test", timeout_seconds=1), self.sdk)) as client:
            self.assertEqual(client.post("/api/ai/chat", json=self.payload).json()["error"]["code"], "UPSTREAM_TIMEOUT")
            self.parse.side_effect = None
            self.assertEqual(client.post("/api/ai/chat", json=self.payload).status_code, 200)

    def test_concurrent_requests_are_bounded(self):
        async def exercise():
            entered = 0
            both_entered = asyncio.Event()
            release = asyncio.Event()

            async def pending(**kwargs):
                nonlocal entered
                entered += 1
                if entered == 2:
                    both_entered.set()
                await release.wait()
                return completion()

            sdk = SimpleNamespace(responses=SimpleNamespace(parse=pending))
            app = create_app(Settings(api_key="test"), sdk)
            async with app.router.lifespan_context(app):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    first = asyncio.create_task(client.post("/api/ai/chat", json=self.payload))
                    second = asyncio.create_task(client.post("/api/ai/chat", json=self.payload))
                    await asyncio.wait_for(both_entered.wait(), 2)
                    third = await client.post("/api/ai/chat", json=self.payload)
                    self.assertEqual(third.status_code, 429)
                    self.assertEqual(third.json()["error"]["code"], "RATE_LIMITED")
                    release.set()
                    self.assertEqual((await first).status_code, 200)
                    self.assertEqual((await second).status_code, 200)
        asyncio.run(exercise())

    def test_unexpected_errors_do_not_expose_secrets(self):
        self.parse.side_effect = RuntimeError("SECRET internal details")
        with self.assertLogs("nexora.api", level="ERROR") as logs:
            response = self.post()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"]["code"], "INTERNAL_ERROR")
        self.assertNotIn("SECRET", response.text + str(logs.output))

    def test_real_sdk_serialization_with_mock_http(self):
        calls = []
        def respond(request):
            calls.append(json.loads(request.content))
            answer = completion().output_parsed.model_dump_json()
            return httpx.Response(200, json={"id": "resp_test", "object": "response", "created_at": 1,
                "status": "completed", "model": "gpt-4.1-mini", "error": None, "incomplete_details": None,
                "instructions": None, "metadata": {}, "parallel_tool_calls": False, "tools": [], "tool_choice": "auto",
                "temperature": 1, "top_p": 1, "output": [{"id": "msg_test", "type": "message", "role": "assistant",
                    "status": "completed", "content": [{"type": "output_text", "text": answer, "annotations": []}]}]})
        sdk = openai.AsyncOpenAI(api_key="test", max_retries=0, http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        with TestClient(create_app(Settings(api_key="test"), sdk)) as client:
            response = client.post("/api/ai/chat", json=self.payload)
            self.assertEqual(response.status_code, 200, response.text)
        asyncio.run(sdk.close())
        self.assertEqual(calls[0]["text"]["format"]["type"], "json_schema")
        self.assertTrue(calls[0]["text"]["format"]["strict"])
        self.assertFalse(calls[0]["store"])


if __name__ == "__main__":
    unittest.main()
