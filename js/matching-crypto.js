function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function createMatchingKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportMatchingPublicKey(publicKey) {
  return crypto.subtle.exportKey("jwk", publicKey);
}

export async function encryptMatchingSubmission(publicKeyData, payload) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyData,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const contentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    contentKey,
    plaintext
  );
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);
  const encryptedContentKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    rawContentKey
  );

  return {
    key: bytesToBase64(new Uint8Array(encryptedContentKey)),
    iv: bytesToBase64(initializationVector),
    data: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptMatchingSubmission(privateKey, encryptedPayload) {
  const rawContentKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBytes(encryptedPayload.key)
  );
  const contentKey = await crypto.subtle.importKey(
    "raw",
    rawContentKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encryptedPayload.iv) },
    contentKey,
    base64ToBytes(encryptedPayload.data)
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}
