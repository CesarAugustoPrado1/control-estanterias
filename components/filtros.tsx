"use client";

import { useMemo, useState } from "react";
import { Entrada, Selector } from "@/components/ui";

/**
 * Filtros de una lista que ya esta entera en el cliente.
 *
 * Se filtra en el navegador y no en la consulta: son decenas de filas, no miles,
 * y asi cambiar un filtro es instantaneo aun con mala senal en la planta.
 *
 * Cada fila declara, por cada filtro, el valor o los valores que tiene (una
 * estanteria puede servir a productos de los dos aridos). Las opciones de cada
 * selector salen de las filas mismas, con la cantidad al lado: nunca se ofrece
 * una opcion que deja la lista vacia por si sola.
 */

export type DefFiltro = {
  clave: string;
  etiqueta: string;
  /** Texto de la opcion "todas" (por defecto "Todos"). */
  todos?: string;
  /**
   * Orden y texto de las opciones conocidas. Las que aparecen en las filas y no
   * estan aca se agregan al final con su valor como texto.
   */
  opciones?: { valor: string; texto: string }[];
};

export type ValoresFiltro = Record<string, string | string[]>;

type Fila = { filtro: ValoresFiltro; busqueda?: string };

const comoLista = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function usarFiltros<T extends Fila>(filas: T[], defs: DefFiltro[]) {
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState("");

  const visibles = useMemo(() => {
    const q = normalizar(texto.trim());
    return filas.filter(
      (f) =>
        defs.every((d) => !elegidos[d.clave] || comoLista(f.filtro[d.clave]).includes(elegidos[d.clave])) &&
        (!q || normalizar(f.busqueda ?? "").includes(q)),
    );
  }, [filas, defs, elegidos, texto]);

  // Opciones de cada filtro contadas sobre las filas que dejan pasar LOS DEMAS
  // filtros: asi el numero dice cuantas quedarian al elegir esa opcion.
  const opciones = useMemo(() => {
    const q = normalizar(texto.trim());
    return defs.map((d) => {
      const base = filas.filter(
        (f) =>
          defs.every(
            (o) =>
              o.clave === d.clave ||
              !elegidos[o.clave] ||
              comoLista(f.filtro[o.clave]).includes(elegidos[o.clave]),
          ) && (!q || normalizar(f.busqueda ?? "").includes(q)),
      );
      const cuenta = new Map<string, number>();
      for (const f of base) for (const v of comoLista(f.filtro[d.clave])) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
      const conocidas = (d.opciones ?? []).filter((o) => cuenta.has(o.valor) || o.valor === elegidos[d.clave]);
      const extra = [...cuenta.keys()]
        .filter((v) => !d.opciones?.some((o) => o.valor === v))
        .map((v) => ({ valor: v, texto: v }));
      return {
        def: d,
        lista: [...conocidas, ...extra].map((o) => ({ ...o, cantidad: cuenta.get(o.valor) ?? 0 })),
      };
    });
  }, [filas, defs, elegidos, texto]);

  const activos = Object.values(elegidos).filter(Boolean).length + (texto.trim() ? 1 : 0);

  return {
    visibles,
    barra: (
      <BarraFiltros
        opciones={opciones}
        elegidos={elegidos}
        texto={texto}
        total={filas.length}
        visibles={visibles.length}
        activos={activos}
        alElegir={(clave, valor) => setElegidos((e) => ({ ...e, [clave]: valor }))}
        alBuscar={setTexto}
        alLimpiar={() => {
          setElegidos({});
          setTexto("");
        }}
      />
    ),
  };
}

function BarraFiltros({
  opciones,
  elegidos,
  texto,
  total,
  visibles,
  activos,
  alElegir,
  alBuscar,
  alLimpiar,
}: {
  opciones: { def: DefFiltro; lista: { valor: string; texto: string; cantidad: number }[] }[];
  elegidos: Record<string, string>;
  texto: string;
  total: number;
  visibles: number;
  activos: number;
  alElegir: (clave: string, valor: string) => void;
  alBuscar: (t: string) => void;
  alLimpiar: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 print:hidden">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <label className="col-span-2 block sm:col-span-3 lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">Buscar</span>
          <Entrada
            type="search"
            value={texto}
            onChange={(e) => alBuscar(e.target.value)}
            placeholder="Placa, código, producto…"
          />
        </label>
        {opciones.map(({ def, lista }) => (
          <label key={def.clave} className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-slate-600">{def.etiqueta}</span>
            <Selector
              value={elegidos[def.clave] ?? ""}
              onChange={(e) => alElegir(def.clave, e.target.value)}
              className={elegidos[def.clave] ? "bg-blue-50! font-semibold ring-2! ring-blue-600!" : ""}
            >
              <option value="">{def.todos ?? "Todos"}</option>
              {lista.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto} ({o.cantidad})
                </option>
              ))}
            </Selector>
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm text-slate-600">
        <span>
          {activos ? (
            <>
              Mostrando <strong className="text-slate-900">{visibles}</strong> de {total}
            </>
          ) : (
            <>{total} en total</>
          )}
        </span>
        {activos > 0 && (
          <button type="button" onClick={alLimpiar} className="font-semibold text-blue-700">
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
