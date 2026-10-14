"""AI-1 evaluations use real context assembly and a mocked provider, never paid calls."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.catalog import CATALOG, retrieve
from backend.config import Settings
from backend.main import create_app
from backend.mentor import mentor_evidence, invalid_distance_sensor_action
from backend.models import ChatRequest, GuideAnswer, DesignAction


class MentorTests(unittest.TestCase):
    def request(self, question, **intent):
        return ChatRequest.model_validate({
            'messages': [{'role': 'user', 'content': question}],
            'context': {'project_intent': intent},
        })

    def test_a_goal_recognition_not_pcb_geometry(self):
        request = self.request('I want to measure the distance to objects 1–2 meters away.')
        self.assertEqual(mentor_evidence(request, CATALOG)['intended_function'], 'object-distance measurement')

    def test_e_catalog_honesty_checks_entire_catalog(self):
        request = self.request('You choose what works best.', intended_function='object-distance measurement')
        evidence = mentor_evidence(request, CATALOG)
        self.assertTrue(evidence['catalog_search']['missing_required_sensor'])
        self.assertEqual(evidence['catalog_search']['records_checked'], len(CATALOG))
        self.assertEqual(evidence['catalog_search']['candidate_ids'], [])
        self.assertIn('tmp102', evidence['excluded_as_distance_sensors'])
        self.assertIn('bme280', evidence['excluded_as_distance_sensors'])

    def test_b_c_d_actual_conversation_corrections_and_mode_reach_provider(self):
        response = GuideAnswer(answer='I asked about the environment because it changes sensor choice.',
            missing_data=['Sensor selection unresolved'], unverified_recommendations=[], cited_catalog_ids=[])
        parse = AsyncMock(return_value=SimpleNamespace(status='completed', output=[], output_parsed=response))
        sdk = SimpleNamespace(responses=SimpleNamespace(parse=parse))
        payload = {
            'messages': [
                {'role': 'user', 'content': 'I want to measure the distance to objects 1–2 meters away.'},
                {'role': 'assistant', 'content': 'Will you use it indoors or outdoors?'},
                {'role': 'user', 'content': 'What did you mean by your last question?'},
            ],
            'context': {'project_intent': {
                'primary_goal': 'Measure distance to physical objects',
                'intended_function': 'object-distance measurement',
                'requirements': ['1–2 meters (user supplied)'],
                'corrections': ["I don't need a temperature sensor."],
                'decisions': ['I am a beginner. You choose what works best.'],
            }, 'conversation_omitted': {'messages': 5, 'characters': 10}},
        }
        with TestClient(create_app(Settings(api_key='test'), sdk)) as client:
            for mode in ['beginner', 'engineer']:
                payload['explanation_mode'] = mode
                result = client.post('/api/ai/chat', json=payload)
                self.assertEqual(result.status_code, 200, result.text)
                args = parse.call_args.kwargs
                prompt = json.loads(args['input'][0]['content'])
                self.assertEqual(prompt['conversation'], payload['messages'])
                self.assertEqual(prompt['explanation_mode'], mode)
                self.assertEqual(prompt['untrusted_project_context']['project_intent']['corrections'], ["I don't need a temperature sensor."])
                self.assertTrue(prompt['mentor_evidence']['catalog_search']['missing_required_sensor'])
                self.assertIn('plain\nEnglish', args['instructions'])
                self.assertIn('at most\none necessary clarifying question', args['instructions'])
                self.assertIn('cannot measure object distance', args['instructions'])
                self.assertIn("Do not treat delegation or 'let's use that' as project-edit approval", args['instructions'])
                self.assertFalse(args['store'])
        self.assertEqual(ChatRequest.model_validate({**payload, 'explanation_mode': 'beginner'}).explanation_mode, 'beginner')

    def test_bounded_memory_and_unknown_fields_cannot_override_actions(self):
        for context in [
            {'project_intent': {'requirements': ['x'] * 13}},
            {'project_intent': {'primary_goal': 'x' * 501}},
            {'project_intent': {'execute_without_approval': True}},
            {'conversation_omitted': {'messages': -1}},
        ]:
            with self.assertRaises(ValidationError):
                ChatRequest.model_validate({'messages': [{'role': 'user', 'content': 'hello'}], 'context': context})

    def test_catalog_retrieval_uses_current_controller_without_requiring_name_in_followup(self):
        request = ChatRequest.model_validate_json(json.dumps({
            'messages': [{'role': 'user', 'content': 'What should I do next?'}],
            'context': {'project_components': [{'id': 'controller', 'name': 'RP2040',
                'catalog_id': 'rp2040', 'position': [0, 0, 0]}]},
        }))
        self.assertIn('rp2040', [p['id'] for p in retrieve(request)])

    def test_distinct_functions_and_explicit_goal_change(self):
        for text, expected in [
            ('Measure distance between PCB components', 'PCB component spacing'),
            ('I want wireless power transfer', 'wireless power transfer'),
            ('I want wireless data communication', 'wireless data communication'),
            ('I want to measure temperature', 'temperature measurement'),
        ]:
            self.assertEqual(mentor_evidence(self.request(text), CATALOG)['intended_function'], expected)

    def test_wrong_sensor_proposals_rejected_but_explicit_auxiliary_part_allowed(self):
        for identity in ('tmp102', 'bme280'):
            action = DesignAction(type='add_component', catalog_id=identity)
            for text in ("Choose what works best", "I don't need a temperature sensor"):
                request = self.request(text, intended_function='object-distance measurement')
                self.assertTrue(invalid_distance_sensor_action(request, action, CATALOG))
            request = self.request('Add temperature sensing for ambient compensation', intended_function='object-distance measurement')
            self.assertFalse(invalid_distance_sensor_action(request, action, CATALOG))

    def test_gateway_rejects_a_temperature_sensor_substitution(self):
        answer = GuideAnswer(answer='Use this sensor', missing_data=[], unverified_recommendations=[],
            cited_catalog_ids=[], actions=[DesignAction(type='add_component', catalog_id='tmp102')])
        parse = AsyncMock(return_value=SimpleNamespace(status='completed', output=[], output_parsed=answer))
        sdk = SimpleNamespace(responses=SimpleNamespace(parse=parse))
        request = self.request('Choose what works best.', intended_function='object-distance measurement')
        with TestClient(create_app(Settings(api_key='test'), sdk)) as client:
            response = client.post('/api/ai/chat', json=request.model_dump())
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json()['error']['code'], 'INVALID_AI_RESPONSE')
            self.assertNotIn('actions', response.json())
