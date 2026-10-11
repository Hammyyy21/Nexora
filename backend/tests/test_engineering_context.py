"""Local engineering-review context is bounded and advisory only."""
import unittest
from pydantic import ValidationError
from backend.models import Context, ChatRequest

class EngineeringContextTests(unittest.TestCase):
    def test_bounded_findings_accepted_as_advisory_context(self):
        request = ChatRequest.model_validate({
            'messages': [{'role': 'user', 'content': 'Check my design'}],
            'context': {'engineering_notices': ['info: Electrical connectivity not verified']}
        })
        self.assertEqual(len(request.context.engineering_notices), 1)

    def test_rejects_oversized_or_too_many_findings(self):
        with self.assertRaises(ValidationError):
            Context.model_validate({'engineering_notices': ['x'*161]})
        with self.assertRaises(ValidationError):
            Context.model_validate({'engineering_notices': ['x']*9})

    def test_older_clients_can_omit_findings(self):
        self.assertEqual(Context.model_validate({}).engineering_notices, [])

if __name__ == '__main__':
    unittest.main()
