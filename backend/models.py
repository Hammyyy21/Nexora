from typing import Literal
import math

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Message(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def not_blank(cls, value):
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


class ProjectComponent(StrictModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(max_length=140)
    catalog_id: str | None = Field(default=None, max_length=100)
    ports: list[str] | None = Field(default=None, max_length=100)
    fixed: bool = False
    position: tuple[float, float, float]

    @field_validator("position")
    @classmethod
    def bounded_position(cls, value):
        if not all(math.isfinite(n) and abs(n) <= 20 for n in value):
            raise ValueError("Coordinates must fit the viewport")
        return value


class DesignAction(StrictModel):
    type: Literal["add_component", "move_component", "remove_component", "select_component", "create_project", "connect_components", "generate_firmware", "review_project", "show_specifications", "suggest_placements"]
    component_id: str | None = Field(default=None, max_length=100)
    catalog_id: str | None = Field(default=None, max_length=100)
    position: tuple[float, float, float] | None = None
    template_id: Literal["blank", "cooling", "microcontroller", "iot", "robotics", "power", "display", "logger"] | None = None
    project_name: str | None = Field(default=None, max_length=100)

    port_id: str | None = Field(default=None, max_length=100)
    target_component_id: str | None = Field(default=None, max_length=100)
    target_port_id: str | None = Field(default=None, max_length=100)
    source: str | None = Field(default=None, max_length=20000)

    @model_validator(mode="after")
    def specific_fields(self):
        allowed = {
            "add_component": {"catalog_id", "position"}, "move_component": {"component_id", "position"},
            "remove_component": {"component_id"}, "select_component": {"component_id"},
            "create_project": {"template_id", "project_name"},
            "connect_components": {"component_id", "port_id", "target_component_id", "target_port_id"},
            "generate_firmware": {"component_id", "source"},
            "review_project": {"component_id"}, "show_specifications": {"component_id"}, "suggest_placements": {"component_id"},
        }
        if any(key != "type" and value is not None and key not in allowed[self.type] for key, value in self.model_dump().items()):
            raise ValueError("Unexpected action arguments")
        if self.position is not None and not all(math.isfinite(n) and abs(n) <= 20 for n in self.position):
            raise ValueError("Position outside valid range")
        if self.type == "add_component" and not self.catalog_id:
            raise ValueError("Add requires catalog_id")
        if self.type in ("move_component", "remove_component", "select_component") and not self.component_id:
            raise ValueError("Existing object required")
        if self.type == "move_component" and self.position is None:
            raise ValueError("Move requires a position")
        if self.type == "create_project" and (not self.template_id or not self.project_name or not self.project_name.strip()):
            raise ValueError("Create requires a template and name")
        if self.type == "connect_components" and not all([self.component_id, self.port_id, self.target_component_id, self.target_port_id]):
            raise ValueError("Connection requires two component and port IDs")
        if self.type == "generate_firmware" and (not self.component_id or not self.source or not self.source.strip()):
            raise ValueError("Firmware requires a controller and source")
        return self


class Endpoint(StrictModel):
    componentId: str = Field(max_length=100)
    portId: str = Field(max_length=100)


class Connection(StrictModel):
    id: str = Field(max_length=100)
    from_: Endpoint = Field(alias="from")
    to: Endpoint


class Context(StrictModel):
    connections: list[Connection] | None = Field(default=None, max_length=128)
    board_summary: str | None = Field(default=None, max_length=6000)
    project_name: str | None = Field(default=None, max_length=120)
    selected_component_id: str | None = Field(default=None, max_length=100)
    selected_component_type: str | None = Field(default=None, max_length=40)
    catalog_ids: list[str] = Field(default_factory=list, max_length=3)
    project_components: list[ProjectComponent] = Field(default_factory=list, max_length=64)
    engineering_notices: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("engineering_notices")
    @classmethod
    def bounded_notices(cls, values):
        if any(len(v) > 160 for v in values):
            raise ValueError("Engineering notices must be 160 characters or fewer")
        return values


class ChatRequest(StrictModel):
    messages: list[Message] = Field(min_length=1, max_length=10)
    context: Context = Field(default_factory=Context)
    response_length: Literal["auto", "concise", "detailed"] = "auto"

    @model_validator(mode="after")
    def bounded_conversation(self):
        if self.messages[-1].role != "user" or sum(len(m.content) for m in self.messages) > 12000:
            raise ValueError("Conversation must end in a user message and fit the character budget")
        return self


# Keep the model-facing JSON Schema simple. Strict Structured Outputs may reject
# implementation-specific constraints (notably fixed-length tuple / prefixItems).
# This DTO is never trusted as an executable action: below we re-parse through
# GuideAnswer / DesignAction with all local validation rules still in place.
class AIActionOutput(StrictModel):
    type: Literal["add_component", "move_component", "remove_component", "select_component", "create_project", "connect_components", "generate_firmware", "review_project", "show_specifications", "suggest_placements"]
    # All keys are required in the wire protocol, but nullable. The model
    # must emit null for arguments not used by an action.
    component_id: str | None
    catalog_id: str | None
    position: list[float] | None
    template_id: Literal["blank", "cooling", "microcontroller", "iot", "robotics", "power", "display", "logger"] | None
    project_name: str | None
    port_id: str | None
    target_component_id: str | None
    target_port_id: str | None
    source: str | None


class AIResponseOutput(StrictModel):
    answer: str
    missing_data: list[str]
    unverified_recommendations: list[str]
    cited_catalog_ids: list[str]
    actions: list[AIActionOutput]


# Actions are proposals only. No model output is executed on the backend.
class GuideAnswer(StrictModel):
    answer: str
    missing_data: list[str]
    unverified_recommendations: list[str]
    cited_catalog_ids: list[str]
    actions: list[DesignAction] = Field(default_factory=list, max_length=5)
