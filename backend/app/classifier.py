import csv

import numpy as np

from .config import YAMNET_WINDOW
from .creatures import pick_creature

YAMNET_URL = "https://tfhub.dev/google/yamnet/1"


class YamnetClassifier:
    def __init__(self):
        import tensorflow_hub as hub

        self.model = hub.load(YAMNET_URL)
        with open(self.model.class_map_path().numpy().decode("utf-8")) as f:
            self.names = [row["display_name"] for row in csv.DictReader(f)]

    def classify(self, waveform):
        if len(waveform) < YAMNET_WINDOW:
            waveform = np.pad(waveform, (0, YAMNET_WINDOW - len(waveform)))
        scores, _, _ = self.model(waveform.astype(np.float32))
        mean = scores.numpy().mean(axis=0)
        order = np.argsort(mean)[::-1][:5]
        top = [(self.names[i], float(mean[i])) for i in order]
        return pick_creature(top), top[0][0], top[0][1]
