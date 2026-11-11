export interface Echo {
  id: string;
  kind: "voice" | "doodle" | "creature";
  lat: number;
  lon: number;
  creature: string | null;
  creator_id: string;
  created_at: number;
  expires_at: number;
  strength: number;
  interactions: number;
  distance_m: number | null;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed with ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function fetchNearby(lat: number, lon: number, radiusM: number): Promise<Echo[]> {
  return call<Echo[]>(`/echoes/nearby?lat=${lat}&lon=${lon}&radius=${radiusM}&limit=500`);
}

export function fetchMine(creatorId: string): Promise<Echo[]> {
  return call<Echo[]>("/echoes/mine", { headers: { "X-Creator-Id": creatorId } });
}

export function removeEcho(id: string, creatorId: string): Promise<void> {
  return call<void>(`/echoes/${id}`, { method: "DELETE", headers: { "X-Creator-Id": creatorId } });
}
