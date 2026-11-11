import base64

import fakeredis
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.creatures import pick_creature
from app.main import app, get_classifier, get_store
from app.store import EchoStore

LAT, LON = 44.9778, -93.2650
ALICE = {"X-Creator-Id": "alice-0001"}
BOB = {"X-Creator-Id": "bobby-0002"}


class Clock:
    def __init__(self):
        self.t = 1_000_000.0

    def __call__(self):
        return self.t


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def client(clock):
    store = EchoStore(fakeredis.FakeRedis(decode_responses=True), 1000, 100, 60, clock=clock)
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()


def make(client, headers=ALICE, **overrides):
    body = {"kind": "voice", "lat": LAT, "lon": LON, "payload": "AAAA"}
    body.update(overrides)
    return client.post("/echoes", json=body, headers=headers)


def test_create_and_find_nearby(client):
    created = make(client)
    assert created.status_code == 201
    found = client.get("/echoes/nearby", params={"lat": LAT + 0.0001, "lon": LON, "radius": 50})
    assert [e["id"] for e in found.json()] == [created.json()["id"]]
    assert 0 < found.json()[0]["distance_m"] < 50


def test_far_echo_excluded(client):
    make(client, lat=LAT + 0.01)
    found = client.get("/echoes/nearby", params={"lat": LAT, "lon": LON, "radius": 50})
    assert found.json() == []


def test_echo_decays_and_is_purged(client, clock):
    make(client)
    clock.t += 1001
    found = client.get("/echoes/nearby", params={"lat": LAT, "lon": LON, "radius": 50})
    assert found.json() == []
    assert client.get("/health").json()["echoes"] == 0


def test_interaction_extends_life_up_to_cap(client, clock):
    echo_id = make(client).json()["id"]
    clock.t += 500
    boosted = client.post(f"/echoes/{echo_id}/interact").json()
    assert boosted["interactions"] == 1
    assert boosted["expires_at"] == clock.t + 600
    clock.t += 400
    again = client.post(f"/echoes/{echo_id}/interact").json()
    assert again["expires_at"] == clock.t + 300
    assert again["strength"] <= 1.0


def test_only_creator_can_delete(client):
    echo_id = make(client).json()["id"]
    assert client.delete(f"/echoes/{echo_id}", headers=BOB).status_code == 403
    assert client.delete(f"/echoes/{echo_id}", headers=ALICE).status_code == 204
    assert client.get(f"/echoes/{echo_id}").status_code == 404


def test_mine_lists_only_own(client):
    make(client)
    make(client, headers=BOB)
    mine = client.get("/echoes/mine", headers=ALICE).json()
    assert len(mine) == 1
    assert mine[0]["creator_id"] == "alice-0001"


def test_creature_validation(client):
    assert make(client, kind="creature", payload="", creature="nope").status_code == 422
    ok = make(client, kind="creature", payload="", creature="rumblet")
    assert ok.status_code == 201
    assert ok.json()["creature"] == "rumblet"


def test_voice_requires_payload(client):
    assert make(client, payload="").status_code == 422


def test_duet_between_two_users(client, clock):
    echo_id = make(client).json()["id"]
    first = client.post(f"/echoes/{echo_id}/presence", json={"clip": "ALICECLIP"}, headers=ALICE)
    assert first.json()["duet"] is False
    second = client.post(f"/echoes/{echo_id}/presence", json={"clip": "BOBCLIP"}, headers=BOB)
    body = second.json()
    assert body["duet"] is True
    assert body["partners"] == [{"user_id": "alice-0001", "clip": "ALICECLIP"}]
    clock.t += 61
    late = client.post(f"/echoes/{echo_id}/presence", json={}, headers=BOB)
    assert late.json()["duet"] is False


def test_pick_creature_aggregates_scores():
    top = [("Vehicle", 0.4), ("Speech", 0.3), ("Car", 0.2), ("Silence", 0.05)]
    assert pick_creature(top) == "rumblet"
    assert pick_creature([("Unmapped thing", 0.9)]) == "static"


class StubClassifier:
    def __init__(self):
        self.seen = None

    def classify(self, waveform):
        self.seen = waveform
        return "chorusling", "Music", 0.8


def test_classify_decodes_pcm(client):
    stub = StubClassifier()
    app.dependency_overrides[get_classifier] = lambda: stub
    pcm = (np.ones(16000, dtype="<i2") * 16384).tobytes()
    res = client.post("/classify", json={"pcm": base64.b64encode(pcm).decode()})
    assert res.status_code == 200
    assert res.json() == {"creature": "chorusling", "label": "Music", "confidence": 0.8}
    assert len(stub.seen) == 16000
    assert abs(float(stub.seen[0]) - 0.5) < 1e-6


def test_classify_rejects_bad_base64(client):
    app.dependency_overrides[get_classifier] = lambda: StubClassifier()
    assert client.post("/classify", json={"pcm": "!!!"}).status_code == 422


def test_security_headers_present(client):
    res = client.get("/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["cache-control"] == "no-store"


def test_create_rate_limit(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "CREATE_LIMIT_PER_HOUR", 2)
    codes = [make(client).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_live_echo_cap(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "MAX_LIVE_ECHOES_PER_CREATOR", 2)
    assert make(client).status_code == 201
    assert make(client).status_code == 201
    third = make(client)
    assert third.status_code == 409
    assert make(client, headers=BOB).status_code == 201
