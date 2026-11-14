import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

// The website's Firebase app ("Cholan Website" in the cholan-rice-site
// project). These values are public by design: they name the project, and
// what anyone can do is decided by the backend's access list, not by them.
const app = initializeApp({
  apiKey: 'AIzaSyANnkz_lRKqPkW1w465av7Nu02RxuuMuos',
  authDomain: 'cholan-rice-site.firebaseapp.com',
  projectId: 'cholan-rice-site',
  appId: '1:820486513113:web:d1482a8b3c4c8fe07ef9c8',
  messagingSenderId: '820486513113',
});

export const auth = getAuth(app);

// Sign in with a Google account, the admin's only way in. A popup where the
// browser allows one; where it blocks it (some phones), the whole page goes to
// Google and back.
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/popup-blocked') return signInWithRedirect(auth, provider);
    throw error;
  }
  return undefined;
}

// The warehouse workers' username and password (warehouse/Login.jsx).
export const loginWithPassword = (email, password) => signInWithEmailAndPassword(auth, email, password);

// Finishes a Google sign-in that went by redirect; errors surface on the screen.
export const googleRedirectResult = () => getRedirectResult(auth);

export const watchUser = (callback) => onAuthStateChanged(auth, callback);
export const logout = () => signOut(auth);
