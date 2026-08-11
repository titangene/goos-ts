export class RedisAuctionException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'RedisAuctionException';
  }
}
