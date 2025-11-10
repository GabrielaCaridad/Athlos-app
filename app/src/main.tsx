/**
 * Punto de entrada de la app
 *
 * - Carga estilos globales y configura Firebase (`config`).
 * - Provee contexto de autenticación (AuthProvider) y enrutamiento (BrowserRouter).
 * - Monta el contenedor principal `App`.
 */
// Punto de entrada: monta la app y aplica estilos globales.
import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';        
import { AuthProvider } from './2-logica-negocio/hooks/AuthProvider';
import './index.css';
import './3-acceso-datos/firebase/config';
import { ToastProvider } from './1-presentacion/componentes/comun/ToastProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>
);
