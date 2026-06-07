/* Semantic Integrity Annotator — zero-backend static annotation app.
   Loads blinded items, collects YES/NO source-consistency judgements + notes,
   autosaves to localStorage, exports a merge-ready CSV. No verdict/truth is ever
   present client-side; nothing is uploaded anywhere. */
(() => {
  "use strict";
  const LS_KEY = "sia_state_v1";
  const ENDPOINT = (typeof window !== "undefined" && window.SIA_ENDPOINT) || "";
  let items = [], state = { annotator: "", answers: {}, idx: 0, synced: {} };

  const $ = (s) => document.querySelector(s);
  const el = {};
  const LABEL_ZH = { positive: "positive 正面", negative: "negative 負面", neutral: "neutral 中性" };
  const ZH = { positive: "正面", negative: "負面", neutral: "中性" };
  // When a label is judged WRONG, the correct one must be one of the other two.
  const CANDIDATES = {
    positive: ["neutral", "negative"],
    neutral:  ["positive", "negative"],
    negative: ["positive", "neutral"],
  };
  const isComplete = (a) => !!(a && (a.v === "YES" || (a.v === "NO" && a.corrected)));

  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (s && s.answers) state = s; }
    catch (e) {}
    if (!state.synced) state.synced = {};
  }

  const skey = (a) => (a.v || "") + "|" + (a.corrected || "") + "|" + (a.note || "");

  /* ---- per-answer submission to the Google Sheet endpoint (optional) ---- */
  function postAnswer(sampleId) {
    if (!ENDPOINT) return;                          // download-only mode
    const who = (state.annotator || "").trim();
    if (!who) return;                               // need an ID; resync once set
    const a = state.answers[sampleId] || {};
    if (!a.v) return;
    const payload = JSON.stringify({
      annotator_id: who, sample_id: sampleId, consistent: a.v,
      corrected: a.corrected || "", note: a.note || "",
    });
    // no-cors + text/plain => simple request, no CORS preflight (Apps Script reads the body).
    fetch(ENDPOINT, { method: "POST", mode: "no-cors",
                      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: payload })
      .then(() => { state.synced[sampleId] = skey(a); save(); updateSync(); })
      .catch(() => { /* leave unsynced; resync() will retry */ });
  }
  function resync(force) {
    if (!ENDPOINT) { updateSync(); return; }
    if (!(state.annotator || "").trim()) {
      if (force) alert("請先在上方輸入你的標註者代號，再按重新同步。");
      updateSync(); return;
    }
    // force=true: re-send EVERY answered item regardless of the local "synced" flag.
    // Needed because no-cors POSTs cannot detect a failed (e.g. 403) delivery, so an
    // item may be marked synced locally yet never reached the Sheet.
    if (force) state.synced = {};
    const todo = Object.keys(state.answers).filter(sid => {
      const a = state.answers[sid];
      return a && a.v && state.synced[sid] !== skey(a);
    });
    todo.forEach(sid => postAnswer(sid));
    updateSync();
    if (force) alert(`已重新送出 ${todo.length} 筆到雲端。請稍候幾秒後到試算表或 ?action=view 確認。`);
  }
  function syncedCount() {
    return Object.keys(state.answers).filter(sid => {
      const a = state.answers[sid];
      return a && a.v && state.synced[sid] === skey(a);
    }).length;
  }
  function updateSync() {
    if (!el.sync) return;
    if (!ENDPOINT) { el.sync.textContent = "離線模式（僅下載，未設定雲端端點）"; return; }
    if (!(state.annotator || "").trim()) { el.sync.textContent = "請先輸入標註者代號以啟用雲端同步"; return; }
    el.sync.textContent = `雲端已同步 ${syncedCount()} / ${answeredCount()}`;
  }

  function answeredCount() { return Object.values(state.answers).filter(isComplete).length; }

  function render() {
    const total = items.length, done = answeredCount();
    el.prog.style.width = (done / total * 100) + "%";
    el.cDone.textContent = done; el.cTotal.textContent = total;
    el.cLeft.textContent = total - done;
    el.export.disabled = done < total;
    el.export.textContent = done < total ? `下載（已完成 ${done}/${total}）` : "✓ 下載我的標註";

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

    // Correction sub-question: shown only when this item is judged WRONG.
    const cands = CANDIDATES[it.repaired_label] || [];
    el.corr1.firstChild.textContent = (ZH[cands[0]] || cands[0] || "—") + " ";
    el.corr2.firstChild.textContent = (ZH[cands[1]] || cands[1] || "—") + " ";
    el.corr1.dataset.label = cands[0] || "";
    el.corr2.dataset.label = cands[1] || "";
    el.corrBlock.classList.toggle("hidden", a.v !== "NO");
    el.corr1.classList.toggle("sel", a.corrected === cands[0]);
    el.corr2.classList.toggle("sel", a.corrected === cands[1]);

    save();
    updateSync();
  }

  function answer(v) {
    const it = items[state.idx];
    const cur = state.answers[it.sample_id] || {};
    if (v === "YES") {
      state.answers[it.sample_id] = { v: "YES", note: cur.note || "", corrected: "" };
      render(); postAnswer(it.sample_id);
      setTimeout(nextUnanswered, 120);             // YES is complete → advance
    } else {
      // NO: record, reveal the correction sub-question, DO NOT advance yet.
      state.answers[it.sample_id] = { v: "NO", note: cur.note || "", corrected: cur.corrected || "" };
      render(); postAnswer(it.sample_id);
    }
  }
  function pickCorrection(label) {
    if (!label) return;
    const it = items[state.idx];
    const cur = state.answers[it.sample_id] || {};
    if (cur.v !== "NO") return;
    state.answers[it.sample_id] = { v: "NO", note: cur.note || "", corrected: label };
    render(); postAnswer(it.sample_id);
    setTimeout(nextUnanswered, 120);               // correction chosen → advance
  }
  function nextUnanswered() {
    for (let k = 1; k <= items.length; k++) {
      const j = (state.idx + k) % items.length;
      if (!isComplete(state.answers[items[j].sample_id])) { state.idx = j; render(); return; }
    }
    render(); // all answered
  }
  function go(d) { state.idx += d; render(); }

  function toCSV() {
    const who = state.annotator || "anon";
    const esc = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const lines = ["sample_id,annotator_id,consistent_YES_NO,corrected_label,notes"];
    items.forEach(it => {
      const a = state.answers[it.sample_id] || {};
      lines.push([esc(it.sample_id), esc(who), esc(a.v || ""),
                  esc(a.corrected || ""), esc(a.note || "")].join(","));
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
    el.sync = $("#sync"); el.resync = $("#resync");
    el.corrBlock = $("#corrBlock"); el.corr1 = $("#corr1"); el.corr2 = $("#corr2");

    load();
    el.who.value = state.annotator || "";
    let whoTimer = null;
    el.who.addEventListener("input", () => {
      state.annotator = el.who.value.trim(); save(); updateSync();
      clearTimeout(whoTimer); whoTimer = setTimeout(resync, 600);   // send earlier answers
    });
    if (el.resync) el.resync.addEventListener("click", () => resync(true));  // force re-send all
    el.yes.addEventListener("click", () => answer("YES"));
    el.no.addEventListener("click", () => answer("NO"));
    el.corr1.addEventListener("click", () => pickCorrection(el.corr1.dataset.label));
    el.corr2.addEventListener("click", () => pickCorrection(el.corr2.dataset.label));
    let noteTimer = null;
    el.note.addEventListener("input", () => {
      const it = items[state.idx]; const cur = state.answers[it.sample_id] || {};
      state.answers[it.sample_id] = { v: cur.v || "", corrected: cur.corrected || "", note: el.note.value };
      save();
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { if ((state.answers[it.sample_id] || {}).v) postAnswer(it.sample_id); }, 800);
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
      const cur = items.length ? (state.answers[items[state.idx].sample_id] || {}) : {};
      const inCorrection = cur.v === "NO";   // correction sub-question is visible
      // 1 / 2 pick the correct-label candidates when the correction block is shown
      if (inCorrection && (e.key === "1" || e.key === "2")) {
        pickCorrection(e.key === "1" ? el.corr1.dataset.label : el.corr2.dataset.label);
        e.preventDefault(); return;
      }
      // Left = 正確/一致 (YES, left button); Right = 錯誤/不一致 (NO, right button)
      if (e.key === "y" || e.key === "Y" || e.key === "ArrowLeft") { answer("YES"); e.preventDefault(); }
      else if (e.key === "n" || e.key === "N" || e.key === "ArrowRight") { answer("NO"); e.preventDefault(); }
    });

    fetch("data/items.json").then(r => r.json()).then(d => {
      items = d.items || [];
      if (!items.length) { el.src.textContent = "未載入任何題目（data/items.json 為空）。"; return; }
      render();
      resync();  // push any answers made before the endpoint/ID was available
    }).catch(() => { el.src.textContent = "無法載入 data/items.json。"; });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
