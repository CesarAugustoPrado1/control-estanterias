"use client";

import { useEffect, useState } from "react";

/**
 * Pantalla de error con reintento.
 *
 * Existe sobre todo por un caso concreto: el compute de Neon se apaga a los 5
 * minutos sin uso, y al despertar la primera consulta puede fallar en vez de
 * esperar el arranque. Es el escenario del PRIMER OPERARIO DE LA MAÑANA, que
 * sin esto vería una pantalla de error genérica y concluiría, razonablemente,
 * que la app está rota.
 *
 * Por eso reintenta una vez sola y automáticamente: si el problema era la base
 * dormida, el operario no llega a ver nada. Si vuelve a fallar, hay algo real y
 * el botón queda a mano en vez de reintentar en loop escondiendo el problema.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [yaReintento, setYaReintento] = useState(false);

  useEffect(() => {
    console.error(error);
    if (yaReintento) return;
    setYaReintento(true);
    const t = setTimeout(reset, 1200);
    return () => clearTimeout(t);
  }, [error, reset, yaReintento]);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          No se pudo cargar la pantalla
        </h1>
        <p className="mt-2 text-slate-600">
          {yaReintento
            ? "Probá de nuevo. Si es la primera vez que se abre la app en el día, la base puede haber estado dormida."
            : "Reintentando…"}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          <strong>Ningún movimiento se perdió:</strong> esto es un problema al
          leer, no al guardar.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-blue-700 px-6 font-semibold text-white hover:bg-blue-800"
        >
          Reintentar
        </button>
        {error.digest && (
          <p className="mt-6 font-mono text-xs text-slate-400">
            ref: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
