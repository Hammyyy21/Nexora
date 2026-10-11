"""Check the model-facing output format, without requiring an API connection."""
import unittest
from backend.models import AIResponseOutput, GuideAnswer


class AIWireSchemaTests(unittest.TestCase):
    def test_wire_schema_uses_supported_json_types(self):
        schema = AIResponseOutput.model_json_schema()
        unsupported = {"prefixItems", "minLength", "maxLength", "maxItems", "minItems", "default"}

        def walk(node):
            if isinstance(node, dict):
                self.assertFalse(unsupported.intersection(node), unsupported.intersection(node))
                for val in node.values():
                    walk(val)
            elif isinstance(node, list):
                for val in node:
                    walk(val)

        walk(schema)
        action_schema = schema["$defs"]["AIActionOutput"]
        self.assertEqual(set(action_schema["properties"]), set(action_schema["required"]))

    def test_valid_action_is_validated_again_before_execution(self):
        wire = AIResponseOutput.model_validate({
            "answer": "Ready to remove cooling fan, pending your approval.",
            "missing_data": [], "unverified_recommendations": [], "cited_catalog_ids": [],
            "actions": [{"type": "remove_component", "component_id": "fan", "catalog_id": None,
                         "position": None, "template_id": None, "project_name": None, "port_id": None, "target_component_id": None, "target_port_id": None, "source": None}],
        })
        answer = GuideAnswer.model_validate_json(wire.model_dump_json())
        self.assertEqual(answer.actions[0].component_id, "fan")

        no_id = wire.model_copy(update={"actions": [wire.actions[0].model_copy(update={"component_id": None})]})
        with self.assertRaises(ValueError):
            GuideAnswer.model_validate_json(no_id.model_dump_json())

    def test_bounded_actions_are_enforced_after_model_parse(self):
        wire = AIResponseOutput.model_validate({
            "answer": "Too many actions", "missing_data": [],
            "unverified_recommendations": [], "cited_catalog_ids": [],
            "actions": [{"type": "select_component", "component_id": "u1", "catalog_id": None,
                         "position": None, "template_id": None, "project_name": None, "port_id": None, "target_component_id": None, "target_port_id": None, "source": None}] * 6,
        })
        with self.assertRaises(ValueError):
            GuideAnswer.model_validate_json(wire.model_dump_json())

    def test_fixed_length_xyz_enforced_after_wire_parse(self):
        wire = AIResponseOutput.model_validate({
            "answer": "Move", "missing_data": [],
            "unverified_recommendations": [], "cited_catalog_ids": [],
            "actions": [{"type": "move_component", "component_id": "u1", "catalog_id": None,
                         "position": [1.0, 2.0], "template_id": None, "project_name": None, "port_id": None, "target_component_id": None, "target_port_id": None, "source": None}],
        })
        with self.assertRaises(ValueError):
            GuideAnswer.model_validate_json(wire.model_dump_json())


if __name__ == "__main__":
    unittest.main()
