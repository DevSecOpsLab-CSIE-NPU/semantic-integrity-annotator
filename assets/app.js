/* Semantic Integrity Annotator — zero-backend static annotation app.
   Loads blinded items, collects YES/NO source-consistency judgements + notes,
   autosaves to localStorage, exports a merge-ready CSV. No verdict/truth is ever
   present client-side; nothing is uploaded anywhere. */
(() => {
  "use strict";
  const LS_KEY = "sia_state_v1";
  let items = [], state = { annotator: "", answers: {}, idx: 0 };

  const $ = (s) => document.querySelector(s);
  const el = {};
  const LABEL_ZH = { positive: "positive 正面", negative: "negative 負面", neutral: "neutral 中性" };

  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && s.answers) state = s; }
    catch (e) {}
  }

  function answeredCount() { return Object.values(state.answers).filter(a => a && a.v).length; }

  function render() {
    const total = items.length, done = answeredCount();
    el.prog.style.width = (done / total * 100) + "%";
    el.cDone.textContent = done; el.cTotal.textContent = total;
    el.cLeft.textContent = total - done;
    el.export.disabled = done < total;
    el.export.textContent = done < total ? `下載（已答 ${done}/${total}）` : "✓ 下載我的標註";

    if (state.idx < 0) state.idx = 0;
    if (state.idx >= total) state.idx = total - 1;
    const it = items[state.idx];
    const a = state.answers[it.sample_id] || {};
    el.qid.textContent = `${it.sample_id}  ·  第 ${state.idx + 1} / ${total} 題`;
    el.src.textContent = it.source_text;
    el.chip.textContent = LABEL_ZH[it.repaired_label] || it.repaired_label;
    el.chip.className = "chip " + it.repaired_label;
    el.yes.classList.toggle("sel", a.v === "YES");
    el.no.classList.toggle("sel", a.v === "NO");
    el.note.value = a.note || "";
    el.prev.disabled = state.idx === 0;
    el.next.disabled = state.idx === total - 1;
    save();
  }

  function answer(v) {
    const it = items[state.idx];
    const cur = state.answers[it.sample_id] || {};
    state.answers[it.sample_id] = { v, note: cur.note || "" };
    render();
    // auto-advance to next UNANSWERED item for speed
    setTimeout(nextUnanswered, 120);
  }
  function nextUnanswered() {
    for (let k = 1; k <= items.length; k++) {
      const j = (state.idx + k) % items.length;
      if (!(state.answers[items[j].sample_id] || {}).v) { state.idx = j; render(); return; }
    }
    render(); // all answered
  }
  function go(d) { state.idx += d; render(); }

  function toCSV() {
    const who = state.annotator || "anon";
    const esc = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const lines = ["sample_id,annotator_id,consistent_YES_NO,notes"];
    items.forEach(it => {
      const a = state.answers[it.sample_id] || {};
      lines.push([esc(it.sample_id), esc(who), esc(a.v || ""), esc(a.note || "")].join(","));
    });
    return lines.join("\n");
  }
  function download() {
    const who = (state.annotator || "anon").replace(/[^\w.-]/g, "_");
    const blob = new Blob([toCSV()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `annotations_${who}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function init() {
    el.prog = $("#prog"); el.cDone = $("#cDone"); el.cTotal = $("#cTotal"); el.cLeft = $("#cLeft");
    el.qid = $("#qid"); el.src = $("#src"); el.chip = $("#chip");
    el.yes = $("#yes"); el.no = $("#no"); el.note = $("#note");
    el.prev = $("#prev"); el.next = $("#next"); el.export = $("#export");
    el.who = $("#who"); el.jump = $("#jump"); el.reset = $("#reset");

    load();
    el.who.value = state.annotator || "";
    el.who.addEventListener("input", () => { state.annotator = el.who.value.trim(); save(); });
    el.yes.addEventListener("click", () => answer("YES"));
    el.no.addEventListener("click", () => answer("NO"));
    el.note.addEventListener("input", () => {
      const it = items[state.idx]; const cur = state.answers[it.sample_id] || {};
      state.answers[it.sample_id] = { v: cur.v || "", note: el.note.value }; save();
    });
    el.prev.addEventListener("click", () => go(-1));
    el.next.addEventListener("click", () => go(1));
    el.jump.addEventListener("click", nextUnanswered);
    el.export.addEventListener("click", download);
    el.reset.addEventListener("click", () => {
      if (confirm("確定清除此裝置上的所有答案？此動作無法復原。")) {
        state.answers = {}; state.idx = 0; save(); render();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "y" || e.key === "Y") answer("YES");
      else if (e.key === "n" || e.key === "N") answer("NO");
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    });

    fetch("data/items.json").then(r => r.json()).then(d => {
      items = d.items || [];
      if (!items.length) { el.src.textContent = "未載入任何題目（data/items.json 為空）。"; return; }
      render();
    }).catch(() => { el.src.textContent = "無法載入 data/items.json。"; });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
