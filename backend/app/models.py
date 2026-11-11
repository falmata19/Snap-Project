from typing import Literal, Optional

from pydantic import BaseModel, Field

from .config import MAX_PAYLOAD_CHARS

EchoKind = Literal["voice", "doodle", "creature"]


class EchoCreate(BaseModel):
    kind: EchoKind
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    payload: str = Field(default="", max_length=MAX_PAYLOAD_CHARS)
    creature: Optional[str] = None
    height: float = Field(default=0.0, ge=-50, le=500)


class Echo(BaseModel):
    id: str
    kind: EchoKind
    lat: float
    lon: float
    payload: str
    creature: Optional[str] = None
    height: float
    creator_id: str
    created_at: float
    expires_at: float
    strength: float
    interactions: int
    distance_m: Optional[float] = None


class PresenceIn(BaseModel):
    clip: Optional[str] = Field(default=None, max_length=MAX_PAYLOAD_CHARS)


class Partner(BaseModel):
    user_id: str
    clip: Optional[str] = None


class PresenceOut(BaseModel):
    duet: bool
    partners: list[Partner]
    echo: Echo


class ClassifyIn(BaseModel):
    pcm: str = Field(max_length=MAX_PAYLOAD_CHARS)


class ClassifyOut(BaseModel):
    creature: str
    label: str
    confidence: float
