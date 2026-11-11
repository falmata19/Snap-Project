# Echoes

Geo-persistent AR Lens. Leave a voice clip, a 3D doodle, or an ambient-sound creature at a real place. Anyone who walks within 50m later sees and hears it.

## Layout

- `backend/` FastAPI + Redis geo store, decay, duet detection, YAMNet classifier
- `lens/Scripts/` Lens Studio TypeScript components
- `dashboard/` Next.js + Leaflet map with density heat and moderation

## Run the backend

```
docker compose up --build
```

Or locally:

```
cd backend
pip install -r requirements-dev.txt
pytest
REDIS_URL=redis://localhost:6379/0 uvicorn app.main:app --reload
```

For `/classify`, also `pip install -r requirements-ml.txt`. YAMNet downloads from TF Hub on the first request.

## Run the dashboard

```
cd dashboard
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` if the API is not on `http://localhost:8000`.

## Lens Studio setup

1. Create a project and copy `lens/Scripts/*.ts` into it.
2. Add one SceneObject per component: `ApiClient`, `GeoAnchor`, `VoiceCapture`, `EchoPlayer`, `CreatureSpawner`, `EchoManager`.
3. Wire inputs: `InternetModule` and base URL on `ApiClient`, the camera on `GeoAnchor`, a Microphone Audio asset on `VoiceCapture`, an Audio Component on `EchoPlayer`, and the other components plus prefabs on `EchoManager`.
4. `CreatureSpawner.creatureNames` must match: rumblet, hushmoth, chorusling, leafwisp, murmurkin, dripple, static. `creaturePrefabs` is the parallel list.
5. Call `EchoManager.placeVoiceEcho()` and `placeCreatureEcho()` from a button or pinch.
6. The creator id prints in the Lens log. Paste it into the dashboard to manage your echoes.

Point `ApiClient.baseUrl` at a public HTTPS URL when testing on a device.

## Behavior

- Echoes last 7 days. Each interaction adds up to 1 day, capped at a full 7. Expired echoes are purged on read.
- Standing within 3m for 3s counts as an interaction.
- Two users within 3m of the same voice echo inside 60s trigger a duet. Their clips are mixed on playback.
- Creature type comes from the top YAMNet classes for 1.5s of ambient audio, mapped in `backend/app/creatures.py`.

## Known limits

- The creator id is a bearer header with no real auth. Writes are rate limited per IP and capped at 200 live echoes per creator, configurable through env vars in `backend/app/config.py`.
- AR placement uses GPS plus compass heading, so expect several meters of drift outdoors and worse indoors.
