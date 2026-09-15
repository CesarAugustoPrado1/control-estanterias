"use client";

import { useCallback, useState, useTransition } from "react";
import type { Resultado } from "@/lib/acciones/comun";

/**
 * Ejecuta una server action con reintentos SOLO para fallos de red.
 *
 * La distincion es la razon de ser de este hook. En planta la conexion se
 * corta, y un movimiento perdido por WiFi es un movimiento que el operario va a
 * volver a cargar a mano -o peor, va a dar por cargado-. Pero un
 * `{ ok: false }` es un RECHAZO DE NEGOCIO: la tanda ya no esta en ese estado,
 * falta un dato. Reintentarlo daria siempre lo mismo y solo esconderia el
 * mensaje que el operario necesita leer.
 *
 * Cuando se agotan los reintentos el mensaje dice explicitamente que NO se
 * guardo, que es lo unico que importa saber en ese momento.
 */
const REINTENTOS = 3;

export type EstadoAccion<T> = {
  cargando: boolean;
  error: string | null;
  ok: T | null;
};

export function usarAccion<T>(
  accion: (fd: FormData) => Promise<Resultado<T>>,
  opciones?: { alTerminar?: (datos: T) => void },
) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<T | null>(null);
  const [reintentando, setReintentando] = useState(0);

  const limpiar = useCallback(() => {
    setError(null);
    setOk(null);
  }, []);

  const enviar = useCallback(
    (fd: FormData) => {
      setError(null);
      setOk(null);
      iniciar(async () => {
        for (let intento = 1; intento <= REINTENTOS; intento++) {
          try {
            const r = await accion(fd);
            setReintentando(0);
            if (r.ok) {
              setOk(r.datos);
              opciones?.alTerminar?.(r.datos);
            } else {
              // Rechazo de negocio: NO se reintenta nunca.
              setError(r.error);
            }
            return;
          } catch {
            // Fallo de red o de servidor: puede andar en el proximo intento.
            if (intento === REINTENTOS) {
              setReintentando(0);
              setError(
                "No se pudo conectar. EL MOVIMIENTO NO SE GUARDÓ. " +
                  "Fijate que tengas señal y volvé a intentar.",
              );
              return;
            }
            setReintentando(intento);
            await new Promise((r) => setTimeout(r, 600 * intento));
          }
        }
      });
    },
    [accion, opciones],
  );

  return { enviar, cargando: pendiente, error, ok, reintentando, limpiar };
}
