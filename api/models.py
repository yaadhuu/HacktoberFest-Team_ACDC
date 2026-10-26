"""Open-weight models: SigLIP (embeddings + zero-shot), YOLO11 (objects/person), OpenCV Haar (faces)."""
import hashlib
import json
import os
import threading
from pathlib import Path

from ultralytics import YOLO  # must load first on Windows: later import order segfaults SigLIP load (DLL clash)

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from transformers import AutoModel, AutoProcessor  # noqa: E402

SIGLIP_ID = os.getenv("SIGLIP_MODEL", "google/siglip-base-patch16-224")
YOLO_WEIGHTS = os.getenv("YOLO_WEIGHTS", "yolo11n.pt")
CACHE = Path(__file__).parent / "cache"
CACHE.mkdir(exist_ok=True)

# Prompt ensembling: every description is rendered through every template, embeddings averaged.
TEMPLATES = [
    "a photo of {}.",
    "a close-up photo of {}.",
    "a blurry photo of {}.",
    "a cropped photo of {}.",
    "an image showing {}.",
]

# Hierarchical taxonomy: (slug, label, parent, descriptions)
TAXONOMY: list[tuple[str, str, str | None, list[str]]] = [
    ("people", "People", None, ["a person", "people", "a man", "a woman", "a child", "a human face"]),
    ("people/portrait", "Portrait", "people", ["a portrait of a person", "a headshot of a person", "a person posing for a photo"]),
    ("people/group", "Group", "people", ["a group of people", "a crowd of people", "friends posing together"]),
    ("people/selfie", "Selfie", "people", ["a selfie", "a person taking a selfie with a phone at arm's length"]),

    ("food", "Food & drink", None, ["food", "a meal", "a plate of food", "a dish of food", "a snack", "a drink"]),
    ("food/dish", "Dishes", "food", ["a cooked dish", "a plate of food on a table", "a bowl of noodles", "a pizza"]),
    ("food/drink", "Drinks", "food", ["a cup of coffee", "a glass of juice", "a cocktail", "a cup of tea"]),
    ("food/dessert", "Desserts", "food", ["a dessert", "a cake", "ice cream", "pastries", "donuts"]),
    ("food/produce", "Produce", "food", ["fresh fruit", "vegetables", "groceries at a market"]),

    ("nature", "Nature", None, ["nature", "a landscape", "outdoor scenery"]),
    ("nature/mountains", "Mountains", "nature", ["mountains", "a mountain landscape", "hills"]),
    ("nature/water", "Water & coast", "nature", ["a beach", "the ocean", "a lake", "a river", "a waterfall"]),
    ("nature/forest", "Forest", "nature", ["a forest", "trees in the woods"]),
    ("nature/sky", "Sky", "nature", ["a sunset", "the sky with clouds", "a starry night sky"]),
    ("nature/plants", "Plants & flowers", "nature", ["flowers", "a plant", "a garden"]),

    ("animals", "Animals", None, ["an animal", "a pet", "wildlife"]),
    ("animals/dogs", "Dogs", "animals", ["a dog", "a puppy"]),
    ("animals/cats", "Cats", "animals", ["a cat", "a kitten"]),
    ("animals/birds", "Birds", "animals", ["a bird"]),
    ("animals/wild", "Wildlife", "animals", ["a wild animal", "a zebra", "an elephant", "a bear", "a giraffe", "a lion"]),

    ("architecture", "Architecture", None, ["a building", "architecture", "a city"]),
    ("architecture/exterior", "Buildings", "architecture", ["a building exterior", "a skyscraper", "a historic church", "a house"]),
    ("architecture/interior", "Interiors", "architecture", ["the interior of a room", "a living room", "a bedroom", "an office interior"]),
    ("architecture/street", "Streets", "architecture", ["a city street", "a cityscape", "a road with buildings"]),

    ("documents", "Documents", None, ["a document", "a page of text", "a paper document"]),
    ("documents/receipt", "Receipts", "documents", ["a receipt", "an invoice", "a bill"]),
    ("documents/notes", "Notes", "documents", ["handwritten notes", "a notebook page with handwriting", "a whiteboard with writing"]),
    ("documents/printed", "Printed pages", "documents", ["a printed page of text", "a book page", "a letter"]),
    ("documents/sign", "Signs & posters", "documents", ["a sign with text", "a poster with text", "a street sign"]),

    ("screenshots", "Screenshots", None, ["a screenshot", "a screenshot of a phone app", "a screenshot of a website", "a computer screen capture"]),
    ("screenshots/app", "App screens", "screenshots", ["a screenshot of a mobile app", "a chat conversation screenshot"]),
    ("screenshots/web", "Web pages", "screenshots", ["a screenshot of a web page", "a website in a browser"]),
    ("screenshots/code", "Code", "screenshots", ["a screenshot of source code", "a code editor", "a terminal window"]),

    ("products", "Objects & products", None, ["a product photo", "an object on a table", "household objects"]),
    ("products/electronics", "Electronics", "products", ["a laptop", "a smartphone", "electronics", "a computer keyboard"]),
    ("products/fashion", "Fashion", "products", ["clothing", "shoes", "a handbag", "a watch"]),
    ("products/home", "Home & kitchen", "products", ["furniture", "kitchen utensils", "a kitchen knife", "a chair"]),

    ("art", "Art & diagrams", None, ["artwork", "an illustration", "a painting", "a drawing"]),
    ("art/painting", "Paintings", "art", ["a painting", "an oil painting", "a watercolor"]),
    ("art/diagram", "Diagrams & charts", "art", ["a diagram", "a chart", "a bar graph", "an infographic", "a flowchart"]),
    ("art/sketch", "Sketches", "art", ["a pencil sketch", "a doodle", "a line drawing"]),

    ("vehicles", "Vehicles", None, ["a vehicle", "transportation"]),
    ("vehicles/car", "Cars", "vehicles", ["a car", "a truck"]),
    ("vehicles/bike", "Bikes", "vehicles", ["a bicycle", "a motorcycle"]),
    ("vehicles/transit", "Transit", "vehicles", ["a bus", "a train", "an airplane", "a boat"]),

    ("events", "Events", None, ["an event", "a party", "a celebration"]),
    ("events/party", "Parties", "events", ["a birthday party", "people celebrating"]),
    ("events/concert", "Concerts", "events", ["a concert", "a music performance on stage"]),
    ("events/sports", "Sports", "events", ["a sports game", "people playing sports", "an athlete"]),
    ("events/wedding", "Weddings", "events", ["a wedding", "a bride and groom"]),
]

