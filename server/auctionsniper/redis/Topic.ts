// ADR-0006 的 topic 拓樸邏輯同樣適用於 Redis channel（見 ADR-0002 Compliance #6）：
// commands 只有 Auction House 訂閱，events 由已加入的 sniper 訂閱，避免 sniper
// 之間互相看到彼此的命令。命名慣例用 `:` 分隔，是 Redis key/channel 命名的業界慣例。
export function commandsChannel(itemId: string): string {
  return `auction:${itemId}:commands`;
}

export function eventsChannel(itemId: string): string {
  return `auction:${itemId}:events`;
}
