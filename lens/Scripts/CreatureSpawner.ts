@component
export class CreatureSpawner extends BaseScriptComponent {
    @input creatureNames: string[];
    @input creaturePrefabs: ObjectPrefab[];
    @input fallbackPrefab: ObjectPrefab;
    @input bobHeight: number = 8;
    @input bobSpeed: number = 1.5;

    spawn(creature: string | null, position: vec3, strength: number): SceneObject {
        const index = creature ? this.creatureNames.indexOf(creature) : -1;
        const prefab = index >= 0 ? this.creaturePrefabs[index] : this.fallbackPrefab;
        const object = prefab.instantiate(this.getSceneObject());
        const transform = object.getTransform();
        transform.setWorldPosition(position);
        const scale = 0.4 + 0.6 * strength;
        transform.setWorldScale(new vec3(scale, scale, scale));
        const phase = Math.random() * Math.PI * 2;
        const base = position;
        this.createEvent("UpdateEvent").bind(() => {
            if (isNull(object)) {
                return;
            }
            const offset = Math.sin(getTime() * this.bobSpeed + phase) * this.bobHeight * 0.01;
            transform.setWorldPosition(new vec3(base.x, base.y + offset, base.z));
        });
        return object;
    }
}
