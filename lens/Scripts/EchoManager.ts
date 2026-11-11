import { ApiClient } from "./ApiClient";
import { CreatureSpawner } from "./CreatureSpawner";
import { EchoPlayer } from "./EchoPlayer";
import { GeoAnchor } from "./GeoAnchor";
import { VoiceCapture } from "./VoiceCapture";
import { Echo, GeoFix } from "./types";

interface Placed {
    echo: Echo;
    object: SceneObject;
    heardAt: number;
    interactedAt: number;
    dwellStart: number;
}

@component
export class EchoManager extends BaseScriptComponent {
    @input api: ApiClient;
    @input anchor: GeoAnchor;
    @input voice: VoiceCapture;
    @input player: EchoPlayer;
    @input spawner: CreatureSpawner;
    @input orbPrefab: ObjectPrefab;
    @input doodlePointPrefab: ObjectPrefab;
    @input searchRadius: number = 50;
    @input refreshSeconds: number = 3;
    @input listenRadius: number = 8;
    @input interactRadius: number = 3;
    @input dwellSeconds: number = 3;
    @input voiceSeconds: number = 5;
    @input ambientSeconds: number = 1.5;

    private placed: { [id: string]: Placed } = {};
    private refreshing = false;
    private lastRefresh = 0;
    private lastPresence = 0;

    onAwake() {
        this.createEvent("UpdateEvent").bind(() => this.tick());
    }

    async placeVoiceEcho() {
        const fix = this.anchor.current();
        if (!fix) {
            return;
        }
        const clip = await this.voice.record(this.voiceSeconds);
        await this.api.createEcho("voice", fix.lat, fix.lon, clip, null, 1.4);
        this.lastRefresh = 0;
    }

    async placeCreatureEcho() {
        const fix = this.anchor.current();
        if (!fix) {
            return;
        }
        const ambient = await this.voice.record(this.ambientSeconds);
        const result = await this.api.classify(ambient);
        print("Ambient: " + result.label + " -> " + result.creature);
        await this.api.createEcho("creature", fix.lat, fix.lon, "", result.creature, 0.5);
        this.lastRefresh = 0;
    }

    placeDoodleEcho(points: vec3[]) {
        const fix = this.anchor.current();
        if (!fix || points.length === 0) {
            return;
        }
        const origin = this.anchor.toWorld(fix.lat, fix.lon, 0);
        const relative = points.slice(0, 200).map((p) => [p.x - origin.x, p.y - origin.y, p.z - origin.z]);
        this.api.createEcho("doodle", fix.lat, fix.lon, JSON.stringify(relative), null, 0);
        this.lastRefresh = 0;
    }

    private tick() {
        const fix = this.anchor.current();
        if (!fix) {
            return;
        }
        const now = getTime();
        if (!this.refreshing && now - this.lastRefresh >= this.refreshSeconds) {
            this.refreshing = true;
            this.lastRefresh = now;
            this.refresh(fix).then(
                () => (this.refreshing = false),
                (error) => {
                    print("Echoes refresh failed: " + error);
                    this.refreshing = false;
                }
            );
        }
        this.updateProximity(now);
    }

    private async refresh(fix: GeoFix) {
        const echoes = await this.api.nearby(fix.lat, fix.lon, this.searchRadius);
        const seen: { [id: string]: boolean } = {};
        for (const echo of echoes) {
            seen[echo.id] = true;
            const position = this.anchor.toWorld(echo.lat, echo.lon, echo.height);
            if (!position) {
                continue;
            }
            const existing = this.placed[echo.id];
            if (existing) {
                existing.echo = echo;
                existing.object.getTransform().setWorldPosition(position);
                continue;
            }
            this.placed[echo.id] = {
                echo: echo,
                object: this.build(echo, position),
                heardAt: -999,
                interactedAt: -999,
                dwellStart: -1,
            };
        }
        for (const id in this.placed) {
            if (!seen[id]) {
                this.placed[id].object.destroy();
                delete this.placed[id];
            }
        }
    }

    private build(echo: Echo, position: vec3): SceneObject {
        if (echo.kind === "creature") {
            return this.spawner.spawn(echo.creature, position, echo.strength);
        }
        if (echo.kind === "doodle") {
            const root = global.scene.createSceneObject("doodle");
            root.getTransform().setWorldPosition(position);
            const points: number[][] = JSON.parse(echo.payload);
            for (const p of points) {
                const dot = this.doodlePointPrefab.instantiate(root);
                dot.getTransform().setLocalPosition(new vec3(p[0], p[1], p[2]));
            }
            return root;
        }
        const orb = this.orbPrefab.instantiate(this.getSceneObject());
        orb.getTransform().setWorldPosition(position);
        const scale = 0.5 + 0.5 * echo.strength;
        orb.getTransform().setWorldScale(new vec3(scale, scale, scale));
        return orb;
    }

    private updateProximity(now: number) {
        let closest: Placed | null = null;
        let closestDistance = Infinity;
        for (const id in this.placed) {
            const item = this.placed[id];
            const distance = this.anchor.metersBetween(item.echo.lat, item.echo.lon);
            if (distance < closestDistance) {
                closest = item;
                closestDistance = distance;
            }
            if (distance > this.interactRadius) {
                item.dwellStart = -1;
            } else if (item.dwellStart < 0) {
                item.dwellStart = now;
            } else if (now - item.dwellStart >= this.dwellSeconds && now - item.interactedAt > 600) {
                item.interactedAt = now;
                this.api.interact(item.echo.id).catch((e) => print("interact failed: " + e));
            }
        }
        if (!closest || closestDistance > this.listenRadius) {
            return;
        }
        if (closest.echo.kind === "voice" && now - closest.heardAt > 30) {
            closest.heardAt = now;
            this.listen(closest, closestDistance <= this.interactRadius);
        }
    }

    private async listen(item: Placed, nearEnough: boolean) {
        const clips = [item.echo.payload];
        const position = item.object.getTransform().getWorldPosition();
        if (nearEnough && getTime() - this.lastPresence > 5) {
            this.lastPresence = getTime();
            try {
                const result = await this.api.presence(item.echo.id, null);
                if (result.duet) {
                    result.partners.forEach((p) => p.clip && clips.push(p.clip));
                }
            } catch (error) {
                print("presence failed: " + error);
            }
        }
        this.player.play(clips, position);
    }
}
