import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCn923Ga0FDTkfrR6sw4zW0rjVFplvYdfQ",
  authDomain: "athlos-c7de6.firebaseapp.com",
  projectId: "athlos-c7de6",
  storageBucket: "athlos-c7de6.firebasestorage.app",
  messagingSenderId: "y789060160802",
  appId: "1:789060160802:web:1c26ad914f19ece4fd697b"
  
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Incializa Firebase Storage
export const storage = getStorage(app);

export default app;