"""Safety and response-length tests for AI-proposed design edits."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from backend.config import Settings
from backend.main import create_app
from backend.models import DesignAction, GuideAnswer


class DesignActionTests(unittest.TestCase):
    def setUp(self):
        self.ai = AsyncMock()
        self.sdk = SimpleNamespace(responses=SimpleNamespace(parse=self.ai))
        self.client = TestClient(create_app(Settings(api_key="fake-local-test-key"), self.sdk))
        self.client.__enter__()
        self.payload = {
            "messages": [{"role": "user", "content": "Add an RP2040"}],
            "response_length": "concise",
            "context": {
                "catalog_ids": ["rp2040"],
                "project_components": [
                    {"id": "pcb", "name": "PCB", "fixed": True, "position": [0, 0, 0]},
                    {"id": "sensor", "name": "Sensor", "fixed": False, "position": [1, 1, 1]},
                ],
            },
        }

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def result(self, actions):
        return SimpleNamespace(status="completed", output=[], output_parsed=GuideAnswer(
            answer="Ready for review.", cited_catalog_ids=[], missing_data=[],
            unverified_recommendations=[], actions=actions))

    def test_valid_action_is_only_returned_as_proposal(self):
        self.ai.return_value = self.result([DesignAction(type="add_component", catalog_id="rp2040", position=(2, 1, 0))])
        result = self.client.post('/api/ai/chat', json=self.payload)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['actions'][0]['type'], 'add_component')
        self.assertIn('approval', result.json()['notice'])
        prompt = json.loads(self.ai.call_args.kwargs['input'][0]['content'])
        self.assertEqual(prompt['response_length'], 'concise')
        self.assertEqual(prompt['untrusted_project_context']['project_components'][0]['id'], 'pcb')
        self.assertIn('rp2040', [p['id'] for p in prompt['available_insertable_parts']])
        self.assertNotIn('api_key', prompt)

    def test_unknown_component_or_catalog_is_rejected(self):
        for action in [
            DesignAction(type='add_component', catalog_id='invented'),
            DesignAction(type='add_component', catalog_id='i5-12400'),
            DesignAction(type='move_component', component_id='not-in-project', position=(1,1,1)),
            DesignAction(type='remove_component', component_id='pcb'),
        ]:
            self.ai.return_value = self.result([action])
            with self.subTest(action=action.type):
                response = self.client.post('/api/ai/chat', json=self.payload)
                self.assertEqual(response.status_code, 502, response.text)
                self.assertEqual(response.json()['error']['code'], 'INVALID_AI_RESPONSE')

    def test_create_project_standalone_and_strict_coordinates(self):
        self.ai.return_value = self.result([
            DesignAction(type='create_project', template_id='iot', project_name='My smart system')])
        self.assertEqual(self.client.post('/api/ai/chat', json=self.payload).status_code, 200)
        self.ai.return_value = self.result([
            DesignAction(type='create_project', template_id='iot', project_name='My smart system'),
            DesignAction(type='select_component', component_id='sensor')])
        self.assertEqual(self.client.post('/api/ai/chat', json=self.payload).status_code, 502)
        invalid = {**self.payload, 'response_length': 'unlimited'}
        self.assertEqual(self.client.post('/api/ai/chat', json=invalid).status_code, 422)
        invalid = {**self.payload, 'context': {
            'project_components': [{'id': 'sensor', 'name': 'Sensor', 'position': [999,0,0]}]}}
        self.assertEqual(self.client.post('/api/ai/chat', json=invalid).status_code, 422)


if __name__ == '__main__':
    unittest.main()
