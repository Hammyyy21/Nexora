"""Bounded, allowlisted workspace DTOs. No filesystem, browser or tool access."""
from typing import Literal
import json
import math
from pydantic import BaseModel, ConfigDict, Field, model_validator

class WorkspaceModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

class Point(WorkspaceModel):
    x: float = Field(ge=-200, le=200)
    z: float = Field(ge=-200, le=200)

class Outline(WorkspaceModel):
    kind: Literal['rectangle', 'circle', 'rounded-rectangle', 'polygon']
    radius: float | None = Field(default=None, gt=0, le=100)
    points: list[Point] | None = Field(default=None, min_length=3, max_length=64)

class Coordinates(WorkspaceModel):
    units: Literal['mm']
    origin: Point
    xDirection: Literal[1, -1]
    zDirection: Literal[1, -1]

class Grid(WorkspaceModel):
    enabled: bool
    spacing: float = Field(ge=0.1, le=50)

class Layer(WorkspaceModel):
    id: str = Field(min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9-]+$')
    name: str = Field(min_length=1, max_length=80)
    kind: Literal['copper', 'mechanical']
    side: Literal['top', 'bottom', 'internal', 'all']
    visible: bool

class Hole(Point):
    id: str | None = Field(default=None, max_length=100)
    diameter: float = Field(gt=0, le=200)

class Region(Point):
    id: str | None = Field(default=None, max_length=100)
    name: str = Field(min_length=1, max_length=80)
    length: float = Field(gt=0, le=200)
    width: float = Field(gt=0, le=200)
    side: Literal['top', 'bottom', 'all'] | None = None

class BoardConfiguration(WorkspaceModel):
    length: float = Field(ge=10, le=200)
    width: float = Field(ge=10, le=200)
    thickness: float = Field(ge=0.2, le=10)
    material: str | None = Field(default=None, max_length=80)
    layers: int | None = Field(default=None, ge=1, le=64)
    supplyVoltage: float | None = Field(default=None, ge=0, le=100000)
    currentBudgetMa: float | None = Field(default=None, ge=0, le=100000)
    componentSpacing: float | None = Field(default=None, ge=0, le=100000)
    edgeClearance: float = Field(ge=0, le=100)
    mountingHoles: list[Hole] = Field(max_length=32)
    restrictedRegions: list[Region] = Field(max_length=32)
    outline: Outline | None = None
    coordinates: Coordinates | None = None
    grid: Grid | None = None
    supportedSides: list[Literal['top', 'bottom']] | None = Field(default=None, min_length=1, max_length=2)
    stackup: list[Layer] | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode='after')
    def shape(self):
        if self.edgeClearance >= min(self.length, self.width)/2:
            raise ValueError('Edge clearance exceeds the board')
        if self.outline:
            o = self.outline
            if o.kind == 'circle' and self.length != self.width:
                raise ValueError('Circular dimensions must match')
            if o.kind == 'rounded-rectangle' and (o.radius is None or o.radius > min(self.length, self.width)/2):
                raise ValueError('Invalid corner radius')
            if o.kind == 'polygon' and (not o.points or any(abs(p.x)>self.length/2 or abs(p.z)>self.width/2 for p in o.points)):
                raise ValueError('Invalid polygon bounds')
        if self.stackup and (len({l.id for l in self.stackup}) != len(self.stackup) or not any(l.kind == 'copper' for l in self.stackup)):
            raise ValueError('Invalid layers')
        return self

class Footprint(WorkspaceModel):
    name: str = Field(min_length=1, max_length=80)
    length: float = Field(ge=0.1, le=200)
    width: float = Field(ge=0.1, le=200)
    provenance: Literal['visual-estimate', 'user-configured']

class Entity(WorkspaceModel):
    kind: Literal['component', 'net', 'region', 'firmware']
    id: str = Field(min_length=1, max_length=200)

class Finding(WorkspaceModel):
    id: str = Field(min_length=1, max_length=500)
    classification: Literal['verified-issue', 'potential-issue', 'missing-information', 'passed-specific-check']
    title: str = Field(max_length=400)
    details: str = Field(max_length=3000)
    remedy: str = Field(max_length=1500)
    entities: list[Entity] = Field(max_length=64)
    source: str | None = Field(default=None, max_length=1000)

