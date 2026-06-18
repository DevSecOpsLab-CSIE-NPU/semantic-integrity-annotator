"""
watch_and_score.py
==================
Poll the live annotation endpoint and, as soon as >= N INDEPENDENT raters have each
completed all 210 items, automatically build the harness CSV and run the real
construct-validity scoring (Cohen/Fleiss kappa + PABAK + framework agreement/FP/FN).

It does NOT invent any data: it only ever scores ratings actually fetched from the
Sheet, and the downstream compute_construct_validity.py keeps its own hard
anti-fabrication gate.

AUG_rubricB (AUG's intra-rater retest under a second rubric) is excluded from the
independent-rater count and from scoring, matching sheet_to_blinded.py.

Usage:
    # one-shot check (prints progress; scores if ready):
    python3 scripts/watch_and_score.py

    # keep watching every 10 min until ready, then score and stop:
    python3 scripts/watch_and_score.py --watch 600

    # require 3 complete raters instead of 2, add another exclusion:
    python3 scripts/watch_and_score.py --min-complete 3 --exclude SOMEBODY
"""
import argparse, json, os, re, subprocess, sys, time, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)                                    # semantic-integrity-annotator/
HARNESS = os.path.abspath(os.path.join(
    REPO, "..", "ill-posed-AffectTrace", "SCRIPTS", "experiments", "construct_validity"))
CONFIG_JS = os.path.join(REPO, "assets", "config.js")
EXCLUDE_DEFAULT = {"AUG_rubricB"}
TOTAL = 210


def endpoint_from_config():
    try:
        m = re.search(r'SIA_ENDPOINT\s*=\s*["\']([^"\']+)["\']', open(CONFIG_JS).read())
        return m.group(1) if m else ""
    except OSError:
        return ""


def fetch(endpoint):
    url = endpoint + ("&" if "?" in endpoint else "?") + "action=results"
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.load(r)


def status(data, exclude, total, min_complete):
    """Return (independent_counts, complete_list, rows)."""
    by = data.get("by_annotator", {})
    indep = {a: c for a, c in by.items() if a not in exclude}
    complete = sorted([a for a, c in indep.items() if c >= total])
    return indep, complete


def build_and_score(rows, exclude, run_tag):
    """Write responses CSV, fill the blinded template, run the scorer. Returns (ok, output)."""
    run_dir = os.path.join(HARNESS, "runs", run_tag)
    os.makedirs(run_dir, exist_ok=True)
    responses = os.path.join(run_dir, "responses.csv")
    filled = os.path.join(run_dir, "annotation_blinded.csv")   # name the scorer expects
    template = os.path.join(HARNESS, "annotation_blinded.csv")
    key = os.path.join(HARNESS, "framework_key.csv")
    scorer = os.path.join(HARNESS, "compute_construct_validity.py")

    # 1) dump fetched rows -> long responses.csv (corrected folded as the scorer's path expects)
    import csv
    with open(responses, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["updated_at", "annotator_id", "sample_id", "consistent", "corrected", "note"])
        for r in rows:
            cons = (r.get("consistent") or "").strip()
            corr = (r.get("corrected") or "").strip() or (
                (r.get("note") or "").strip() if cons.upper() == "NO" else "")
            w.writerow([r.get("updated_at", ""), r.get("annotator_id", ""),
                        r.get("sample_id", ""), cons, corr, ""])

    # 2) fill the blinded template (excludes AUG_rubricB itself), writing into run_dir
    s2b = os.path.join(HERE, "sheet_to_blinded.py")
    ex_extra = ",".join(sorted(exclude - EXCLUDE_DEFAULT))
    cmd = [sys.executable, s2b, "--sheet", responses, "--blinded", template, "--out", filled]
    if ex_extra:
        cmd += ["--exclude", ex_extra]
    p1 = subprocess.run(cmd, capture_output=True, text=True)
    if p1.returncode != 0:
        return False, "sheet_to_blinded failed:\n" + p1.stdout + p1.stderr

    # 3) copy framework_key + scorer next to the filled CSV and run the scorer there
    import shutil
    shutil.copy(key, os.path.join(run_dir, "framework_key.csv"))
    shutil.copy(scorer, os.path.join(run_dir, "compute_construct_validity.py"))
    p2 = subprocess.run([sys.executable, "compute_construct_validity.py"],
                        cwd=run_dir, capture_output=True, text=True)
    out = p1.stdout + "\n" + p2.stdout + p2.stderr
    return (p2.returncode == 0), out + f"\n(results in {run_dir})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default="", help="override SIA_ENDPOINT (default: read config.js)")
    ap.add_argument("--watch", type=int, default=0, metavar="SEC",
                    help="poll every SEC seconds until ready, then score and exit (0 = one-shot)")
    ap.add_argument("--min-complete", type=int, default=2,
                    help="independent raters that must reach 210 before scoring (default 2)")
    ap.add_argument("--total", type=int, default=TOTAL, help="items per rater (default 210)")
    ap.add_argument("--exclude", default="", help="extra annotator_ids to exclude (comma-separated)")
    args = ap.parse_args()

    endpoint = args.endpoint or endpoint_from_config()
    if not endpoint:
        sys.exit("No endpoint: pass --endpoint or set SIA_ENDPOINT in assets/config.js.")
    exclude = set(EXCLUDE_DEFAULT) | {x.strip() for x in args.exclude.split(",") if x.strip()}

    while True:
        try:
            data = fetch(endpoint)
        except Exception as e:
            print(f"[fetch error] {e}")
            if not args.watch:
                sys.exit(1)
            time.sleep(args.watch); continue

        indep, complete = status(data, exclude, args.total, args.min_complete)
        prog = ", ".join(f"{a}={c}" for a, c in sorted(indep.items(), key=lambda kv: -kv[1]))
        print(f"[{data.get('total_rows','?')} rows] independent: {prog}  "
              f"| complete(>={args.total}): {complete or 'none'}")

        if len(complete) >= args.min_complete:
            print(f"\n>= {args.min_complete} independent raters complete {complete}. Scoring...\n")
            ok, out = build_and_score(data.get("rows", []), exclude,
                                      run_tag=f"n{len(complete)}_" + "_".join(complete))
            print(out)
            sys.exit(0 if ok else 2)

        if not args.watch:
            need = args.min_complete - len(complete)
            print(f"Not ready: need {need} more independent rater(s) at {args.total}. "
                  f"(Closest below target: " +
                  ", ".join(f"{a}={c}" for a, c in sorted(indep.items(), key=lambda kv: -kv[1])
                            if c < args.total) + ")")
            sys.exit(0)
        time.sleep(args.watch)


if __name__ == "__main__":
    main()
