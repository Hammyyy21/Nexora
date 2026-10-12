import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from backend.config import Settings
from backend.main import create_app
from backend.models import ChatRequest, DesignAction, GuideAnswer
from backend.workspace_models import FindingExplanation


def snapshot():
    return {
        'version': 1, 'project': {'id': 'project-test', 'name': 'Workspace', 'schemaVersion': 3, 'revision': 4, 'placementMode': 'free'},
        'board': {'length': 80, 'width': 80, 'thickness': 1.6, 'edgeClearance': 1, 'mountingHoles': [], 'restrictedRegions': [], 'outline': {'kind': 'circle'},
                  'grid': {'enabled': True, 'spacing': 1}, 'supportedSides': ['top', 'bottom'], 'stackup': [{'id': 'top', 'name': 'Top copper', 'kind': 'copper', 'side': 'top', 'visible': True}]},
        'components': [{'id': 'pcb', 'name': 'Board', 'reference': 'PCB1', 'catalogId': None, 'position': [0, 0, 0], 'rotation': [0, 0, 0], 'side': 'top',
                        'footprint': {'name': 'Visual bounds', 'length': 80, 'width': 80, 'provenance': 'visual-estimate'}, 'verification': 'concept', 'datasheet': None, 'ports': []}],
        'schematic': {'wires': [], 'nets': []},
        'findings': [{'id': 'board-data', 'classification': 'missing-information', 'title': 'Board data incomplete', 'details': 'No verified fabrication data.', 'remedy': 'Review the board.', 'entities': [{'kind': 'component', 'id': 'pcb'}]}],
        'firmware': {'id': 'cooling', 'language': 'c', 'targetId': None, 'targetArchitecture': None, 'source': '// no compiler', 'sourceRevision': 'fnv1a-00000000', 'buildStatus': 'stale', 'staticDiagnostics': ['Unavailable']},
        'omitted': {'components': 0, 'ports': 0, 'wires': 0, 'nets': 0, 'findings': 0, 'firmwareCharacters': 0, 'redacted': False},
        'scope': 'Specific checks only, no complete electrical safety validation.',
    }

class WorkspaceV2Tests(unittest.TestCase):
    def setUp(self):
        self.ai = AsyncMock()
        self.client = TestClient(create_app(Settings(api_key='test-key'), SimpleNamespace(responses=SimpleNamespace(parse=self.ai))))
        self.client.__enter__()
        self.payload = {'messages': [{'role': 'user', 'content': 'Inspect my entire project'}], 'context': {'workspace_snapshot': snapshot()}}
        self.ai.return_value = SimpleNamespace(status='completed', output=[], output_parsed=GuideAnswer(answer='Inspect the board data.', missing_data=[], unverified_recommendations=[], cited_catalog_ids=[], findings=[FindingExplanation(evidence_id='board-data', explanation='Board data is missing.', next_step='Review board specifications.')]))

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_snapshot_and_evidence_reach_the_model_without_executing_actions(self):
        response = self.client.post('/api/ai/chat', json=self.payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['findings'][0]['evidence_id'], 'board-data')
        prompt = json.loads(self.ai.call_args.kwargs['input'][0]['content'])
        self.assertEqual(prompt['untrusted_project_context']['workspace_snapshot']['project']['revision'], 4)
        self.assertNotIn('test-key', json.dumps(prompt))
        self.assertNotIn('tools', self.ai.call_args.kwargs)

    def test_unknown_snapshot_fields_and_dangling_references_are_rejected(self):
        for mutate in [
            lambda s: s.update(api_key='hidden'),
            lambda s: s['board'].update(filesystem='/etc/passwd'),
            lambda s: s['components'][0].update(hidden_browser_state={}),
            lambda s: s['firmware'].update(targetId='other-project-controller'),
            lambda s: s['findings'][0]['entities'][0].update(id='missing'),
            lambda s: s.update(version=99),
        ]:
            p=copy.deepcopy(self.payload);mutate(p['context']['workspace_snapshot'])
            self.assertEqual(self.client.post('/api/ai/chat', json=p).status_code, 422)
        self.ai.assert_not_awaited()

    def test_payloads_are_bounded_in_bytes_and_nested_collections(self):
        for mutate in [
            lambda s: s['firmware'].update(source='x'*12001),
            lambda s: s.update(components=s['components']*65),
            lambda s: s['board'].update(mountingHoles=[{'x': 0, 'z': 0, 'diameter': 2}]*33),
            lambda s: s.update(findings=[{**s['findings'][0], 'details': '🙂'*3000}]*32),
        ]:
            p=copy.deepcopy(self.payload);mutate(p['context']['workspace_snapshot'])
            self.assertIn(self.client.post('/api/ai/chat', json=p).status_code, (413, 422))
        self.ai.assert_not_awaited()

    def test_unsupported_ai_evidence_cannot_be_presented_as_a_verified_finding(self):
        self.ai.return_value.output_parsed.findings[0].evidence_id='invented-pass'
        result=self.client.post('/api/ai/chat', json=self.payload)
        self.assertEqual(result.status_code, 502)

    def test_new_board_proposal_is_typed_and_only_returned_for_review(self):
        self.ai.return_value.output_parsed.actions=[DesignAction.model_validate_json(json.dumps({'type':'configure_board','configuration':snapshot()['board']}))]
        result=self.client.post('/api/ai/chat', json=self.payload)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['actions'][0]['configuration']['outline'],{'kind':'circle'})
        self.assertIn('approval',result.json()['notice'])

    def test_new_actions_reject_nonfinite_rotation_and_malformed_geometry(self):
        for action in [
            {'type':'update_component','component_id':'pcb','rotation':[0,float('inf'),0]},
            {'type':'update_component','component_id':'pcb','side':'internal'},
            {'type':'configure_board','configuration':{**snapshot()['board'],'width':50}},
            {'type':'duplicate_component','component_id':'pcb','shell':'run'},
        ]:
            with self.assertRaises(ValueError):
                DesignAction.model_validate_json(json.dumps(action))

    def test_bounded_large_snapshot_keeps_legacy_request_limits(self):
        # UTF-8 source is below 12k characters and 96 KB, but above old 20 KB.
        self.payload['context']['workspace_snapshot']['firmware']['source']='é'*11000
        body=json.dumps(self.payload,ensure_ascii=False).encode()
        self.assertGreater(len(body),20000)
        response=self.client.post('/api/ai/chat', content=body,headers={'Content-Type':'application/json'})
        self.assertEqual(response.status_code,200,response.text)
        legacy={'messages':[{'role':'user','content':'x'*21000}]}
        self.assertEqual(self.client.post('/api/ai/chat',json=legacy).status_code,413)

if __name__ == '__main__':
    unittest.main()