class FindingExplanation(WorkspaceModel):
    evidence_id: str = Field(min_length=1, max_length=500)
    explanation: str = Field(max_length=2000)
    next_step: str = Field(max_length=1000)

class SnapshotProject(WorkspaceModel):
    id: str = Field(max_length=100)
    name: str = Field(max_length=100)
    schemaVersion: Literal[1, 2, 3]
    revision: int = Field(ge=0)
    placementMode: Literal['free', 'board']

class Port(WorkspaceModel):
    id: str = Field(max_length=100)
    verification: Literal['physical', 'logical']
    source: str | None = Field(default=None, max_length=1000)

class SnapshotComponent(WorkspaceModel):
    id: str = Field(max_length=100)
    name: str = Field(max_length=140)
    reference: str = Field(max_length=80)
    catalogId: str | None = Field(max_length=100)
    position: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(min_length=3, max_length=3)
    side: Literal['top', 'bottom']
    footprint: Footprint
    verification: str = Field(max_length=80)
    datasheet: str | None = Field(max_length=1000)
    ports: list[Port] = Field(max_length=64)

    @model_validator(mode='after')
    def vectors(self):
        if any(abs(n)>20 for n in self.position) or any(abs(n)>360 for n in self.rotation):
            raise ValueError('Invalid transform')
        return self

class Endpoint(WorkspaceModel):
    componentId: str = Field(max_length=100)
    portId: str = Field(max_length=100)

class Wire(WorkspaceModel):
    id: str = Field(max_length=100)
    from_: Endpoint = Field(alias='from')
    to: Endpoint

class Net(WorkspaceModel):
    id: str = Field(max_length=100)
    name: str = Field(max_length=100)
    terminals: list[str] = Field(max_length=256)

class Schematic(WorkspaceModel):
    wires: list[Wire] = Field(max_length=128)
    nets: list[Net] = Field(max_length=128)

class Firmware(WorkspaceModel):
    id: Literal['cooling']
    language: Literal['c']
    targetId: str | None = Field(max_length=100)
    targetArchitecture: str | None = Field(max_length=200)
    source: str = Field(max_length=12000)
    sourceRevision: str = Field(max_length=80)
    buildStatus: Literal['demo', 'stale', 'unavailable', 'current']
    staticDiagnostics: list[str] = Field(max_length=32)

class Omitted(WorkspaceModel):
    components: int = Field(ge=0)
    ports: int = Field(ge=0)
    wires: int = Field(ge=0)
    nets: int = Field(ge=0)
    findings: int = Field(ge=0)
    firmwareCharacters: int = Field(ge=0)
    redacted: bool

class WorkspaceSnapshot(WorkspaceModel):
    version: Literal[1]
    project: SnapshotProject
    board: BoardConfiguration
    components: list[SnapshotComponent] = Field(max_length=64)
    schematic: Schematic
    findings: list[Finding] = Field(max_length=64)
    firmware: Firmware
    omitted: Omitted
    scope: str = Field(max_length=1000)

    @model_validator(mode='after')
    def bounded(self):
        if len(json.dumps(self.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False, separators=(',', ':')).encode()) > 96000:
            raise ValueError('Snapshot exceeds 96 KB')
        ids = {c.id for c in self.components}
        if len(ids) != len(self.components) or any(w.from_.componentId not in ids or w.to.componentId not in ids for w in self.schematic.wires):
            raise ValueError('Invalid snapshot component references')
        if self.firmware.targetId and self.firmware.targetId not in ids:
            raise ValueError('Invalid firmware target')
        entities = {'component': ids, 'net': {n.id for n in self.schematic.nets}, 'region': {r.id for r in self.board.restrictedRegions+self.board.mountingHoles}, 'firmware': {'cooling'}}
        if any(e.id not in entities[e.kind] for f in self.findings for e in f.entities):
            raise ValueError('Invalid finding entity')
        return self
