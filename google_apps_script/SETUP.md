# 部署指南 — 啟用 Google Sheet 即時回收

照這份做，約 10 分鐘。完成後標註者每答一題就會即時寫進你的 Google 試算表。

> ⚠️ 請**全新建立**一個試算表，**不要**用 TAC 研究那個（`1UNSx…`）——schema 不同且會污染已投稿資料。

---

## Step 1 — 建立試算表

1. 開 <https://sheets.google.com> → 新增空白試算表。
2. 命名，例如 `SI-Annotator-Responses`。
3. 分頁不用手動建；腳本第一次收到資料會自動建立 `responses` 分頁（欄位：
   `updated_at, annotator_id, sample_id, consistent, note`）。

## Step 2 — 貼上 Apps Script（綁定到這個試算表）

1. 在這個試算表的選單：**擴充功能 (Extensions) → Apps Script**。
   （從試算表開啟 = 綁定，腳本的 `getActiveSpreadsheet()` 就會指向它，**不必填 SPREADSHEET_ID**。）
2. 刪掉預設的 `function myFunction() {}`。
3. 把本資料夾的 **`Code.gs`** 全部內容貼進去。
4. 按 **儲存**（💾）。

## Step 3 — 部署為網頁應用程式

1. 右上 **部署 (Deploy) → 新增部署 (New deployment)**。
2. 齒輪 ⚙ → 類型選 **網頁應用程式 (Web app)**。
3. 設定：
   - **執行身分 (Execute as)**：**我 (Me)**
   - **誰可以存取 (Who has access)**：**任何人 (Anyone)** ← 必須，標註者才能 POST
4. 按 **部署**。第一次會要求**授權**：選你的 Google 帳號 → 「進階」→「前往（不安全）」→ 允許。
   （因為是你自己的腳本寫你自己的試算表，安全。）
5. 複製 **網頁應用程式 URL**（結尾是 `/exec`），長這樣：
   ```
   https://script.google.com/macros/s/AKfyc…/exec
   ```

## Step 4 — 健康檢查

把那個 `/exec` 網址直接貼到瀏覽器開啟，應看到：
```json
{"ok":true,"service":"semantic-integrity-annotator"}
```
看到就代表端點活著。

## Step 5 — 把網址接到標註網站

兩種方式擇一：

**(a) 自己改**：編輯 `assets/config.js`：
```js
window.SIA_ENDPOINT = "https://script.google.com/macros/s/AKfyc…/exec";
```
然後 `git add assets/config.js && git commit -m "set endpoint" && git push`。

**(b) 給我**：把 `/exec` 網址貼給我，我幫你填進 `config.js` 並 push。

推上去後約 30–60 秒，打開標註網站會看到頂部顯示「**雲端已同步 N / M**」（不再是「離線模式」）。

## Step 6 — 測試一筆

1. 開標註網站，輸入測試代號（例如 `TEST`），隨便答一題。
2. 回試算表，`responses` 分頁應出現一列（updated_at / TEST / CV00xx / YES 或 NO）。
3. 確認後，把試算表那列刪掉即可（或測完清空整個分頁）。

---

## 收資料 → 計分

5 位標註者都答完後：

1. 試算表：**檔案 → 下載 → CSV**（下載 `responses` 分頁），存成 `responses.csv`。
2. 轉成 harness 格式：
   ```bash
   python3 scripts/sheet_to_blinded.py \
     --sheet   responses.csv \
     --blinded ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv \
     --out     ../ill-posed-AffectTrace/SCRIPTS/experiments/construct_validity/annotation_blinded.csv
   ```
3. 計分（在 harness 目錄）：
   ```bash
   python3 compute_construct_validity.py
   ```
   → 得 Cohen/Fleiss κ + PABAK + framework–human 一致性/FP-FN + 門檻 sweep。

---

## 疑難

| 症狀 | 處理 |
|------|------|
| 網站仍顯示「離線模式」 | `config.js` 的 URL 沒填或沒 push；或 CDN 還沒更新（等 1 分鐘、強制重整）|
| 試算表沒出現資料 | 部署的「誰可以存取」要是「任何人」；重新部署一次 |
| 改了 Code.gs 沒生效 | 要 **管理部署 → 編輯 → 版本選「新版本」** 才會套用 |
| 想看進度 | 瀏覽器開 `…/exec`（doGet 健康檢查）；或直接看試算表列數 |
