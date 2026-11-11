export type EchoKind = "voice" | "doodle" | "creature";

export interface Echo {
    id: string;
    kind: EchoKind;
    lat: number;
    lon: number;
    payload: string;
    creature: string | null;
    height: number;
    creator_id: string;
    created_at: number;
    expires_at: number;
    strength: number;
    interactions: number;
    distance_m: number | null;
}

export interface Partner {
    user_id: string;
    clip: string | null;
}

export interface PresenceResult {
    duet: boolean;
    partners: Partner[];
    echo: Echo;
}

export interface ClassifyResult {
    creature: string;
    label: string;
    confidence: number;
}

export interface GeoFix {
    lat: number;
    lon: number;
    cameraPosition: vec3;
    heading: number;
}
