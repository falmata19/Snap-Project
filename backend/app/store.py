import time
import uuid

GEO_KEY = "echoes:geo"


class EchoStore:
    def __init__(self, client, decay_seconds, boost_seconds, duet_window, clock=time.time):
        self.r = client
        self.decay = decay_seconds
        self.boost = boost_seconds
        self.window = duet_window
        self.clock = clock

    def _key(self, echo_id):
        return f"echo:{echo_id}"

    def _build(self, data, distance=None):
        now = self.clock()
        expires_at = float(data["expires_at"])
        strength = max(0.0, min(1.0, (expires_at - now) / self.decay))
        return {
            "id": data["id"],
            "kind": data["kind"],
            "lat": float(data["lat"]),
            "lon": float(data["lon"]),
            "payload": data["payload"],
            "creature": data["creature"] or None,
            "height": float(data["height"]),
            "creator_id": data["creator_id"],
            "created_at": float(data["created_at"]),
            "expires_at": expires_at,
            "strength": strength,
            "interactions": int(data["interactions"]),
            "distance_m": distance,
        }

    def _alive(self, data):
        return bool(data) and float(data["expires_at"]) > self.clock()

    def create(self, creator_id, kind, lat, lon, payload, creature, height):
        echo_id = uuid.uuid4().hex
        now = self.clock()
        pipe = self.r.pipeline()
        pipe.hset(
            self._key(echo_id),
            mapping={
                "id": echo_id,
                "kind": kind,
                "lat": lat,
                "lon": lon,
                "payload": payload,
                "creature": creature or "",
                "height": height,
                "creator_id": creator_id,
                "created_at": now,
                "expires_at": now + self.decay,
                "interactions": 0,
            },
        )
        pipe.geoadd(GEO_KEY, (lon, lat, echo_id))
        pipe.sadd(f"creator:{creator_id}", echo_id)
        pipe.execute()
        return self.get(echo_id)

    def get(self, echo_id):
        data = self.r.hgetall(self._key(echo_id))
        if not data:
            return None
        if not self._alive(data):
            self._purge(echo_id, data.get("creator_id"))
            return None
        return self._build(data)

    def _purge(self, echo_id, creator_id=None):
        pipe = self.r.pipeline()
        pipe.zrem(GEO_KEY, echo_id)
        pipe.delete(self._key(echo_id))
        pipe.delete(f"presence:{echo_id}")
        if creator_id:
            pipe.srem(f"creator:{creator_id}", echo_id)
        pipe.execute()

    def delete(self, echo_id, creator_id):
        data = self.r.hgetall(self._key(echo_id))
        if not data:
            return "missing"
        if data["creator_id"] != creator_id:
            return "forbidden"
        self._purge(echo_id, creator_id)
        return "deleted"

    def interact(self, echo_id):
        data = self.r.hgetall(self._key(echo_id))
        if not data:
            return None
        if not self._alive(data):
            self._purge(echo_id, data.get("creator_id"))
            return None
        now = self.clock()
        expires_at = min(now + self.decay, float(data["expires_at"]) + self.boost)
        pipe = self.r.pipeline()
        pipe.hset(self._key(echo_id), "expires_at", expires_at)
        pipe.hincrby(self._key(echo_id), "interactions", 1)
        pipe.execute()
        return self.get(echo_id)

    def nearby(self, lat, lon, radius_m, limit):
        found = self.r.geosearch(
            GEO_KEY,
            longitude=lon,
            latitude=lat,
            radius=radius_m,
            unit="m",
            withdist=True,
            sort="ASC",
            count=limit,
        )
        if not found:
            return []
        pipe = self.r.pipeline()
        for item in found:
            pipe.hgetall(self._key(item[0]))
        rows = pipe.execute()
        echoes = []
        for item, data in zip(found, rows):
            if not data:
                self.r.zrem(GEO_KEY, item[0])
                continue
            if not self._alive(data):
                self._purge(item[0], data.get("creator_id"))
                continue
            echoes.append(self._build(data, float(item[1])))
        return echoes

    def by_creator(self, creator_id):
        ids = self.r.smembers(f"creator:{creator_id}")
        echoes = []
        for echo_id in ids:
            echo = self.get(echo_id)
            if echo is None:
                self.r.srem(f"creator:{creator_id}", echo_id)
            else:
                echoes.append(echo)
        echoes.sort(key=lambda e: e["created_at"], reverse=True)
        return echoes

    def presence(self, echo_id, user_id, clip):
        echo = self.get(echo_id)
        if echo is None:
            return None
        now = self.clock()
        zkey = f"presence:{echo_id}"
        pipe = self.r.pipeline()
        pipe.zadd(zkey, {user_id: now})
        pipe.zremrangebyscore(zkey, 0, now - self.window)
        pipe.expire(zkey, self.window * 2)
        if clip:
            pipe.set(f"clip:{echo_id}:{user_id}", clip, ex=self.window)
        pipe.execute()
        users = [u for u in self.r.zrange(zkey, 0, -1) if u != user_id]
        partners = []
        for u in users:
            partners.append({"user_id": u, "clip": self.r.get(f"clip:{echo_id}:{u}")})
        return {"duet": bool(partners), "partners": partners, "echo": echo}

    def count(self):
        return self.r.zcard(GEO_KEY)

    def allow(self, bucket, limit, window):
        key = f"rl:{bucket}"
        pipe = self.r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window, nx=True)
        used = pipe.execute()[0]
        return used <= limit

    def live_count(self, creator_id):
        return self.r.scard(f"creator:{creator_id}")
