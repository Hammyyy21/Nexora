"""Bounded advisory plan DTO. No execution or model-controlled completion API."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Stage = Literal['objective','inventory','missing','selection','power','schematic','pcb','firmware','testing']
Text = Annotated[str, Field(max_length=500)]
Identity = Annotated[str, Field(max_length=100)]
STAGES = ['objective','inventory','missing','selection','power','schematic','pcb','firmware','testing']

class PlanModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class UserVerification(PlanModel):
    source: Literal['user']
    note: str = Field(min_length=1,max_length=500)
    fingerprint: str = Field(max_length=40)

class PlanStep(PlanModel):
    id: Stage
    stage: Stage
    title: str = Field(max_length=100)
    explanation: str = Field(max_length=1000)
    technical: str = Field(max_length=1000)
    status: Literal['not_started','in_progress','blocked','needs_verification','completed']
    dependencies: list[Stage] = Field(max_length=9)
    entities: list[Identity] = Field(max_length=64)
    evidence: list[Text] = Field(max_length=12)
    assumptions: list[Text] = Field(max_length=12)
    unresolved: list[Text] = Field(max_length=12)
    criteria: list[Text] = Field(max_length=12)
    fingerprint: str = Field(max_length=40)
    verification: UserVerification | None

class Recommendation(PlanModel):
    role: str = Field(max_length=100)
    name: str = Field(max_length=140)
    availability: Literal['present','addable','unavailable']
    qualification: Literal['unverified']
    catalog_id: str | None = Field(max_length=100)
    entity_ids: list[Identity] = Field(max_length=64)
    reason: str = Field(max_length=500)

class PlanBody(PlanModel):
    version: Literal[1]
    goal_revision: int = Field(ge=1)
    goal_fingerprint: str = Field(max_length=40)
    steps: list[PlanStep] = Field(min_length=9,max_length=9)
    recommendations: list[Recommendation] = Field(max_length=8)
    next_step_id: Stage
    omitted: int = Field(ge=0)

    @model_validator(mode='after')
    def consistent_steps(self):
        for index, step in enumerate(self.steps):
            if step.id != STAGES[index] or step.stage != step.id:
                raise ValueError('Unexpected step identity')
            if any(d not in STAGES[:index] for d in step.dependencies):
                raise ValueError('Invalid plan dependency')
            if step.status == 'completed' and step.verification is None:
                raise ValueError('Completion requires user evidence')
        if len(self.model_dump_json().encode('utf-8')) > 64000:
            raise ValueError('Plan exceeds 64 KB')
        return self
