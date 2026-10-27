import Link from "next/link";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, TITULO_ESTADO } from "@/lib/estados";
import { haceCuanto, maquinadas, numero } from "@/lib/formato";
import { Muestra } from "@/components/selector-producto";
import { NombreTanda, Placa } from "@/components/tanda";
import { MarcaRehornear, Vacio } from "@/components/ui";

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
    p.total += Number(f.n);
    p.moldes += f.moldes;
    p.por[f.estado] += Number(f.n);
  }
  return [...productos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type Abierto = { producto: string; estado: Estado };
type TandaDetalle = {
  id: number;
  codigo: string;
  tarjetaPalabra: string | null;
  tarjetaLetra: string | null;
  estanteriaEtiqueta: string | null;
  moldesLlenados: number;
  /** 0,5 cada lado de un producto en par. */
  peso: string;
  estadoDesde: Date | string;
  rehornear: boolean;
};

const url = (producto: string, estado: Estado) =>
  `/tablero?vista=modelo&p=${encodeURIComponent(producto)}&e=${estado}`;

/**
 * Una caja por estado, como en el tablero de los secaderos. En cero, apagada.
 * Con algo adentro, se toca y abre abajo esas maquinadas; tocarla de nuevo la
 * cierra.
 */
function Cajas({ producto, por, abierta }: { producto: string; por: Conteo; abierta: Estado | null }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ESTADOS_CIRCUITO.map((e) => {
        const n = por[e];
        const c = COLOR_ESTADO[e];
        const contenido = (
          <>
            <div className="cifra text-2xl font-bold text-slate-900">{maquinadas(n)}</div>
            <div className="text-[11px] font-medium leading-tight text-slate-600">{TITULO_ESTADO[e]}</div>
          </>
        );
        if (!n) {
          return (
            <div key={e} className="rounded-lg bg-slate-50 px-1 py-2 text-center opacity-50">
              {contenido}
            </div>
          );
        }
        const activa = abierta === e;
        return (
          <Link
            key={e}
            href={activa ? "/tablero?vista=modelo" : url(producto, e)}
            scroll={false}
            aria-expanded={activa}
            className={`block rounded-lg px-1 py-2 text-center ${c.fondo} ${
              activa ? "ring-2 ring-slate-900" : "hover:brightness-95"
            }`}
          >
            {contenido}
          </Link>
        );
      })}
    </div>
  );
}

/** Las maquinadas de la caja tocada, de la que espera hace mas a la mas nueva. */
function Detalle({ estado, tandas }: { estado: Estado; tandas: TandaDetalle[] }) {
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="flex items-center justify-between px-1 pb-2 text-sm">
        <span className="font-semibold text-slate-800">
          {TITULO_ESTADO[estado]} · {maquinadas(tandas.reduce((a, t) => a + Number(t.peso), 0))} maquinada
          {tandas.reduce((a, t) => a + Number(t.peso), 0) === 1 ? "" : "s"}
        </span>
        <Link href="/tablero?vista=modelo" scroll={false} className="font-semibold text-blue-700 hover:underline">
          Cerrar
        </Link>
      </div>
      {tandas.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-slate-500">Ya no hay maquinadas acá. Actualizá la pantalla.</p>
      ) : (
        <ul className="space-y-1.5">
          {tandas.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tanda/${encodeURIComponent(t.codigo)}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <div className="min-w-0 space-y-1">
                  <NombreTanda palabra={t.tarjetaPalabra} letra={t.tarjetaLetra} codigo={t.codigo} />
                  <div className="flex flex-wrap items-center gap-1 text-slate-600">
                    {t.estanteriaEtiqueta && <Placa etiqueta={t.estanteriaEtiqueta} />}
                    <span>{numero(t.moldesLlenados)} moldes</span>
                    {t.rehornear && <MarcaRehornear />}
                  </div>
                </div>
                <span className="shrink-0 text-right text-xs text-slate-500">{haceCuanto(t.estadoDesde)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Tablero por producto: una tarjeta por modelo + color con cuantas maquinadas
 * hay en cada estado. La caja tocada abre su detalle debajo de la tarjeta.
 */
export function TableroPorModelo({
  filas,
  abierto,
  detalle,
}: {
  filas: FilaCircuito[];
  abierto: Abierto | null;
  detalle: TandaDetalle[] | null;
}) {
  const productos = agruparPorProducto(filas);
  if (!productos.length) return <Vacio>No hay maquinadas en el circuito.</Vacio>;
  return (
    <div className="space-y-3">
      {productos.map((p) => {
        const abierta = abierto?.producto === p.nombre ? abierto.estado : null;
        return (
          <div key={p.nombre} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Muestra nombre={p.nombre} familia={p.familia} grande />
                <span className="text-lg font-semibold leading-tight text-slate-900">{p.nombre}</span>
              </div>
              <div className="shrink-0 text-right">
                <div className="cifra text-3xl font-bold leading-none text-slate-900">{maquinadas(p.total)}</div>
                <div className="cifra mt-1 text-xs text-slate-500">
                  maquinada{p.total === 1 ? "" : "s"} · {numero(p.moldes)} moldes
                </div>
              </div>
            </div>
            <Cajas producto={p.nombre} por={p.por} abierta={abierta} />
            {abierta && detalle && <Detalle estado={abierta} tandas={detalle} />}
          </div>
        );
      })}
    </div>
  );
}