COCO_FOOD = {"banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"}

_lock = threading.Lock()  # ponytail: one global inference lock; per-model workers if throughput matters


class Models:
    def __init__(self):
        torch.set_grad_enabled(False)
        self.siglip = AutoModel.from_pretrained(SIGLIP_ID).eval()
        self.proc = AutoProcessor.from_pretrained(SIGLIP_ID)
        self.scale = float(self.siglip.logit_scale.exp())
        self.bias = float(self.siglip.logit_bias)
        self.yolo = YOLO(YOLO_WEIGHTS)
        self.faces = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self.labels: list[dict] = []
        self.label_embs = np.zeros((0, 768), np.float32)
        self.set_taxonomy([
            {"slug": s, "label": l, "parent": p, "prompts": d, "dynamic": False} for s, l, p, d in TAXONOMY
        ])

    # ---------- embeddings ----------
    @staticmethod
    def _feats(out) -> torch.Tensor:
        return out if isinstance(out, torch.Tensor) else out.pooler_output

    def embed_images(self, imgs: list[Image.Image]) -> np.ndarray:
        with _lock:
            inp = self.proc(images=imgs, return_tensors="pt")
            f = self._feats(self.siglip.get_image_features(**inp))
        f = torch.nn.functional.normalize(f, dim=-1)
        return f.numpy().astype(np.float32)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        with _lock:
            inp = self.proc(text=texts, padding="max_length", truncation=True, return_tensors="pt")
            f = self._feats(self.siglip.get_text_features(**inp))
        f = torch.nn.functional.normalize(f, dim=-1)
        return f.numpy().astype(np.float32)

    def embed_label(self, descriptions: list[str]) -> np.ndarray:
        e = self.embed_texts([t.format(d) for d in descriptions for t in TEMPLATES]).mean(0)
        return (e / np.linalg.norm(e)).astype(np.float32)

    def prob(self, cos: np.ndarray) -> np.ndarray:
        """SigLIP is trained with a sigmoid loss, so this is an independent per-label probability."""
        return 1 / (1 + np.exp(-(self.scale * cos + self.bias)))

    # ---------- taxonomy ----------
    def set_taxonomy(self, labels: list[dict]):
        key = hashlib.sha1(json.dumps([(l["slug"], l["prompts"]) for l in labels]).encode()).hexdigest()[:12]
        f = CACHE / f"taxonomy_{key}.npy"
        if f.exists():
            embs = np.load(f)
        else:
            embs = np.stack([l.get("embedding") if l.get("embedding") is not None else self.embed_label(l["prompts"]) for l in labels])
            np.save(f, embs)
        self.labels, self.label_embs = labels, embs.astype(np.float32)

    def add_label(self, label: dict, emb: np.ndarray):
        self.labels = [*self.labels, {**label, "embedding": emb}]
        self.label_embs = np.vstack([self.label_embs, emb[None]])

    # ---------- detection ----------
    def detect(self, img: Image.Image) -> list[dict]:
        with _lock:
            r = self.yolo.predict(img, imgsz=640, conf=0.25, verbose=False)[0]
        names = r.names
        out = []
        for box, conf, cls in zip(r.boxes.xyxyn.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
            x1, y1, x2, y2 = box
            out.append({"label": names[int(cls)], "conf": round(conf, 3),
                        "box": [round(x1, 4), round(y1, 4), round(x2 - x1, 4), round(y2 - y1, 4)]})
        return out

    def count_faces(self, img: Image.Image) -> int:
        g = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY)
        side = min(g.shape)
        found = self.faces.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(max(24, side // 12),) * 2)
        return len(found)


_models: Models | None = None


def get_models() -> Models:
    global _models
    if _models is None:
        _models = Models()
    return _models
