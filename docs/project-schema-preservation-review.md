# Source audit: preserve PCB schema on project duplicate and import

The project collection archive uses `version: 2` and is independent of the version of each
embedded PCB project. A PCB project may use `schemaVersion: 3` for the editable footprint,
board and concept-copy model.

`useProjectsStore.duplicate` and `importNew` previously forced `schemaVersion: 2` in the
copied/imported project. This could make the next `parseProject` reject a valid v3
concept copy, since concept copies require schema v3. Those methods now retain the
source project's already-validated schemaVersion. They still assign new project IDs.

The new regression tests exercise both workflows with a schema-v3 project containing a
concept component copy. No application state migration or changes to existing saved
projects are performed by the patch.
