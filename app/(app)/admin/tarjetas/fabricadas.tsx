"use client";

import { useRouter } from "next/navigation";
import { accionGuardarFabricadas } from "@/lib/acciones/flujo";
import { DIA_DE_LETRA, LETRAS, type Letra } from "@/lib/tarjetas";
import { usarAccion } from "@/components/usar-accion";
import { LetraDia } from "@/components/tanda";
import { Aviso, Boton, Entrada, Tarjeta } from "@/components/ui";

export function FormularioFabricadas({ fabricadas }: { fabricadas: Record<Letra, number> }) {
  const router = useRouter();
  const { enviar, cargando, error, ok } = usarAccion(accionGuardarFabricadas, {
    alTerminar: () => router.refresh(),
  });

  return (
    <Tarjeta>
      <form action={enviar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {LETRAS.map((l) => (
            <label key={l} className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-medium capitalize text-slate-700">
                <LetraDia letra={l} /> {DIA_DE_LETRA[l].dia}
              </span>
              <Entrada
                name={`fabricadas_${l}`}
                inputMode="numeric"
                pattern="\d*"
                defaultValue={fabricadas[l]}
                className="cifra"
              />
            </label>
          ))}
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        {ok !== null && <Aviso tono="ok">Guardado.</Aviso>}
        <Boton type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar"}
        </Boton>
      </form>
    </Tarjeta>
  );
}
