// Punto de entrada: monta la app y aplica estilos globales.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';        
import './index.css';
import './3-acceso-datos/firebase/config';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
