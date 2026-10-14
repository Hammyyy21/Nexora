"""The frontend and backend consume the same checked-in catalog, never client specs."""
import json
import re

from .config import ROOT
from .models import ChatRequest
from .mentor import mentor_evidence

CATALOG = json.loads((ROOT / "src/catalog/parts.json").read_text(encoding="utf-8"))
BY_ID = {part["id"]: part for part in CATALOG}
if len(BY_ID) != len(CATALOG):
    raise ValueError("Duplicate catalog identities")


def retrieve(request: ChatRequest) -> list[dict]:
    ids = list(dict.fromkeys(request.context.catalog_ids))
    if any(identity not in BY_ID for identity in ids):
        raise ValueError("Unknown catalog identity")
    # Resolve references using recent dialogue and exact current component identities.
    current_ids = [p.catalog_id for p in request.context.project_components]
    if request.context.workspace_snapshot:
        current_ids += [p.catalogId for p in request.context.workspace_snapshot.components]
    for identity in [*mentor_evidence(request, CATALOG)["catalog_search"]["candidate_ids"], *current_ids]:
        if identity in BY_ID and identity not in ids and len(ids) < 6:
            ids.append(identity)
    text = " ".join(m.content for m in request.messages).casefold()
    # Exact name / part-number / manufacturer phrases only; never infer a demo
    # component's exact part from its generic scene label.
    for part in CATALOG:
        if len(ids) >= 6:
            break
        terms = (part["id"], part["name"], part["manufacturerPartNumber"], part["manufacturer"])
        if any(re.search(r"(?<!\w)" + re.escape(term.casefold()) + r"(?!\w)", text) for term in terms if term):
            if part["id"] not in ids:
                ids.append(part["id"])
        if len(ids) >= 6:
            break
    fields = ("id", "name", "manufacturer", "manufacturerPartNumber", "description",
              "useCase", "caution", "specifications", "interfaces", "architecture",
              "voltageRange", "package", "socket", "memoryGeneration", "sources",
              "verificationStatus", "lastVerifiedAt", "insertionNote")
    return [{key: BY_ID[identity][key] for key in fields if key in BY_ID[identity]} for identity in ids]


def references(ids: list[str]) -> list[dict]:
    return [{"catalog_id": identity, "name": BY_ID[identity]["name"],
             "verification_status": BY_ID[identity]["verificationStatus"],
             "sources": BY_ID[identity]["sources"]} for identity in dict.fromkeys(ids)]
