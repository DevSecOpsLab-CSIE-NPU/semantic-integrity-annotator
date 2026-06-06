# Semantic Integrity Annotator

A zero-backend static web tool for the **polarity source-consistency** human
annotation study that grounds the **Semantic Integrity Rate (SIR)** construct for
the JDIQ paper *“Semantic Integrity Rate: An Auditable Post-Repair Quality-Control
Metric for Machine-Generated Structured-Information Pipelines.”*

Annotators judge whether a **repaired label** (`positive` / `negative` / `neutral`)
is consistent with the **polarity** of a **source text**. The aggregated human
labels become the reference standard for the instrument's construct validity.

> This is the **JDIQ polarity** study. It is **distinct** from the TAC affective/VAD
> labeling study (a different instrument); do not mix their ratings.

## What's here

```
index.html                 # the annotation app (open in a browser)
assets/style.css, app.js    # UI + logic (vanilla JS, no dependencies)
data/items.json            # 221 BLINDED items (source_text + repaired_label only)
scripts/build_items.py      # blinded CSV  -> data/items.json
scripts/merge_results.py    # annotator CSVs -> harness-ready filled CSV
```

The framework's verdict and the ground truth are **never** in this repo — they stay
held out in the analysis harness (`framework_key.csv`) so the website cannot leak
them to annotators.

## For annotators

1. Open the published link (or `index.html` locally).
2. Enter your **annotator ID** (e.g. `A`, `B`, `C`).
3. For each item answer **YES** (consistent) or **NO** (distorted). Keyboard: `Y` / `N`, `←` / `→`.
   - Judge **polarity only**; for sarcasm/negation judge the writer's *intended* polarity.
   - Your progress autosaves in your browser — you can close and resume.
4. When all items are answered, click **Download my annotations** and send the
   `annotations_<id>.csv` back to the coordinator.

Nothing is uploaded; answers live only in your browser's localStorage.

## For the coordinator

**Publish (GitHub Pages):** push to `main`, then enable Pages → *Deploy from branch*
→ `main` / root. The app is fully static.

**Rebuild the item set** (if you re-sample in the harness):
```bash
python3 scripts/build_items.py /path/to/annotation_blinded.csv
```

**Raters:** 5 annotators, full overlap (every annotator labels all items); minimum
acceptable is 3. The judgement is **binary YES/NO**, not a 5-point/Likert scale.

### Data collection — two paths

**Path 1 (recommended): live submit to a Google Sheet.** Each answer is POSTed to a
Google Apps Script endpoint and upserted into a Sheet (per-item, so partial progress
is captured and nothing is lost if an annotator forgets to download). One-time setup:
1. Follow `google_apps_script/Code.gs` (create Sheet → paste script → deploy as Web
   app, access *Anyone* → copy the `/exec` URL).
2. Put the URL in `assets/config.js`: `window.SIA_ENDPOINT = "https://…/exec";` and push.
   The app shows a live "雲端已同步 N / M" counter and a **重新同步** button.
3. When done, download the Sheet's `responses` tab as CSV and convert:
```bash
python3 scripts/sheet_to_blinded.py \
  --sheet   responses.csv \
  --blinded /path/to/construct_validity/annotation_blinded.csv \
  --out     /path/to/construct_validity/annotation_blinded.csv
```

**Path 2 (zero-infra): manual CSV return.** Leave `SIA_ENDPOINT` empty — the app runs
download-only. Annotators click **下載我的標註** and return `annotations_<id>.csv`; merge:
```bash
python3 scripts/merge_results.py \
  --blinded /path/to/construct_validity/annotation_blinded.csv \
  --out     /path/to/construct_validity/annotation_blinded.csv \
  annotations_A.csv annotations_B.csv annotations_C.csv annotations_D.csv annotations_E.csv
# then, in the harness directory:
python3 compute_construct_validity.py
```
`compute_construct_validity.py` reports inter-rater Cohen/Fleiss κ + raw agreement
+ **PABAK**, framework-vs-human agreement and FP/FN, and a neutral-zone threshold
sweep. It **refuses to run on empty ratings** — no labels are ever fabricated.

## Provenance

Items are drawn from the real 18.2M-review corpus and scored by the exact production
SIR instrument (DistilBERT-SST2, ε = 0.50). Sampling/scoring code lives in the
analysis harness (`SCRIPTS/experiments/construct_validity/` of the paper repo).

## License

MIT (see `LICENSE`).
