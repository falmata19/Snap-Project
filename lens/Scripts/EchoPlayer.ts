import { fromPcm16Base64, mix, TARGET_RATE } from "./pcm";

@component
export class EchoPlayer extends BaseScriptComponent {
    @input audio: AudioComponent;

    private output: AudioOutputProvider;

    onAwake() {
        const track = global.scene.createAudioTrackFromProvider("EchoOutput");
        this.audio.audioTrack = track;
        this.output = track.control as AudioOutputProvider;
        this.output.sampleRate = TARGET_RATE;
    }

    play(clips: string[], position?: vec3) {
        if (clips.length === 0) {
            return;
        }
        const mixed = mix(clips.map(fromPcm16Base64));
        if (position) {
            this.audio.getSceneObject().getTransform().setWorldPosition(position);
        }
        this.audio.play(-1);
        const step = 4096;
        for (let offset = 0; offset < mixed.length; offset += step) {
            const slice = mixed.slice(offset, Math.min(offset + step, mixed.length));
            this.output.enqueueAudioFrame(slice, new vec3(slice.length, 1, 0));
        }
    }
}
