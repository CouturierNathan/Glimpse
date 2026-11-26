const BASE64URL = /^[A-Za-z0-9_-]+$/

/** True when the text is an RSA-OAEP SHA-256 public key (SPKI, base64url) of at least 2048 bits. */
export async function isEncryptionKey(spki: string): Promise<boolean> {
  if (!BASE64URL.test(spki) || spki.length > 2048) return false
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(Buffer.from(spki, 'base64url')),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['wrapKey'],
    )
    return (key.algorithm as RsaHashedKeyAlgorithm).modulusLength >= 2048
  } catch {
    return false
  }
}
