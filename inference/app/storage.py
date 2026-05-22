import json
import secrets
import uuid
from pathlib import Path
from typing import Literal

from .config import settings

Kind = Literal["person", "garment", "result"]


def _root() -> Path:
    p = Path(settings.storage_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _paths(item_id: str) -> tuple[Path, Path]:
    """Returns (binary_path, sidecar_json_path)."""
    bin_path = _root() / item_id
    side_path = _root() / f"{item_id}.json"
    return bin_path, side_path


def save_blob(data: bytes, kind: Kind, content_type: str | None = None) -> dict:
    """
    Persist bytes + JSON sidecar, return:
        { "id": str, "url": str (signed read URL) }
    """
    item_id = uuid.uuid4().hex
    read_token = secrets.token_urlsafe(settings.read_token_bytes)
    bin_path, side_path = _paths(item_id)

    bin_path.write_bytes(data)
    side_path.write_text(
        json.dumps(
            {
                "id": item_id,
                "kind": kind,
                "content_type": content_type or "application/octet-stream",
                "read_token": read_token,
                "size": len(data),
            }
        )
    )

    base = settings.storage_public_base_url.rstrip("/")
    return {"id": item_id, "url": f"{base}/storage/{item_id}?t={read_token}"}


def load_sidecar(item_id: str) -> dict | None:
    _, side_path = _paths(item_id)
    if not side_path.is_file():
        return None
    return json.loads(side_path.read_text())


def load_blob_path(item_id: str) -> Path | None:
    bin_path, _ = _paths(item_id)
    return bin_path if bin_path.is_file() else None


def fetch_signed_url_bytes(url: str) -> bytes:
    """
    Read a previously-issued signed URL back as bytes by going through the
    local filesystem (no network round-trip needed for our own storage).
    """
    # URL format: <base>/storage/<id>?t=<token>
    from urllib.parse import urlparse, parse_qs

    parsed = urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) != 2 or parts[0] != "storage":
        raise ValueError(f"not a storage URL: {url}")
    item_id = parts[1]
    token = parse_qs(parsed.query).get("t", [""])[0]

    side = load_sidecar(item_id)
    if side is None or side["read_token"] != token:
        raise ValueError(f"unknown or invalid token for {item_id}")
    path = load_blob_path(item_id)
    if path is None:
        raise ValueError(f"blob missing for {item_id}")
    return path.read_bytes()
