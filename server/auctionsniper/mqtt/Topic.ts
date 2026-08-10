// ADR-0006: MQTT topic 拓樸——分離 commands/events topic，避免 sniper 之間
// 看到彼此的 JOIN/BID（XMPP 1:1 chat 天生沒有這個洩漏，MQTT 廣播模型需要靠
// topic 拓樸重現同樣的隔離，而不是額外寫過濾邏輯）。
// 對應 Java 版 XMPPAuctionHouse.AUCTION_ID_FORMAT/auctionId()，該邏輯在
// Java 原始碼裡同樣沒有獨立單元測試。
export function commandsTopic(itemId: string): string {
  return `auction/${itemId}/commands`;
}

export function eventsTopic(itemId: string): string {
  return `auction/${itemId}/events`;
}
