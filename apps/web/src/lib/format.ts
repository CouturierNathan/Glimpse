/** `0x7099…79C8`: enough to recognise an address, short enough for a header. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
