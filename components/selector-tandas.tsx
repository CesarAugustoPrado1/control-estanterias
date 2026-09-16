"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Tanda } from "@/lib/db/schema";
import { haceCuanto, numero } from "@/lib/formato";
import { MarcaRehornear } from "./ui";
import { ChipCemento, MarcaSospechosa, NombreTanda, Placa, esSospechosa } from "./tanda";

/**
 * Lista de tandas con seleccion multiple.
 *
 * Orden: SIEMPRE lo mas viejo primero, y las devoluciones de horno antes que
 * todo. Eso ya viene resuelto desde la consulta; aca no se reordena, para que
 * la pantalla no contradiga a la base.
 */
export function SelectorTandas({
  tandas,
  vacio,
  acciones,
  detalle,
}: {
  tandas: Tanda[];
  vacio: ReactNode;
  /** Recibe los ids elegidos y una funcion para limpiar despues de actuar. */
  acciones: (elegidas: number[], limpiar: () => void) => ReactNode;
  /** Linea extra por tanda, propia de cada pantalla. */
  detalle?: (t: Tanda) => ReactNode;
}) {
  const [sel, setSel] = useState<Set<number>>(new Set());

  const elegidas = useMemo(
    () => tandas.filter((t) => sel.has(t.id)).map((t) => t.id),
    [tandas, sel],
  );

  const alternar = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const limpiar = () => setSel(new Set());
  const todas = () => setSel(new Set(tandas.map((t) => t.id)));

  if (!tandas.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
        {vacio}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={elegidas.length === tandas.length ? limpiar : todas}
          className="font-semibold text-blue-700 hover:underline"
        >
          {elegidas.length === tandas.length
            ? "Deseleccionar todo"
            : "Seleccionar todo"}
        </button>
        <span className="cifra text-slate-500">
          {elegidas.length} de {tandas.length}
        </span>
      </div>

      <ul className="space-y-2">
        {tandas.map((t) => {
          const marcada = sel.has(t.id);
          return (
            <li key={t.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 transition-colors ${
                  marcada
                    ? "ring-2 ring-blue-600"
                    : t.rehornear
                      ? "ring-red-300"
                      : "ring-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(t.id)}
                  // Grande a proposito: se toca con guantes.
                  className="mt-0.5 h-6 w-6 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NombreTanda
                      palabra={t.tarjetaPalabra}
                      letra={t.tarjetaLetra}
                      codigo={t.codigo}
                    />
                    {t.rehornear && <MarcaRehornear />}
                    {esSospechosa(t.estado, t.estadoDesde) && <MarcaSospechosa />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                    <Placa etiqueta={t.estanteriaEtiqueta} />
                    {t.cemento === "blanco" && <ChipCemento cemento="blanco" />}
                    <span className="truncate">{t.productoNombre}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {numero(t.moldesLlenados)} moldes · {haceCuanto(t.estadoDesde)}
                    {t.moldesNominal && t.moldesLlenados < t.moldesNominal && (
                      <> · faltaron {t.moldesNominal - t.moldesLlenados}</>
                    )}
                  </div>
                  {detalle?.(t)}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {/* Barra fija abajo: con listas largas, el boton tiene que estar donde
          esta el pulgar, no al final del scroll. */}
      {elegidas.length > 0 && (
        <div className="no-imprimir fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
            <span className="cifra mr-auto text-sm font-semibold text-slate-700">
              {elegidas.length} seleccionada{elegidas.length > 1 ? "s" : ""}
            </span>
            {acciones(elegidas, limpiar)}
          </div>
        </div>
      )}
    </div>
  );
}
