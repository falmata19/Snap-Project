import { resample, TARGET_RATE, toPcm16Base64 } from "./pcm";

@component
export class VoiceCapture extends BaseScriptComponent {
    @input microphoneAsset: AudioTrackAsset;

    private provider: MicrophoneAudioProvider;
    private frame: Float32Array;

    onAwake() {
        this.provider = this.microphoneAsset.control as MicrophoneAudioProvider;
        this.frame = new Float32Array(this.provider.maxFrameSize);
    }

    record(seconds: number): Promise<string> {
        return new Promise((resolve) => {
            const rate = this.provider.sampleRate;
            const chunks: Float32Array[] = [];
            let total = 0;
            const wanted = Math.floor(seconds * rate);
            this.provider.start();
            const update = this.createEvent("UpdateEvent");
            update.bind(() => {
                const shape = this.provider.getAudioFrame(this.frame);
                if (shape.x > 0) {
                    chunks.push(this.frame.slice(0, shape.x));
                    total += shape.x;
                }
                if (total >= wanted) {
                    this.provider.stop();
                    this.removeEvent(update);
                    const merged = new Float32Array(total);
                    let offset = 0;
                    for (const chunk of chunks) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                    }
                    resolve(toPcm16Base64(resample(merged.slice(0, wanted), rate, TARGET_RATE)));
                }
            });
        });
    }
}
