"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionCorregir } from "@/lib/acciones/flujo";
import type { Estado, MotivoRotura } from "@/lib/db/schema";
import { ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { usarAccion } from "@/components/usar-accion";
import {
  Aviso,
  Boton,
  Campo,
  Entrada,
  Selector,
  Tarjeta,
} from "@/components/ui";

export function FormularioCorreccion({
  tandaId,
  codigo,
  estado,
  moldesLlenados,
  paquetes,
}: {
  tandaId: number;
  codigo: string;
  estado: Estado;
  moldesLlenados: number;
  paquetes: number | null;
  motivos: MotivoRotura[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<Estado>(estado);
  const { enviar, cargando, error, ok } = usarAccion(accionCorregir, {
    alTerminar: () => {
      setAbierto(false);
      router.refresh();
    },
  });

  if (!abierto) {
    return (
      <>
        {ok && <Aviso tono="ok">Corrección registrada en {ok}.</Aviso>}
        <div className="mt-2">
          <Boton type="button" tono="neutro" onClick={() => setAbierto(true)}>
            Corregir la tanda {codigo}
          </Boton>
        </div>
      </>
    );
  }

  const vuelveAlCircuito =
    estado === "listo" && nuevoEstado !== "listo";

  return (
    <Tarjeta className="ring-2 ring-amber-400">
      <form
        action={(fd) => {
          fd.set("tandaId", String(tandaId));
          enviar(fd);
        }}
        className="space-y-4"
      >
        <Campo etiqueta="Estado">
          <Selector
            name="estado"
            value={nuevoEstado}
            onChange={(e) => setNuevoEstado(e.target.value as Estado)}
          >
            {ORDEN_ESTADOS.map((e) => (
              <option key={e} value={e}>
                {TITULO_ESTADO[e]}
                {e === estado ? " (actual)" : ""}
              </option>
            ))}
          </Selector>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Moldes llenados"
            ayuda="Sostiene el cálculo de rotura. Cambialo solo si el trompo cargó mal."
          >
            <Entrada
              name="moldesLlenados"
              inputMode="numeric"
              defaultValue={String(moldesLlenados)}
              className="cifra"
            />
          </Campo>
          <Campo
            etiqueta="Paquetes"
            ayuda="Vacío significa «todavía no se contó», que no es lo mismo que cero."
          >
            <Entrada
              name="paquetes"
              inputMode="numeric"
              defaultValue={paquetes === null ? "" : String(paquetes)}
              className="cifra"
            />
          </Campo>
        </div>

        <Campo
          etiqueta="Nota (obligatoria)"
          ayuda="Qué estaba mal y por qué. Un cambio sin explicación en el historial es peor que el error que vino a arreglar."
        >
          <Entrada name="nota" required />
        </Campo>

        {nuevoEstado === estado && (
          <Aviso>
            Al no cambiar de estado, se conserva desde cuándo está en éste: así
            arreglar un tipeo no se lleva puesto el tiempo de horno medido.
          </Aviso>
        )}
        {vuelveAlCircuito && (
          <Aviso tono="atencion">
            Estás devolviendo una tanda cerrada al circuito. Va a volver a
            retener una estantería.
          </Aviso>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="flex gap-2">
          <Boton type="submit" tono="peligro" disabled={cargando}>
            {cargando ? "Guardando…" : "Registrar corrección"}
          </Boton>
          <Boton type="button" tono="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
