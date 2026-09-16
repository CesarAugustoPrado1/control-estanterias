import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import {
  detallePorProducto,
  disponibilidadDeMoldes,
  resumenPorEstado,
} from "@/lib/consultas";
import { capacidadHorno } from "@/lib/acciones/motor";
import {
  ESPERA_ESTADO,
  ORDEN_ESTADOS,
  TITULO_ESTADO,
} from "@/lib/estados";
import { haceCuanto, numero } from "@/lib/formato";
import type { Estado } from "@/lib/db/schema";
import { ChipCemento } from "@/components/tanda";
import {
  Contador,
  Pantalla,
  Seccion,
  Tarjeta,
  Vacio,
} from "@/components/ui";

export const metadata = { title: "Tablero · Control de Estanterías" };
// El tablero es una foto del piso: tiene que reflejar lo que acaba de pasar.
export const dynamic = "force-dynamic";

export default async function Tablero({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  await requerirSesion();
  const { ver } = await searchParams;

  const [resumen, moldes, cupo] = await Promise.all([
    resumenPorEstado(),
    disponibilidadDeMoldes(),
    capacidadHorno(),
  ]);

  const enCurso = new Map(
    resumen.enCurso.map((r) => [r.estado, r]),
  );
  const abierto = ORDEN_ESTADOS.includes(ver as Estado) ? (ver as Estado) : null;
  const detalle = abierto ? await detallePorProducto(abierto) : null;

  const totalEnCurso = resumen.enCurso.reduce((a, r) => a + Number(r.n), 0);
  const enHorno = Number(enCurso.get("horno")?.n ?? 0);

  const totalEstanterias = moldes.reduce((a, m) => a + m.total, 0);
  const totalLibres = moldes.reduce((a, m) => a + m.libres, 0);

  return (
    <Pantalla
      titulo="Tablero"
      bajada={
        <>
          {numero(totalEnCurso)} tandas en el circuito ·{" "}
          {numero(resumen.listasSemana)} terminadas en los últimos 7 días
        </>
      }
    >
      <Seccion titulo="Dónde está el material">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ORDEN_ESTADOS.filter((e) => e !== "listo").map((e) => {
            const r = enCurso.get(e);
            return (
              <Contador
                key={e}
                estado={e}
                href={abierto === e ? "/tablero" : `/tablero?ver=${e}`}
                titulo={TITULO_ESTADO[e]}
                valor={numero(Number(r?.n ?? 0))}
                pie={
                  r?.masVieja
                    ? `la más vieja, ${haceCuanto(r.masVieja)}`
                    : ESPERA_ESTADO[e]
                }
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Tocá cualquier número para ver de qué está compuesto.
        </p>
      </Seccion>

      {abierto && detalle && (
        <Seccion
          titulo={`${TITULO_ESTADO[abierto]}, por producto`}
          acciones={
            <Link
              href="/tablero"
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              Cerrar
            </Link>
          }
        >
          {detalle.length === 0 ? (
            <Vacio>No hay tandas en este estado.</Vacio>
          ) : (
            <Tarjeta className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Producto</th>
                    <th className="px-4 py-2 text-right font-medium">Tandas</th>
                    <th className="px-4 py-2 text-right font-medium">Moldes</th>
                    <th className="px-4 py-2 text-right font-medium">
                      La más vieja
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.map((d) => (
                    <tr key={d.producto}>
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {d.producto}
                      </td>
                      <td className="cifra px-4 py-2 text-right">{d.n}</td>
                      <td className="cifra px-4 py-2 text-right text-slate-600">
                        {numero(Number(d.moldes))}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">
                        {haceCuanto(d.masVieja)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tarjeta>
          )}
        </Seccion>
      )}

      <Seccion
        titulo="Horno"
        ayuda={
          enHorno >= cupo
            ? "El horno está lleno. Lo que se fragüe al patio ahora es capacidad perdida, no ahorro."
            : undefined
        }
      >
        <Tarjeta>
          <div className="flex items-baseline justify-between">
            <span className="cifra text-3xl font-bold text-slate-900">
              {enHorno}
              <span className="text-lg font-medium text-slate-500">
                {" "}
                / {cupo}
              </span>
            </span>
            <span className="text-sm text-slate-600">
              {Math.max(0, cupo - enHorno)} lugares libres
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${enHorno >= cupo ? "bg-red-500" : "bg-orange-500"}`}
              style={{ width: `${Math.min(100, (enHorno / cupo) * 100)}%` }}
            />
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion
        titulo="Moldes disponibles"
        cantidad={totalLibres}
        ayuda={
          <>
            De {numero(totalEstanterias)} estanterías, {numero(totalLibres)} están
            libres para llenar. Las que faltan están en el circuito y se liberan
            al desmoldarse.
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {moldes.map((m) => {
            const sinNada = m.libres === 0;
            return (
              <Tarjeta
                key={`${m.modeloId}-${m.familiaId}-${m.cemento}`}
                className={sinNada ? "ring-amber-300" : ""}
              >
                <div className="text-sm font-semibold text-slate-800">
                  {m.modelo}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                  {m.familia} {m.cemento === "blanco" && <ChipCemento cemento="blanco" />}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    className={`cifra text-2xl font-bold ${sinNada ? "text-amber-700" : "text-slate-900"}`}
                  >
                    {m.libres}
                  </span>
                  <span className="text-sm text-slate-500">
                    / {m.total} libres
                  </span>
                </div>
                {sinNada && (
                  <div className="mt-1 text-xs font-medium text-amber-700">
                    Todas en el circuito
                  </div>
                )}
              </Tarjeta>
            );
          })}
        </div>
      </Seccion>
    </Pantalla>
  );
}
