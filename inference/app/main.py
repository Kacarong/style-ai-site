from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import storage
from .auth import require_bearer, verify_read_token
from .config import settings
from .providers import TryonInput, get_provider

app = FastAPI(title="style-ai-site inference")


@app.get("/healthz")
def healthz() -> dict:
    """Public. Used by the Next.js server to render the online/offline badge.

    `provider` lets the UI show which model is wired up (mock vs fashn vs fal).
    """
    return {"ok": True, "provider": settings.provider}


@app.post("/storage/upload", dependencies=[Depends(require_bearer)])
async def upload(
    file: UploadFile = File(...),
    kind: str = Form(...),
) -> dict:
    if kind not in ("person", "garment", "result"):
        raise HTTPException(400, "kind must be person|garment|result")
    data = await file.read()
    return storage.save_blob(data, kind, content_type=file.content_type)  # type: ignore[arg-type]


@app.delete("/storage/{item_id}", dependencies=[Depends(require_bearer)])
def delete(item_id: str) -> dict:
    """Remove blob + sidecar. Idempotent — returns 200 even if already gone."""
    removed = storage.delete_blob(item_id)
    return {"id": item_id, "removed": removed}


@app.get("/storage/{item_id}")
def serve(item_id: str, t: str = Query(...)) -> FileResponse:
    """
    Signed read URL endpoint. No Bearer header — browsers can't send one on
    <img src>. The ?t=<token> in the URL is the credential.
    """
    side = storage.load_sidecar(item_id)
    if side is None:
        raise HTTPException(404, "not found")
    if not verify_read_token(t, side["read_token"]):
        raise HTTPException(403, "bad token")
    path = storage.load_blob_path(item_id)
    if path is None:
        raise HTTPException(404, "blob missing")
    return FileResponse(path, media_type=side.get("content_type", "application/octet-stream"))


class TryonRequest(BaseModel):
    generation_id: str
    person_url: str
    garment_url: str
    provider: str | None = None  # reserved; uses settings.provider for now
    category: str | None = None  # free text; FASHN provider maps to its enum


class TryonResponse(BaseModel):
    result_url: str
    model_used: str
    cost_usd: float


@app.post("/tryon", response_model=TryonResponse, dependencies=[Depends(require_bearer)])
def tryon(req: TryonRequest) -> TryonResponse:
    try:
        person = storage.fetch_signed_url_bytes(req.person_url)
        garment = storage.fetch_signed_url_bytes(req.garment_url)
    except ValueError as e:
        raise HTTPException(400, str(e))

    provider = get_provider()
    out = provider.run(
        TryonInput(person_bytes=person, garment_bytes=garment, category=req.category)
    )

    saved = storage.save_blob(out.result_bytes, "result", content_type=out.content_type)
    return TryonResponse(result_url=saved["url"], model_used=out.model_used, cost_usd=out.cost_usd)


@app.exception_handler(NotImplementedError)
def _not_implemented(_, exc: NotImplementedError):
    return JSONResponse(status_code=501, content={"detail": str(exc)})
