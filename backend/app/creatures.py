CREATURES = [
    "rumblet",
    "hushmoth",
    "chorusling",
    "leafwisp",
    "murmurkin",
    "dripple",
    "static",
]

RULES = [
    ("rumblet", ("vehicle", "car", "engine", "traffic", "truck", "bus", "train", "siren", "horn", "motor", "aircraft", "idling", "jackhammer")),
    ("chorusling", ("music", "singing", "guitar", "piano", "drum", "choir", "song", "instrument", "synthesizer")),
    ("murmurkin", ("speech", "crowd", "conversation", "chatter", "laughter", "babble", "applause", "cheering", "narration")),
    ("leafwisp", ("bird", "wind", "rustl", "insect", "cricket", "frog", "animal", "leaves", "tweet", "owl")),
    ("dripple", ("water", "rain", "stream", "ocean", "drip", "splash", "waves", "fountain", "raindrop")),
    ("hushmoth", ("silence", "inside", "small room", "breathing", "white noise", "quiet")),
]


def creature_for(label):
    name = label.lower()
    for creature, keywords in RULES:
        if any(k in name for k in keywords):
            return creature
    return None


def pick_creature(top):
    totals = {}
    for label, score in top:
        creature = creature_for(label)
        if creature:
            totals[creature] = totals.get(creature, 0.0) + score
    if not totals:
        return "static"
    return max(totals, key=totals.get)
