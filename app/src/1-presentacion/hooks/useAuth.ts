// Propósito: exponer useAuth desde la ubicación de negocio sin duplicar lógica.
// Contexto: reexporta el hook real (estado de usuario y helpers) desde 2-logica-negocio.
export { useAuth } from '../../2-logica-negocio/hooks/useAuth';