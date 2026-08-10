import { MqttAuctionException } from './MqttAuctionException.ts';

// ADR-0003: 不做真實密碼驗證，改用靜態白名單比對 username。
// 對應書中 ApplicationRunner.SNIPER_ID = "sniper"。
const KNOWN_USERNAMES: readonly string[] = ['sniper'];

// 對應 Java 版 XMPPAuctionHouse.connect() 的 try/catch：連線可能因為帳號
// 不存在而失敗，失敗要包裝成自訂例外，而不是把底層錯誤原封不動往外拋。
export function assertKnownUsername(username: string): void {
  if (!KNOWN_USERNAMES.includes(username)) {
    throw new MqttAuctionException(`Could not connect to auction: unknown account ${username}`);
  }
}
