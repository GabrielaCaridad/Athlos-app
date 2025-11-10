// En este archivo configuro Firebase para mi proyecto.
// Inicializo la app y exporto los servicios que utilizo: Auth, Firestore, Storage y Functions.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Nota: Configurar siempre por variables de entorno de Vite (sin valores hardcodeados)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_REACT_APP_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_REACT_APP_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_REACT_APP_FIREBASE_APP_ID,
};
// Guard: valida variables para evitar llamadas a projects/undefined y errores 400 innecesarios
const missing = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  // No arrojamos las claves reales, solo avisamos qué variables faltan
  // Esto evita llamadas a https://.../projects/undefined/... que acaban en 400 y ruido en consola
  // Solución: crear app/.env.local con VITE_REACT_APP_FIREBASE_* correctas del mismo proyecto Firebase.
  // Variables requeridas: API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID
  // Ejemplo en app/.env.local.example
  console.error('[Firebase] Faltan variables de entorno para configurar Firebase:', missing);
}
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