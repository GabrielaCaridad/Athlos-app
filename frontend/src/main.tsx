// Punto de entrada: monta la app y aplica estilos globales.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';        
import './index.css';
import './infrastructure/config/firebase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
