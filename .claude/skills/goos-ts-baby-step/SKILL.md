---
name: goos-ts-baby-step
description: 依 goos-java 的 TDD baby-step commit 序列，將對應邏輯以 TDD baby step 方式移植到 goos-ts/main，長期逼近 goos-code 的完整實作，同時符合 TS/Nuxt 業界慣例。討論、規劃、設計 goos-ts 的 TS 版實作時觸發
---

# goos-ts baby-step 移植方法論

## 三個 repo 的角色

- `~/project/clone/goos-code/`（fork 自 https://github.com/sf105/goos-code）
  - GOOS 書作者的完整最終 Java 實作
  - 沒有 TDD baby-step commit 歷史，只有終局程式碼
  - 角色：終局架構參考，用來確認某段 production code 設計最終該長什麼樣子、該有哪些 collaborator
  - 使用方式：需要確認終局設計時，直接讀取這個 repo 目前的實際內容驗證，不可憑訓練記憶臆測書中內容或這個 repo 的內容

- `~/project/side-project/goos-java/`
  - 使用者自己依書中章節節奏，從零開始重新刻的 TDD baby-step 實作
  - 每個 commit 都標注書中出處（例如 `[11.2.4 p102]`），commit message 用 Conventional Commits
  - 角色：節奏與範圍參考，決定「這一步該做多少」的唯一依據
  - 使用方式：討論任何一步該怎麼做之前，一定要先用 `git show <hash>` 或 `git show --stat <hash>` 實際核對該 commit 的完整 diff，不可憑先前對話記憶或訓練記憶臆測其內容（同一個 commit 在不同分支/時間可能有不同雜湊，務必重新核對）

- `~/project/side-project/goos-ts/`（git worktree + bare repo 結構）
  - `poc` 分支：實驗性嘗試，目標是直接對齊 goos-code 的完整實作，大量由 AI agent 自行撰寫，使用者尚未 review 完，不是定案的設計
    - `nuxt.config.ts`、`package.json` scripts、目錄結構：可以查看作為現況參考，但不是定案的依據，其中有部分屬於未定案的嘗試，實際決策一律透過 `main` 分支的 TDD baby step 逐步討論決定，不可未經這個流程就直接沿用
    - `docs/*.md`：可以參考裡面涵蓋了哪些議題，作為 `main` 分支之後要逐步建立哪些議題文件的線索，但內容一律要依這份 skill 的方法論重新推導設計，不可直接沿用
    - 任何檔案內部的實作寫法、命名細節、test/driver 的具體設計：不可參考，即使拿來看過也不能直接沿用
  - `main` 分支：使用者親手練習 TDD baby step 的實作，逐步對照 goos-java 的 commit 節奏往前推進，這是實際動手的地方，這份 skill 檔案與所有設計決策文件都放在這裡

## 每次移植的標準流程

面對「goos-java 的某個 commit（或某幾個連續 commit）該怎麼在 goos-ts/main 實作」這類問題時，依序：

1. **核對 goos-java 對應 commit 的實際範圍**
   - 用 `git show --stat <hash>` 先看改了哪些檔案，再用 `git show <hash>` 看完整 diff
   - 明確寫出這個 commit 改了什麼、沒改什麼，尤其注意「收下參數但還沒用到」「宣告常數但還沒用到」這類刻意留白的 baby step 手法，不要自行腦補成「這個階段應該也要做 XXX」
   - 若使用者只給了一個 commit，但實際上前後還有其他書中步驟夾在中間，要主動核對清楚，避免跳步

2. **需要時核對 goos-code 的終局設計**
   - 只在需要確認「這段邏輯長期會演化成什麼樣子」時才查，且必須實際讀取該 repo 當下內容，不可用訓練記憶帶過
   - 查完之後只當作「不要設計出未來會被打掉重練的架構」的參考，不能因此在當前 commit 就把終局的抽象/類別/資料夾一次做出來，那會違反 baby step 範圍紀律

3. **設計 goos-ts 對應的 baby-step commit**，同時滿足：
   - **不超出對應 goos-java commit 的範圍**：goos-java 這個 commit 沒做的事，TS 版這個 commit 也不做，即使做起來很順手
   - **XP 簡單設計**：只解決當前這一步實際要解決的問題，不因為「知道未來會用到」就先做抽象化、先建資料夾結構、先加設定機制
   - **不確定的框架/套件 API 一律查證，不臆測**：優先讀專案實際安裝的 `node_modules` 型別定義或官方文件，找不到答案就明講「需要你自行驗證」，不寫成確定結論

