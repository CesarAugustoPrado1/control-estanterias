import { Navegacion } from "@/components/navegacion";
import { requerirSesion } from "@/lib/auth";

/**
 * Margen para el arranque en frio de Neon.
 *
 * El compute se apaga a los 5 minutos sin uso. Una lectura fria tarda ~2 s,
 * pero la primera ESCRITURA ademas abre un WebSocket y arranca una transaccion,
 * y el limite por defecto de Vercel puede quedar corto justo ahi: el resultado
 * seria un fallo de transporte -"no se pudo conectar"- en vez de una espera.
 *
 * Las server actions heredan la configuracion del segmento desde el que se
 * invocan, asi que ponerlo en este layout cubre las cuatro pantallas de
 * operacion de una vez.
 */
export const maxDuration = 30;

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await requerirSesion();
  return (
    <>
      <Navegacion rol={sesion.rol} nombre={sesion.nombre} />
      <main>{children}</main>
    </>
  );
}
