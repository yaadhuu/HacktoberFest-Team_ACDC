"""Pipeline eval: 65 Wikimedia Commons photos (labels checked by hand) + 4 synthetic screenshots/charts/pages.

Usage:  python eval.py            # SigLIP + YOLO only
        python eval.py --verify   # also lets the Gemma verifier arbitrate (needs GEMINI_API_KEY)
Exit code 1 if any person is classified as food.
"""
from ultralytics import YOLO  # noqa: F401  -- load torch DLLs first (Windows)

import io
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, ImageDraw

load_dotenv()
import pipeline  # noqa: E402

HERE = Path(__file__).parent
IMG_DIR = HERE / "eval_images"
UA = {"User-Agent": "bliss-eval/0.1 (hackathon eval set)"}


def synthetic() -> list[tuple[str, Image.Image, str]]:
    out = []
    # chat app screenshot
    im = Image.new("RGB", (390, 844), "#f2f2f7"); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 390, 90], fill="#ffffff"); d.text((150, 50), "Messages", fill="black")
    for i, y in enumerate(range(120, 760, 90)):
        x0 = 20 if i % 2 else 140
        d.rounded_rectangle([x0, y, x0 + 230, y + 60], 18, fill="#0a84ff" if i % 2 == 0 else "#e5e5ea")
        d.text((x0 + 14, y + 22), "see you at 7 near the station?", fill="white" if i % 2 == 0 else "black")
    d.rectangle([0, 780, 390, 844], fill="white"); d.rounded_rectangle([20, 792, 370, 830], 18, outline="#c7c7cc")
    out.append(("synthetic_chat.png", im, "screenshots"))
    # code editor screenshot
    im = Image.new("RGB", (1280, 800), "#1e1e1e"); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1280, 30], fill="#323233"); d.rectangle([0, 30, 220, 800], fill="#252526")
    code = ["import numpy as np", "", "def softmax(x):", "    e = np.exp(x - x.max())", "    return e / e.sum()", "",
            "class Model:", "    def __init__(self, dim):", "        self.w = np.zeros(dim)", "", "    def forward(self, x):",
            "        return softmax(self.w @ x)"]
    for i, line in enumerate(code * 2):
        d.text((240, 50 + i * 30), f"{i + 1:>3}   {line}", fill="#9cdcfe" if "def" in line else "#d4d4d4")
    out.append(("synthetic_code.png", im, "screenshots"))
    # bar chart
    im = Image.new("RGB", (900, 600), "white"); d = ImageDraw.Draw(im)
    d.line([80, 520, 860, 520], fill="black", width=2); d.line([80, 520, 80, 60], fill="black", width=2)
    for i, h in enumerate([120, 260, 340, 200, 410, 300]):
        d.rectangle([120 + i * 120, 520 - h, 190 + i * 120, 520], fill=["#4c78a8", "#f58518", "#54a24b"][i % 3])
        d.text((130 + i * 120, 530), f"Q{i + 1}", fill="black")
    d.text((380, 25), "Quarterly revenue", fill="black")
    out.append(("synthetic_chart.png", im, "art"))
    # printed page
    im = Image.new("RGB", (850, 1100), "white"); d = ImageDraw.Draw(im)
    d.text((80, 80), "MEMORANDUM", fill="black")
    for i in range(38):
        d.text((80, 140 + i * 24), "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.", fill="black")
    out.append(("synthetic_page.png", im, "documents"))
    return out


def load_set():
    IMG_DIR.mkdir(exist_ok=True)
    items = []
    for e in json.loads((HERE / "eval_set.json").read_text()):
        p = IMG_DIR / e["file"]
        if not p.exists():
            p.write_bytes(urllib.request.urlopen(urllib.request.Request(e["url"], headers=UA), timeout=60).read())
        items.append((e, p.read_bytes()))
    for name, im, label in synthetic():
        buf = io.BytesIO(); im.save(buf, "PNG")
        items.append(({"file": name, "label": label, "accept": [label], "must_include": [], "note": "synthetic"}, buf.getvalue()))
    return items


def main():
    verify = "--verify" in sys.argv
    per = defaultdict(lambda: [0, 0])
    fails, person_food = [], []
    for e, raw in load_set():
        pre = pipeline.preprocess(raw)
        r = pipeline._analyze(pre["thumb"], use_verifier=verify)  # uncached on purpose: eval the current logic
        top = r["primary_category"].split("/")[0]
        tops = [c.split("/")[0] for c in r["categories"]]
        ok = top in e["accept"] and all(m in tops for m in e["must_include"])
        per[e["label"]][0] += ok
        per[e["label"]][1] += 1
        if e["label"] == "people" and top == "food":
            person_food.append(e["file"])
        if not ok:
            fails.append(f"  {e['file']:<22} want {'/'.join(e['accept']):<20} got {r['primary_category']:<22} "
                         f"cats={r['categories']} conf={r['confidence']} {r['verified_by']}  {e['note']}")
    total = sum(v[0] for v in per.values()), sum(v[1] for v in per.values())
    print(f"\nmode: {'siglip+yolo+gemma-verify' if verify else 'siglip+yolo'}")
    for k, (c, n) in sorted(per.items()):
        print(f"  {k:<14} {c:>3}/{n:<3} {c / n:6.1%}")
    print(f"  {'OVERALL':<14} {total[0]:>3}/{total[1]:<3} {total[0] / total[1]:6.1%}")
    print("\nfailures:" if fails else "\nno failures"); print("\n".join(fails))
    print(f"\nperson classified as food: {person_food or 'none'}  -> {'FAIL' if person_food else 'PASS'}")
    sys.exit(1 if person_food else 0)


if __name__ == "__main__":
    main()
