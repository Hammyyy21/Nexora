import unittest
from pydantic import ValidationError
from backend.workspace_models import Footprint


class PCBPadsTests(unittest.TestCase):
    def test_bounded_pad_dto_and_provenance(self):
        basic = {'name': 'Example', 'length': 10, 'width': 10, 'provenance': 'user-configured'}
        pad = {'id': 'pad-1', 'x': 0, 'z': 0, 'length': 1, 'width': 1, 'shape': 'rect', 'layerId': 'copper-1', 'portId': 'pin:SDA'}
        self.assertEqual(Footprint.model_validate({**basic, 'pads': [pad]}).pads[0].portId, 'pin:SDA')
        for invalid in [
            [pad] * 9,
            [pad, pad],
            [{**pad, 'x': 6}],
            [{**pad, 'shell': 'malicious'}],
            [{**pad, 'layerId': '../escape'}],
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                Footprint.model_validate({**basic, 'pads': invalid})


if __name__ == '__main__':
    unittest.main()
