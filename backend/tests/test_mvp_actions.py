import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.config import Settings
from backend.models import GuideAnswer, DesignAction

class MVPActionTests(unittest.TestCase):
    def test_connection_pins_are_checked_against_request_context(self):
        ai = AsyncMock()
        sdk = SimpleNamespace(responses=SimpleNamespace(parse=ai))
        payload = {"messages":[{"role":"user","content":"Connect sensor to controller"}],"context":{"project_components":[
            {"id":"part-controller","name":"Controller","position":[0,0,0],"ports":["demo:SDA"]},
            {"id":"part-sensor","name":"Sensor","position":[1,0,0],"ports":["demo:SDA"]}]}}
        with TestClient(create_app(Settings(api_key='mock-test-key'),sdk)) as client:
            for port, expected in [('demo:SDA',200),('invented',502)]:
                answer=GuideAnswer(answer='Connection ready for review.',missing_data=[],unverified_recommendations=[],cited_catalog_ids=[],actions=[
                    DesignAction(type='connect_components',component_id='part-controller',port_id=port,target_component_id='part-sensor',target_port_id='demo:SDA')])
                ai.return_value=SimpleNamespace(status='completed',output=[],output_parsed=answer)
                response=client.post('/api/ai/chat',json=payload)
                self.assertEqual(response.status_code,expected,response.text)

    def test_rejects_incomplete_and_oversized_firmware(self):
        for values in [{"source":""},{"source":"x"*20001},{"source":"int main(void){}","component_id":None}]:
            with self.assertRaises(ValueError):
                DesignAction.model_validate({"type":"generate_firmware","component_id":"part-controller",**values})

    def test_readonly_and_firmware_proposals_use_existing_registry(self):
        for kind in ['review_project','show_specifications','suggest_placements']:
            self.assertEqual(DesignAction(type=kind).type,kind)
        self.assertEqual(DesignAction(type='generate_firmware',component_id='part-controller',source='int main(void) { return 0; }').type,'generate_firmware')
