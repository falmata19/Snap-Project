import base64
import binascii

import numpy as np
import redis
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .creatures import CREATURES
from .models import (
    ClassifyIn,
    ClassifyOut,
    Echo,
    EchoCreate,
    PresenceIn,
    PresenceOut,
)
from .store import EchoStore

app = FastAPI(title="Echoes")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_store = None
_classifier = None


def get_store():
    global _store
    if _store is None:
        client = redis.Redis.from_url(config.REDIS_URL, decode_responses=True)
        _store = EchoStore(
            client,
            config.DECAY_SECONDS,
            config.BOOST_SECONDS,
            config.DUET_WINDOW_SECONDS,
        )
    return _store


def get_classifier():
    global _classifier
    if _classifier is None:
        try:
            from .classifier import YamnetClassifier

            _classifier = YamnetClassifier()
        except ImportError:
            raise HTTPException(503, "tensorflow and tensorflow_hub are not installed")
    return _classifier


def creator_header(x_creator_id: str = Header(min_length=8, max_length=64)):
    return x_creator_id


def client_ip(request: Request):
    return request.client.host if request.client else "unknown"


def limited(name, attr, window):
    def dep(request: Request, store: EchoStore = Depends(get_store)):
        if not store.allow(f"{name}:{client_ip(request)}", getattr(config, attr), window):
            raise HTTPException(429, "rate limit exceeded", headers={"Retry-After": str(window)})

    return dep


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health(store: EchoStore = Depends(get_store)):
    return {"ok": True, "echoes": store.count()}


@app.post(
    "/echoes",
    response_model=Echo,
    status_code=201,
    dependencies=[Depends(limited("create", "CREATE_LIMIT_PER_HOUR", 3600))],
)
def create_echo(
    body: EchoCreate,
    creator_id: str = Depends(creator_header),
    store: EchoStore = Depends(get_store),
):
    if store.live_count(creator_id) >= config.MAX_LIVE_ECHOES_PER_CREATOR:
        raise HTTPException(409, "echo limit reached, delete some first")
    if body.kind == "creature":
        if body.creature not in CREATURES:
            raise HTTPException(422, f"creature must be one of {CREATURES}")
    elif not body.payload:
        raise HTTPException(422, "payload is required for voice and doodle echoes")
    return store.create(
        creator_id,
        body.kind,
        body.lat,
        body.lon,
        body.payload,
        body.creature,
        body.height,
    )


@app.get(
    "/echoes/nearby",
    response_model=list[Echo],
    dependencies=[Depends(limited("read", "READ_LIMIT_PER_MINUTE", 60))],
)
def nearby(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    radius: float = Query(default=50, gt=0, le=config.MAX_RADIUS_M),
    limit: int = Query(default=100, ge=1, le=500),
    store: EchoStore = Depends(get_store),
):
    return store.nearby(lat, lon, radius, limit)


@app.get("/echoes/mine", response_model=list[Echo])
def mine(
    creator_id: str = Depends(creator_header),
    store: EchoStore = Depends(get_store),
):
    return store.by_creator(creator_id)


@app.get("/echoes/{echo_id}", response_model=Echo)
def get_echo(echo_id: str, store: EchoStore = Depends(get_store)):
    echo = store.get(echo_id)
    if echo is None:
        raise HTTPException(404, "echo not found")
    return echo


@app.post("/echoes/{echo_id}/interact", response_model=Echo)
def interact(echo_id: str, store: EchoStore = Depends(get_store)):
    echo = store.interact(echo_id)
    if echo is None:
        raise HTTPException(404, "echo not found")
    return echo


@app.post("/echoes/{echo_id}/presence", response_model=PresenceOut)
def presence(
    echo_id: str,
    body: PresenceIn,
    user_id: str = Depends(creator_header),
    store: EchoStore = Depends(get_store),
):
    result = store.presence(echo_id, user_id, body.clip)
    if result is None:
        raise HTTPException(404, "echo not found")
    return result


@app.delete("/echoes/{echo_id}", status_code=204)
def delete_echo(
    echo_id: str,
    creator_id: str = Depends(creator_header),
    store: EchoStore = Depends(get_store),
):
    outcome = store.delete(echo_id, creator_id)
    if outcome == "missing":
        raise HTTPException(404, "echo not found")
    if outcome == "forbidden":
        raise HTTPException(403, "only the creator can delete this echo")


@app.post(
    "/classify",
    response_model=ClassifyOut,
    dependencies=[Depends(limited("classify", "CLASSIFY_LIMIT_PER_MINUTE", 60))],
)
def classify(body: ClassifyIn, classifier=Depends(get_classifier)):
    try:
        raw = base64.b64decode(body.pcm, validate=True)
    except binascii.Error:
        raise HTTPException(422, "pcm must be base64")
    if len(raw) < 2:
        raise HTTPException(422, "pcm is empty")
    samples = np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2")
    samples = samples[: config.SAMPLE_RATE * config.MAX_CLASSIFY_SECONDS]
    waveform = samples.astype(np.float32) / 32768.0
    creature, label, confidence = classifier.classify(waveform)
    return ClassifyOut(creature=creature, label=label, confidence=confidence)
