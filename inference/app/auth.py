import hmac
from fastapi import Header, HTTPException, status

from .config import settings


def require_bearer(authorization: str | None = Header(default=None)) -> None:
    """Verify Bearer SHARED_SECRET. Used on /storage/upload and /tryon."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer")
    presented = authorization[len("Bearer ") :].encode()
    expected = settings.shared_secret.encode()
    if not hmac.compare_digest(presented, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="bad bearer")


def verify_read_token(presented: str, expected: str) -> bool:
    """Constant-time check for signed read URL tokens on /storage/<id>."""
    return hmac.compare_digest(presented.encode(), expected.encode())
