import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.config import Settings
from backend.main import create_app
from backend.models import BuildPlan, ChatRequest, GuideAnswer
from backend.plan_models import STAGES


def plan_fixture():
    return {
        'version': 1, 'goal_revision': 1, 'goal_fingerprint': 'test-goal', 'next_step_id': 'missing', 'omitted': 0,
        'goal': {'primary_goal': 'Measure distance to physical objects', 'intended_function': 'object-distance measurement',
                 'requirements': ['1–2 meters, user requirement'], 'decisions': ['Keep RP2040']},
        'recommendations': [
            {'role': 'controller', 'name': 'RP2040', 'availability': 'present', 'qualification': 'unverified',
             'catalog_id': 'rp2040', 'entity_ids': ['controller'], 'reason': 'Existing controller candidate'},
            {'role': 'distance sensor', 'name': 'distance sensor', 'availability': 'unavailable', 'qualification': 'unverified',
             'catalog_id': None, 'entity_ids': [], 'reason': 'No suitable sensor in the checked-in catalog'},
        ],
        'steps': [{'id': stage, 'stage': stage, 'title': stage, 'explanation': 'Explain this step plainly.',
                   'technical': 'Review documented constraints.', 'status': 'blocked' if stage=='missing' else 'needs_verification',
                   'dependencies': [], 'entities': ['controller'], 'evidence': ['Unverified editor state'],
                   'assumptions': [], 'unresolved': ['Documentation needed'], 'criteria': ['User review required'],
                   'fingerprint': 'test-fingerprint', 'verification': None} for stage in STAGES],
    }


class BuildPlanTests(unittest.TestCase):
    def test_bounded_versioned_schema_and_completion_provenance(self):
        plan = plan_fixture()
        self.assertEqual(BuildPlan.model_validate(plan).next_step_id, 'missing')
        variants = [dict(plan, version=2), dict(plan, steps=[]), dict(plan, execute='shell'),
                    dict(plan, recommendations=plan['recommendations']*5)]
        for payload in variants:
            with self.assertRaises(ValidationError):
                BuildPlan.model_validate(payload)
        plan['steps'][0]['status'] = 'completed'
        with self.assertRaises(ValidationError):
            BuildPlan.model_validate(plan)
        plan['steps'][0]['verification'] = {'source':'user','note':'I reviewed the requirements','fingerprint':'test-fingerprint'}
        self.assertEqual(BuildPlan.model_validate(plan).steps[0].verification.source, 'user')
        plan['steps'][0]['dependencies'] = ['testing']
        with self.assertRaises(ValidationError):
            BuildPlan.model_validate(plan)

    def test_plan_goal_and_beginner_next_step_reach_provider_with_catalog_evidence(self):
        answer=GuideAnswer(answer='Next, obtain documentation for a distance sensor. Time-of-flight times reflected light.',
                           missing_data=['Compatible sensor unavailable'],unverified_recommendations=[],cited_catalog_ids=[])
        parse=AsyncMock(return_value=SimpleNamespace(status='completed',output=[],output_parsed=answer))
        sdk=SimpleNamespace(responses=SimpleNamespace(parse=parse))
        plan=plan_fixture()
        payload={'messages':[{'role':'user','content':'What should I do next?'}],
                 'context':{'build_plan':plan,'project_intent':plan['goal'],'catalog_ids':['rp2040']}}
        with TestClient(create_app(Settings(api_key='test'),sdk)) as client:
            response=client.post('/api/ai/chat',json=payload)
            self.assertEqual(response.status_code,200,response.text)
            call=parse.call_args.kwargs
            sent=json.loads(call['input'][0]['content'])
            self.assertEqual(sent['untrusted_project_context']['build_plan']['next_step_id'],'missing')
            self.assertEqual(sent['untrusted_project_context']['build_plan']['recommendations'][0]['availability'],'present')
            self.assertIn('1–2 meters',sent['untrusted_project_context']['build_plan']['goal']['requirements'][0])
            self.assertTrue(sent['mentor_evidence']['catalog_search']['missing_required_sensor'])
            self.assertIn('ONE immediate practical step',call['instructions'])
            self.assertIn('not routed copper',call['instructions'])
            self.assertIn('Never\nclaim to mark steps complete',call['instructions'])
            self.assertEqual(sent['explanation_mode'],'beginner')
            self.assertEqual(response.json()['actions'],[])

    def test_model_cannot_return_plan_completion_as_an_executable_change(self):
        invalid={'answer':'I completed everything','missing_data':[],'unverified_recommendations':[],
                 'cited_catalog_ids':[],'actions':[],'build_plan':plan_fixture()}
        parse=AsyncMock(return_value=SimpleNamespace(status='completed',output=[],
            output_parsed=SimpleNamespace(model_dump_json=lambda:json.dumps(invalid))))
        with TestClient(create_app(Settings(api_key='test'),SimpleNamespace(responses=SimpleNamespace(parse=parse)))) as client:
            response=client.post('/api/ai/chat',json={'messages':[{'role':'user','content':'Finish my plan'}]})
            self.assertEqual(response.status_code,502)
            self.assertEqual(response.json()['error']['code'],'INVALID_AI_RESPONSE')

    def test_legacy_clients_can_omit_plan(self):
        self.assertIsNone(ChatRequest.model_validate({'messages':[{'role':'user','content':'Hello'}]}).context.build_plan)
