import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import type { Stock, AppSettings, AppNotification } from '../types';

const firebaseConfig = {
  apiKey: 'AIzaSyAaTxULdy7z0CFtb4TXwXrKygymQU3VySY',
  authDomain: 'wealthtrack-c3414.firebaseapp.com',
  projectId: 'wealthtrack-c3414',
  storageBucket: 'wealthtrack-c3414.firebasestorage.app',
  messagingSenderId: '541712017343',
  appId: '1:541712017343:web:a427fbb19fcc484a5ee30a',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export type { User };

export interface UserCloudData {
  stocks: Stock[];
  settings: AppSettings;
  notifications: AppNotification[];
}

/** Load all user data from Firestore. Returns null if no data exists yet. */
export async function loadCloudData(uid: string): Promise<UserCloudData | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserCloudData;
  } catch {
    return null;
  }
}

/** Save (merge) partial user data to Firestore. Returns true on success. */
export async function saveCloudData(uid: string, data: Partial<UserCloudData>): Promise<boolean> {
  try {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
    return true;
  } catch (e) {
    console.error('[Firebase] save error:', e);
    return false;
  }
}

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  await signOut(auth);
}
