"use client";

import type { Cemento } from "@/lib/db/schema";
import { usarFiltros, type DefFiltro } from "@/components/filtros";

type Placa = {
  id: number;
  etiqueta: string;
  modelo: string;
  familia: string;
  cemento: Cemento;
  moldes: number;
};

const FILTROS: DefFiltro[] = [
  { clave: "modelo", etiqueta: "Modelo" },
  { clave: "familia", etiqueta: "Color" },
  {
    clave: "cemento",
    etiqueta: "Cemento",
    opciones: [
      { valor: "gris", texto: "Gris" },
      { valor: "blanco", texto: "Blanco" },
    ],
  },
];

/**
 * Tabla de placas para grabar, con filtros para imprimir solo una parte (por
 * ejemplo, las de cemento blanco que faltan). La barra de filtros no se
 * imprime: sale solo la tabla de lo que quedo visible.
 */
export function TablaPlacas({ placas }: { placas: Placa[] }) {
  const filas = placas.map((p) => ({
    ...p,
    filtro: { modelo: p.modelo, familia: p.familia, cemento: p.cemento },
    busqueda: p.etiqueta,
  }));
  const { visibles, barra } = usarFiltros(filas, FILTROS);

  return (
    <>
      {barra}
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Texto a grabar</th>
              <th className="px-4 py-2 font-medium">Moldes</th>
              <th className="px-4 py-2 font-medium">Pintar laterales de blanco</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((e) => (
              <tr key={e.id} style={{ breakInside: "avoid" }}>
                <td className="px-4 py-2 font-mono text-base font-bold">{e.etiqueta}</td>
                <td className="cifra px-4 py-2">{e.moldes}</td>
                <td className="px-4 py-2">{e.cemento === "blanco" ? "SÍ" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
