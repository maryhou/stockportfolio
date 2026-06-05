/**
 * Client-side biometric lock using Web Authentication API (WebAuthn).
 * No server needed — we register + verify entirely in the browser.
 * Works with Face ID (iOS) and fingerprint / face (Android / desktop).
 */

const BIO_ENABLED_KEY = 'bio-enabled';
const BIO_CRED_KEY    = 'bio-cred-id';

// ── Support check ──────────────────────────────────────────────────────────
export function isBiometricSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function'
  );
}

export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIO_ENABLED_KEY) === 'true';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function randomBytes(n: number): ArrayBuffer {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr.buffer as ArrayBuffer;
}

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(str: string): ArrayBuffer {
  const arr = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  return arr.buffer as ArrayBuffer;
}

// ── Registration (first time enable) ──────────────────────────────────────
export async function registerBiometric(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: {
          name: 'WealthTrack 投資日誌',
          id:   window.location.hostname,
        },
        user: {
          id:          randomBytes(16),
          name:        'user',
          displayName: '我',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7   }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',  // device biometrics only
          userVerification:        'required',  // Face ID / fingerprint required
          residentKey:             'preferred',
        },
        timeout: 60_000,
      },
    }) as PublicKeyCredential | null;

    if (!credential) return false;

    // Store credential ID so we can re-use it for verification
    localStorage.setItem(BIO_CRED_KEY,    b64encode(credential.rawId));
    localStorage.setItem(BIO_ENABLED_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

// ── Verification (every unlock attempt) ───────────────────────────────────
export async function verifyBiometric(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  const rawCredId = localStorage.getItem(BIO_CRED_KEY);
  if (!rawCredId) return false;

  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge:         randomBytes(32),
        rpId:              window.location.hostname,
        userVerification:  'required',
        allowCredentials: [{
          type: 'public-key',
          id:   b64decode(rawCredId),
        }],
        timeout: 60_000,
      },
    });
    // If we reach here without an exception, the biometric passed
    return !!result;
  } catch {
    return false;
  }
}

// ── Disable ────────────────────────────────────────────────────────────────
export function disableBiometric() {
  localStorage.removeItem(BIO_ENABLED_KEY);
  localStorage.removeItem(BIO_CRED_KEY);
}
