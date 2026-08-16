import type { Strophe } from 'strophe.js';

// server/tsconfig（.nuxt/tsconfig.server.json）的 lib 只有
// esnext/webworker/dom.iterable，沒有 "dom"，所以這個專案的 server 端程式碼
// 直接寫 `Element` 這個型別名稱會編譯失敗（Cannot find name 'Element'）。
// Strophe 的型別定義本身用到 Element/Node（瀏覽器與 Node.js 通用），但只要
// 我們自己的程式碼不「顯式」寫出這個識別字，改用 Parameters<> 從 Strophe
// 自己的函式簽章反推型別，TypeScript 就不需要在我們的檔案裡解析
// 'Element' 這個全域名稱，可以正常編譯。
export type Connection = InstanceType<typeof Strophe.Connection>;
export type Stanza = Parameters<Parameters<Connection['addHandler']>[0]>[0];