4. **TS / Nuxt 慣例與逐字翻譯有落差時，逐一詢問使用者決策**
   - Java 的命名、package 結構、物件模型不一定能或該逐字翻譯成 TS，但**不能由我擅自決定**要不要照字面翻譯、還是改用目標語言/框架/函式庫慣用的寫法
   - 遇到這類落差，要把問題列出來詢問使用者，由使用者決定，不能自行判斷後直接寫進設計裡
   - 已定案的例外原則：為了讓 goos-ts 接近 goos-code，會將 `@xmpp/client` 封裝成跟 Smack 相同介面的 wrapper，但不完整實作 Smack 機制，只求符合 goos-code 的使用方式，並遵守 XP 簡單設計，做到讓對應測項變綠燈即可，細節與逐步演進記錄在 `docs/xmpp.md`

5. **不主動實作**：使用者是拿這整個過程練習 TDD，預設只給設計說明、取捨分析、illustrative 參考程式碼片段，不建立/修改 `goos-ts/main` 的實際程式碼，除非使用者明確要求動手做

6. **不能自動 git commit**：commit 時機一律由使用者自己控制，不可代為執行 git commit

## 設計決策的記錄方式

所有設計決策記錄在 `docs/` 底下，分成兩種文件，`SKILL.md` 本身不記錄任何個別決策：

- **章節文件**（`docs/ch<N>.md`，例如 `docs/ch11.md`）
  - 只放：goos-ts 與 goos-java 的對照 commit、需要時附上 goos-code 本地路徑或連結、簡短幾句描述、引用議題文件裡對應的小標題
  - 不放決策細節本身

- **議題文件**（依大分類主題命名，例如 `docs/xmpp.md`、`docs/e2e-testing.md`、`docs/realtime-communication.md`、`docs/naming-conventions.md`、`docs/directory-structure.md`、`docs/ui.md`）
  - 每個議題文件內有多個小標題，各自對應一個具體議題
  - 沒有任何不綁定 commit 的決策，每個小標題底下的結構由上而下只有兩層：
    - 尚未實作的決策：goos-ts 還沒有對應 commit 的決策，不論 goos-java 有沒有對應 commit 都算
    - 對應 commit history：goos-ts 實際 commit 之後，從新到舊列出
  - 每個決策一律寫在「第一次用到這個決策」的那個 baby-step commit 項目底下，不可拆成兩處或另外放一個不綁定 commit 的段落；該項目內容太長就在子層用條列式描述
  - 找不到對應的既有/未來 goos-java commit（例如純命名慣例、終局架構方向的提前決策）時，寫成「goos-ts 尚未實作（goos-java 尚無對應 commit，屬於＿＿方向決策）」
  - 只記錄最終決策，不記錄實作過程中的測試結果（跑了幾次、花多久、port/process 有沒有殘留）、也不記錄過程中試過的錯誤作法；引用外部證據（goos-code 的檔案、函式庫的型別定義或原始碼）作為決策依據不算在此限，可以保留
  - 章節文件透過引用這些小標題，指向詳細內容

所有跨檔案引用都要附連結：

- commit 連結指向 GitHub：goos-java 用 `https://github.com/titangene/goos-java/commit/<hash>`，goos-code 用 `https://github.com/titangene/goos-code/blob/<hash>/<path>`（`<hash>` 用當下確認過的實際 commit，不用分支名稱）
- 議題文件之間、章節文件到議題文件的引用，用相對路徑 + 標題 anchor
- `class`、`interface`、`enum`、檔名等一律用 inline code

新增議題文件時，可以參考 `poc` 分支 `docs/*.md` 已經涵蓋哪些主題作為線索，但內容一律重新依本檔方法論推導，不可沿用

## 文件撰寫慣例

- 不用「消費」「烘焙」「確立」這類非 zh-Hant-TW 常用詞彙，改用「使用」「讀取」「寫入」「內嵌」「決定」等自然說法
- `=`、`+`、`/` 一律用半形，前後加空白，不用全形 `＝`、`＋`、`／`
- 段落或條列項目結尾不加「。」
- 命名風格盡量不使用 kebab-case；若某類檔案的業界慣例就是 kebab-case（而非 PascalCase/camelCase），要明講出來讓使用者決策，不能默默採用，細節見 `docs/naming-conventions.md`
