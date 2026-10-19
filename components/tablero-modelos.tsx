import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, TITULO_ESTADO } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { Muestra } from "@/components/selector-producto";
import { Vacio } from "@/components/ui";

/** Los estados del circuito, en orden: lo listo ya salio y no se cuenta. */
export const ESTADOS_CIRCUITO: Estado[] = ["patio", "horno", "a_desmoldar", "a_empaquetar"];

export type FilaCircuito = {
  modelo: string;
  familia: string;
  producto: string;
  estado: Estado;
  n: number;
  moldes: number;
};

type Conteo = Record<Estado, number>;
type Producto = { nombre: string; familia: string; total: number; moldes: number; por: Conteo };
type Modelo = { nombre: string; total: number; moldes: number; por: Conteo; productos: Producto[] };

const vacio = (): Conteo => ({ patio: 0, horno: 0, a_desmoldar: 0, a_empaquetar: 0, listo: 0 });

/** Agrupa las filas por modelo y producto; los mas cargados primero. */
export function agruparPorModelo(filas: FilaCircuito[]): Modelo[] {
  const modelos = new Map<string, Modelo>();
  for (const f of filas) {
    let m = modelos.get(f.modelo);
    if (!m) modelos.set(f.modelo, (m = { nombre: f.modelo, total: 0, moldes: 0, por: vacio(), productos: [] }));
    let p = m.productos.find((x) => x.nombre === f.producto);
    if (!p) m.productos.push((p = { nombre: f.producto, familia: f.familia, total: 0, moldes: 0, por: vacio() }));
    for (const x of [m, p]) {
      x.total += f.n;
      x.moldes += f.moldes;
      x.por[f.estado] += f.n;
    }
  }
  const lista = [...modelos.values()];
  for (const m of lista) m.productos.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  return lista.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** Una caja por estado, como en el tablero de los secaderos. En cero, apagada. */
function Cajas({ por, chico }: { por: Conteo; chico?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ESTADOS_CIRCUITO.map((e) => {
        const n = por[e];
        const c = COLOR_ESTADO[e];
        return (
          <div
            key={e}
            className={`rounded-lg px-1 text-center ${chico ? "py-1" : "py-2"} ${n ? c.fondo : "bg-slate-50 opacity-50"}`}
          >
            <div className={`cifra font-bold text-slate-900 ${chico ? "text-base" : "text-2xl"}`}>{n}</div>
            {!chico && <div className="text-[11px] font-medium leading-tight text-slate-600">{TITULO_ESTADO[e]}</div>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tablero por modelo: una tarjeta por modelo con cuantas maquinadas hay en
 * cada estado. Se toca y se abre el detalle de cada producto de ese modelo.
 */
export function TableroPorModelo({ filas }: { filas: FilaCircuito[] }) {
  const modelos = agruparPorModelo(filas);
  if (!modelos.length) return <Vacio>No hay maquinadas en el circuito.</Vacio>;
  return (
    <div className="space-y-3">
      {modelos.map((m) => (
        <details key={m.nombre} className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer list-none p-4 select-none [&::-webkit-details-marker]:hidden">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-slate-900">{m.nombre}</div>
                <div className="mt-0.5 flex items-center gap-1 text-sm text-blue-700">
                  {m.productos.length} producto{m.productos.length === 1 ? "" : "s"}
                  <span aria-hidden className="transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="cifra text-3xl font-bold leading-none text-slate-900">{m.total}</div>
                <div className="cifra mt-1 text-sm text-slate-500">
                  maquinada{m.total === 1 ? "" : "s"} · {numero(m.moldes)} moldes
                </div>
              </div>
            </div>
            <Cajas por={m.por} />
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4 pb-2">
            {m.productos.map((p) => (
              <li key={p.nombre} className="py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Muestra nombre={p.nombre} familia={p.familia} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{p.nombre}</span>
                  <span className="cifra shrink-0 text-sm text-slate-600">
                    <strong className="text-slate-900">{p.total}</strong> · {numero(p.moldes)} moldes
                  </span>
                </div>
                <Cajas por={p.por} chico />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** Referencia de colores para las cajas chicas de los productos, que no llevan nombre. */
export function LeyendaEstados() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
      {ESTADOS_CIRCUITO.map((e) => (
        <span key={e} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${COLOR_ESTADO[e].punto}`} />
          {TITULO_ESTADO[e]}
        </span>
      ))}
    </div>
  );
}
