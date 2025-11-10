// Propósito: mapear códigos de error de Firebase Auth a mensajes legibles para el usuario.
// Mapeo de códigos de Firebase Auth a mensajes en español reutilizables
export function authErrorToMessage(code?: string): string {
  switch (code) {
    case 'auth/invalid-api-key':
      return 'API key inválida. Revisa tu configuración de Firebase.';
    case 'auth/invalid-email':
      return 'El formato del email es inválido.';
    case 'auth/wrong-password':
      return 'Contraseña incorrecta.';
    case 'auth/user-not-found':
      return 'Usuario no encontrado.';
    case 'auth/email-already-in-use':
      return 'Este email ya está registrado.';
    case 'auth/weak-password':
      return 'La contraseña es muy débil.';
    case 'auth/network-request-failed':
      return 'Error de red. Verifica tu conexión.';
    case 'auth/invalid-credential':
      return 'Credenciales inválidas.';
    case 'auth/operation-not-allowed':
      return 'El método de inicio de sesión no está habilitado.';
    case 'auth/user-disabled':
      return 'La cuenta de usuario está deshabilitada.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Intenta más tarde.';
    default:
      return 'Error de autenticación.';
  }
}


// wrong password -> "contraseña incorrecta"
// user-not-found -> "usuario no encontrado"
// network-request-failed -> "error de red. verifica tu conexión"