import { GeoFix } from "./types";

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;

@component
export class GeoAnchor extends BaseScriptComponent {
    @input camera: Camera;
    @input pollSeconds: number = 1.0;

    private fix: GeoFix | null = null;
    private listeners: ((fix: GeoFix) => void)[] = [];
    private timer: DelayedCallbackEvent;

    onAwake() {
        this.timer = this.createEvent("DelayedCallbackEvent");
        this.timer.bind(() => this.poll());
        this.createEvent("OnStartEvent").bind(() => this.timer.reset(0));
    }

    onFix(listener: (fix: GeoFix) => void) {
        this.listeners.push(listener);
        if (this.fix) {
            listener(this.fix);
        }
    }

    current(): GeoFix | null {
        return this.fix;
    }

    private poll() {
        GeoLocation.getCurrentPosition(
            (position) => {
                const transform = this.camera.getTransform();
                const fix: GeoFix = {
                    lat: position.latitude,
                    lon: position.longitude,
                    cameraPosition: transform.getWorldPosition(),
                    heading: GeoLocation.getNorthAlignedHeading(transform.getWorldRotation()),
                };
                this.fix = fix;
                this.listeners.forEach((l) => l(fix));
                this.timer.reset(this.pollSeconds);
            },
            (error) => {
                print("Echoes location error: " + error);
                this.timer.reset(this.pollSeconds * 3);
            }
        );
    }

    toWorld(lat: number, lon: number, height: number): vec3 | null {
        if (!this.fix) {
            return null;
        }
        const north = (lat - this.fix.lat) * DEG * EARTH_RADIUS_M;
        const east = (lon - this.fix.lon) * DEG * EARTH_RADIUS_M * Math.cos(this.fix.lat * DEG);
        const forward = this.camera.getTransform().forward;
        const flat = new vec3(forward.x, 0, forward.z).normalize();
        const northDir = quat.angleAxis(this.fix.heading * DEG, vec3.up()).multiplyVec3(flat);
        const eastDir = quat.angleAxis(-Math.PI / 2, vec3.up()).multiplyVec3(northDir);
        return this.fix.cameraPosition
            .add(eastDir.uniformScale(east))
            .add(northDir.uniformScale(north))
            .add(vec3.up().uniformScale(height));
    }

    metersBetween(lat: number, lon: number): number {
        if (!this.fix) {
            return Infinity;
        }
        const north = (lat - this.fix.lat) * DEG * EARTH_RADIUS_M;
        const east = (lon - this.fix.lon) * DEG * EARTH_RADIUS_M * Math.cos(this.fix.lat * DEG);
        return Math.sqrt(north * north + east * east);
    }
}
