// ADR-0006。
export function commandsTopic(itemId: string): string {
  return `auction/${itemId}/commands`;
}

export function eventsTopic(itemId: string): string {
  return `auction/${itemId}/events`;
}
