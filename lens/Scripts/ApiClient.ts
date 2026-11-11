import { ClassifyResult, Echo, EchoKind, PresenceResult } from "./types";

@component
export class ApiClient extends BaseScriptComponent {
    @input internetModule: InternetModule;
    @input baseUrl: string = "http://localhost:8000";

    private creatorId: string = "";

    onAwake() {
        this.creatorId = this.loadCreatorId();
        print("Echoes creator id: " + this.creatorId);
    }

    getCreatorId(): string {
        return this.creatorId;
    }

    private loadCreatorId(): string {
        const store = global.persistentStorageSystem.store;
        const saved = store.getString("echoes_creator_id");
        if (saved && saved.length >= 8) {
            return saved;
        }
        let id = "";
        for (let i = 0; i < 16; i++) {
            id += Math.floor(Math.random() * 16).toString(16);
        }
        store.putString("echoes_creator_id", id);
        return id;
    }

    private async request<T>(method: string, path: string, body?: object): Promise<T> {
        const response = await this.internetModule.fetch(this.baseUrl + path, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "X-Creator-Id": this.creatorId,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(method + " " + path + " failed with " + response.status);
        }
        if (response.status === 204) {
            return null as T;
        }
        return (await response.json()) as T;
    }

    createEcho(
        kind: EchoKind,
        lat: number,
        lon: number,
        payload: string,
        creature: string | null,
        height: number
    ): Promise<Echo> {
        return this.request<Echo>("POST", "/echoes", { kind, lat, lon, payload, creature, height });
    }

    nearby(lat: number, lon: number, radius: number): Promise<Echo[]> {
        return this.request<Echo[]>("GET", "/echoes/nearby?lat=" + lat + "&lon=" + lon + "&radius=" + radius);
    }

    interact(echoId: string): Promise<Echo> {
        return this.request<Echo>("POST", "/echoes/" + echoId + "/interact");
    }

    presence(echoId: string, clip: string | null): Promise<PresenceResult> {
        return this.request<PresenceResult>("POST", "/echoes/" + echoId + "/presence", { clip });
    }

    classify(pcm: string): Promise<ClassifyResult> {
        return this.request<ClassifyResult>("POST", "/classify", { pcm });
    }

    remove(echoId: string): Promise<void> {
        return this.request<void>("DELETE", "/echoes/" + echoId);
    }
}
