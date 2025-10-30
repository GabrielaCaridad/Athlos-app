// En este archivo configuro Firebase para mi proyecto.
// Inicializo la app y exporto los servicios que utilizo: Auth, Firestore, Storage y Functions.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_REACT_APP_FIREBASE_API_KEY,
  authDomain: "athlos-c7de6.firebaseapp.com",
  projectId: "athlos-c7de6",
  storageBucket: "athlos-c7de6.firebasestorage.app",
  messagingSenderId: "789060160802",
  appId: "1:789060160802:web:1c26ad914f19ece4fd697b"
};
// Inicializo la app de Firebase con las credenciales del proyecto.
const app = initializeApp(firebaseConfig);
// Servicio de autenticación: lo uso para iniciar sesión y proteger rutas/acciones.
export const auth = getAuth(app);
// Base de datos Firestore: aquí guardo y consulto documentos (alimentos, registros, etc.).
export const db = getFirestore(app);
// Almacenamiento de archivos: útil si en el futuro necesito subir imágenes u otro contenido.
export const storage = getStorage(app);
// Cloud Functions: funciones backend serverless que resuelven lógica pesada (por ejemplo, el chat).
export const functions = getFunctions(app, 'us-central1');
export default app;