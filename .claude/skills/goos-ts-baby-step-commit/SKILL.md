---
name: goos-ts-baby-step-commit
description: 在 goos-ts/main 依 /goos-ts-baby-step 節奏做 TDD baby step 時，幫使用者已經 staged 的變更寫 commit message 並執行 commit。當使用者在 goos-ts/main 說「commit staged」、要求 commit 已 staged 的變更、或要把某個 goos-ts commit hash 回填進 docs/*.md 時觸發
---

# goos-ts baby-step commit 方式

依賴 [`goos-ts-baby-step`](../goos-ts-baby-step/SKILL.md) 的移植方法論，這份 skill 只處理「使用者已經自己 `git add` 好，要我幫忙寫 commit message 並執行 commit」這個動作本身，不涉及要不要動 production/test code 或 docs 內容的判斷。

## 前提

- **只 commit 使用者已經 staged 的內容**
  - 不可自己執行 `git add`（含 `git add -A`／`git add .`），也不可把 unstaged 的變更一併收進 commit
  - 每次都先用 `git status`、`git diff --staged` 實際核對目前 staged 了什麼，不能依賴對話記憶——工作目錄的檔案可能在對話過程中被使用者手動改過（系統會用「changed on disk」提示這類情況，出現時把它當成目前的真實狀態，不要自行改回去）
- 不可用 `--amend`、`--no-verify`、`-c commit.gpgsign=false`
- commit 完成後不主動 `git push`
- **commit message 不加任何 trailer**（不加 `Co-Authored-By`、不加 `Claude-Session`）
- commit message 的格式規則（scope 怎麼選、書中出處怎麼組合、body 只能用英文）已經寫在專案 `CLAUDE.md`，這裡不重複，只講怎麼把規則套用到「已經 staged 的內容」上

## 第一步：判斷情境

觸發這份 skill 時，先用 `AskUserQuestion` 問使用者這次是哪種情境：

1. TDD 步驟本身的 commit（production/test code）
2. docs hash 回填 commit（把某個 goos-ts commit hash 記錄進 `docs/*.md`）

依回答走對應的分支，不要自己用訊息內容猜。

## 情境 1：TDD 步驟本身的 commit

1. 到 `~/project/side-project/goos-java/` 用 `git log -4 --oneline` 取得最新 4 筆 commit，各取前 6 碼 hash + commit subject 當作 description
2. 用 `AskUserQuestion` 讓使用者從這 4 筆裡選一個要參考的 goos-java commit；`AskUserQuestion` 本身就會自動附一個讓使用者自行輸入的「其他」選項，不用另外手動加一個「其他」選項
3. 使用者選定 hash 後：
   - `git status` + `git diff --staged` 核對實際 staged 的內容，這是唯一要寫進 commit 的範圍
   - 到 goos-java repo 用 `git show --stat <hash>`、`git show <hash>` 核對這個 commit 的原始 message 與 diff，作為訊息風格與內容的參考依據，不可用訓練記憶回想
   - 核對 staged diff 實際做了什麼、對應到書中哪個 baby step，需要時讀相關的 test/production code（例如 e2e 測試接下來會呼叫到哪個斷言、被呼叫的 library 原始碼裡有沒有 SSR guard 之類的行為）驗證 commit message 裡要寫的行為描述是否屬實
     - 能實際跑（例如有權限跑 Docker/測試）就跑出來確認；不能跑就靠讀程式碼邏輯推導，並只寫自己真的核對過的結論，不要把推測寫成肯定語氣
4. 依 `CLAUDE.md` 的格式寫 subject：`test(<scope>): red - <測試案例名稱> [<書中出處>]` / `feat(<scope>): green - ...` / `refactor(<scope>): ...`
   - 這個專案目前只有一個 e2e 測項 `sniperJoinsAuctionUntilAuctionCloses`，同一個測項的連續 baby step 都沿用同一個測試案例名稱
5. body 用英文，內容是「參考 goos-java 這個 commit message 的結構與意圖，改寫成 staged diff 實際做的事」，不是逐字翻譯：
   - Java 特有、TS 版沒有的細節（例如命令列參數解析）不用寫
   - TS/Nuxt 特有的實作方式（例如用了哪個 composable、哪個 runtime config、哪個 Nitro route）要寫清楚
   - 結尾維持 book note 慣用的收尾：這一步之後，測試預期會在哪裡失敗
6. 不加 trailer，執行 `git commit`，跑完後 `git status` 確認乾淨，跟使用者說明還剩哪些 unstaged 檔案沒動（通常是還沒實作的後續 baby step 的 docs 草稿）

## 情境 2：docs hash 回填 commit

這個情境分兩階段：

**階段一（更新 docs 內容本身）**：依 [`goos-ts-baby-step`：設計決策的記錄方式](../goos-ts-baby-step/SKILL.md#設計決策的記錄方式) 的規則：

- 章節文件（`docs/ch<N>.md`）：把該步驟的 `` `<goos-ts hash 尚未產生>` `` 換成實際 hash 與 GitHub 連結
- 議題文件：把這個 commit 實際用到的決策，從「尚未實作的決策」搬進「對應 commit history」；同一個議題底下還沒實作的其他項目留在「尚未實作的決策」，不要整段搬過去
- 若在更新過程中發現先前記錄的決策跟這次實際 staged/commit 的內容不一致（例如原本規劃用 `onMounted()`，實際卻用了 library 內建的 SSR guard），要先查證清楚再修正決策內容本身，不能明知不一致還照抄舊決策

**階段二（commit 這些 docs 變更）**：沿用既有歷史的訊息慣例（例如 `f8fee6b`、`6f541f5`、`95513ae`），但簡化成：

```
docs: record commit hash for <red/green/refactor> step [<書中出處>]

<hash> <這一步做了什麼，一句話直述，不要重複 subject 已經講過的 red/green/refactor 字樣>. Move its design decisions to commit history.
```

跟 TDD 步驟 commit（情境 1）的 subject 是同一套格式：書中出處（章節/小節/頁碼視情況組合，規則同 `CLAUDE.md`）一律只放在結尾的 `[<書中出處>]`，跟這個 hash 對應的 code commit 的 `[<書中出處>]` 一致：

- body 只用一句話直接描述這一步做了什麼，不要跟 subject 重複的句型
- body 不用列出動了哪些議題文件的哪個段落，那些細節已經寫在 docs 本身裡
- 不加 trailer，執行 `git commit`，跑完後 `git status` 確認乾淨

## 沒把握時

- staged diff 看起來跟選定的 goos-java commit 對不太上：先問清楚，不要硬套訊息
- 需要驗證的行為沒辦法實際跑起來確認（例如缺少 Docker 權限）：commit message 裡只寫自己真的查證過的結論，並在回覆使用者時講清楚是靠讀程式碼推導、不是實際跑出來的結果
