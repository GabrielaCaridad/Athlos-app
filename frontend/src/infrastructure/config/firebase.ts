// Importaciones necesarias de Firebase SDK v9+
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuración del proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCn923Ga0FDTkfrR6sw4zW0rjVFplvYdfQ", // Clave API para autenticación
  authDomain: "athlos-c7de6.firebaseapp.com", // Dominio para autenticación web
  projectId: "athlos-c7de6", // ID único del proyecto en Firebase
  storageBucket: "athlos-c7de6.firebasestorage.app", // Bucket para almacenar archivos
  messagingSenderId: "y789060160802", // ID para notificaciones push
  appId: "1:789060160802:web:1c26ad914f19ece4fd697b" // ID único de la aplicación web
};

// Inicializa la aplicación Firebase con la configuración proporcionada
const app = initializeApp(firebaseConfig);

// Inicializa Firebase Authentication y obtiene una referencia al servicio
// Este objeto se usa para login, registro, logout, etc.
export const auth = getAuth(app);

// Inicializa Cloud Firestore (base de datos NoSQL) y obtiene referencia al servicio
// Se usa para guardar perfiles de usuario, entrenamientos, comidas, etc.
export const db = getFirestore(app);

// Inicializa Firebase Storage para almacenamiento de archivos
// Se puede usar para fotos de perfil, imágenes de ejercicios, etc.
export const storage = getStorage(app);

// Exporta la instancia principal de la app por si se necesita en otros lugares
export default app;