export const TARGET_RATE = 16000;

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
        return input;
    }
    const ratio = fromRate / toRate;
    const length = Math.floor(input.length / ratio);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const pos = i * ratio;
        const index = Math.floor(pos);
        const next = Math.min(index + 1, input.length - 1);
        const frac = pos - index;
        out[i] = input[index] * (1 - frac) + input[next] * frac;
    }
    return out;
}

export function toPcm16Base64(samples: Float32Array): string {
    const bytes = new Uint8Array(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        const value = Math.round(clamped * 32767);
        const unsigned = value < 0 ? value + 65536 : value;
        bytes[i * 2] = unsigned & 255;
        bytes[i * 2 + 1] = unsigned >> 8;
    }
    return Base64.encode(bytes);
}

export function fromPcm16Base64(encoded: string): Float32Array {
    const bytes = Base64.decode(encoded);
    const out = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < out.length; i++) {
        let value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
        if (value >= 32768) {
            value -= 65536;
        }
        out[i] = value / 32768;
    }
    return out;
}

export function mix(clips: Float32Array[]): Float32Array {
    const length = clips.reduce((m, c) => Math.max(m, c.length), 0);
    const out = new Float32Array(length);
    for (const clip of clips) {
        for (let i = 0; i < clip.length; i++) {
            out[i] += clip[i];
        }
    }
    const gain = 1 / Math.max(1, clips.length * 0.7);
    for (let i = 0; i < length; i++) {
        out[i] = Math.max(-1, Math.min(1, out[i] * gain));
    }
    return out;
}
