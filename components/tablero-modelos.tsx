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

const vacio = (): Conteo => ({ patio: 0, horno: 0, a_desmoldar: 0, a_empaquetar: 0, listo: 0 });

/**
 * Un renglon por producto (modelo + color): "Ekos Beige" y "Ekos Gris" van
 * por separado, que es lo que sirve en planta. Por nombre, asi los del mismo
 * modelo quedan juntos y se encuentran facil.
 */
export function agruparPorProducto(filas: FilaCircuito[]): Producto[] {
  const productos = new Map<string, Producto>();
  for (const f of filas) {
    let p = productos.get(f.producto);
    if (!p) productos.set(f.producto, (p = { nombre: f.producto, familia: f.familia, total: 0, moldes: 0, por: vacio() }));
    p.total += f.n;
    p.moldes += f.moldes;
    p.por[f.estado] += f.n;
  }
  return [...productos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Una caja por estado, como en el tablero de los secaderos. En cero, apagada. */
function Cajas({ por }: { por: Conteo }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ESTADOS_CIRCUITO.map((e) => {
        const n = por[e];
        const c = COLOR_ESTADO[e];
        return (
          <div
            key={e}
            className={`rounded-lg px-1 text-center py-2 ${n ? c.fondo : "bg-slate-50 opacity-50"}`}
          >
            <div className={`cifra font-bold text-slate-900 text-2xl`}>{n}</div>
            <div className="text-[11px] font-medium leading-tight text-slate-600">{TITULO_ESTADO[e]}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tablero por producto: una tarjeta por modelo + color con cuantas maquinadas
 * hay en cada estado.
 */
export function TableroPorModelo({ filas }: { filas: FilaCircuito[] }) {
  const productos = agruparPorProducto(filas);
  if (!productos.length) return <Vacio>No hay maquinadas en el circuito.</Vacio>;
  return (
    <div className="space-y-3">
      {productos.map((p) => (
        <div key={p.nombre} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Muestra nombre={p.nombre} familia={p.familia} grande />
              <span className="text-lg font-semibold leading-tight text-slate-900">{p.nombre}</span>
            </div>
            <div className="shrink-0 text-right">
              <div className="cifra text-3xl font-bold leading-none text-slate-900">{p.total}</div>
              <div className="cifra mt-1 text-xs text-slate-500">
                maquinada{p.total === 1 ? "" : "s"} · {numero(p.moldes)} moldes
              </div>
            </div>
          </div>
          <Cajas por={p.por} />
        </div>
      ))}
    </div>
  );
}
