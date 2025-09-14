// Firebase: inicializa la app y exporta auth, db y storage.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCn923Ga0FDTkfrR6sw4zW0rjVFplvYdfQ",
  authDomain: "athlos-c7de6.firebaseapp.com",
  projectId: "athlos-c7de6",
  storageBucket: "athlos-c7de6.firebasestorage.app",
  messagingSenderId: "789060160802",
  appId: "1:789060160802:web:1c26ad914f19ece4fd697b"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;