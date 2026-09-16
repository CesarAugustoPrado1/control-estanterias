import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { historial, listarUsuarios, type FiltroMovimientos } from "@/lib/consultas";
import {
  ETIQUETA_MOTIVO_FRAGUADO,
  ETIQUETA_MOVIMIENTO,
  QUE_MIDE_LA_DURACION,
} from "@/lib/estados";
import { duracion, fechaHora, numero } from "@/lib/formato";
import { tipoMovimientoEnum, type TipoMovimiento } from "@/lib/db/schema";
import {
  Boton,
  Campo,
  Entrada,
  Pantalla,
  Selector,
  Tarjeta,
  Vacio,
} from "@/components/ui";

export const metadata = { title: "Movimientos · Control de Estanterías" };
export const dynamic = "force-dynamic";

type Params = {
  tipo?: string;
  usuarioId?: string;
  desde?: string;
  hasta?: string;
  texto?: string;
  pagina?: string;
};

function aFiltro(p: Params): FiltroMovimientos {
  const tipos = tipoMovimientoEnum.enumValues as readonly string[];
  return {
    tipo: p.tipo && tipos.includes(p.tipo) ? (p.tipo as TipoMovimiento) : undefined,
    usuarioId: p.usuarioId ? Number(p.usuarioId) || undefined : undefined,
    desde: p.desde || undefined,
    hasta: p.hasta || undefined,
    texto: p.texto || undefined,
  };
}

export default async function Movimientos({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requerirRol("oficina", "auditor");
  const p = await searchParams;
  const filtro = aFiltro(p);
  const pagina = Math.max(1, Number(p.pagina) || 1);

  const [{ filas, total, paginas }, usuarios] = await Promise.all([
    historial(filtro, pagina),
    listarUsuarios(),
  ]);

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v && k !== "pagina") qs.set(k, String(v));
  }
  const conPagina = (n: number) => {
    const q = new URLSearchParams(qs);
    q.set("pagina", String(n));
    return `/movimientos?${q}`;
  };

  return (
    <Pantalla
      titulo="Movimientos"
      bajada={`${numero(total)} registros`}
      acciones={
        <a
          href={`/movimientos/exportar?${qs}`}
          className="inline-flex min-h-12 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Descargar CSV
        </a>
      }
    >
      <Tarjeta className="mb-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Campo etiqueta="Buscar">
            <Entrada
              name="texto"
              defaultValue={p.texto ?? ""}
              placeholder="Código o producto"
            />
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector name="tipo" defaultValue={p.tipo ?? ""}>
              <option value="">Todos</option>
              {tipoMovimientoEnum.enumValues.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_MOVIMIENTO[t]}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Usuario">
            <Selector name="usuarioId" defaultValue={p.usuarioId ?? ""}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Desde">
            <Entrada type="date" name="desde" defaultValue={p.desde ?? ""} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="date" name="hasta" defaultValue={p.hasta ?? ""} />
          </Campo>
          <div className="flex items-end gap-2 lg:col-span-5">
            <Boton type="submit">Filtrar</Boton>
            <Link
              href="/movimientos"
              className="inline-flex min-h-12 items-center rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </Tarjeta>

      {filas.length === 0 ? (
        <Vacio>No hay movimientos con esos filtros.</Vacio>
      ) : (
        <Tarjeta className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Cuándo</th>
                <th className="px-3 py-2 font-medium">Tanda</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Qué pasó</th>
                <th className="px-3 py-2 font-medium">Quién</th>
                <th className="px-3 py-2 text-right font-medium">Duración</th>
                <th className="px-3 py-2 text-right font-medium">Dato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {fechaHora(m.creadoEn)}
                  </td>
                  <td className="cifra whitespace-nowrap px-3 py-2 font-semibold text-slate-900">
                    {m.tandaCodigo}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{m.productoNombre}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-800">
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </span>
                    {m.motivoFraguado && (
                      <div className="text-xs text-amber-700">
                        {ETIQUETA_MOTIVO_FRAGUADO[m.motivoFraguado]}
                      </div>
                    )}
                    {m.nota && (
                      <div className="text-xs text-slate-500">{m.nota}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{m.usuarioNombre}</td>
                  <td className="cifra whitespace-nowrap px-3 py-2 text-right text-slate-600">
                    {duracion(m.duracionMin)}
                    {m.duracionMin !== null && QUE_MIDE_LA_DURACION[m.tipo] && (
                      <div className="text-xs text-slate-400">
                        {QUE_MIDE_LA_DURACION[m.tipo]}
                      </div>
                    )}
                  </td>
                  <td className="cifra whitespace-nowrap px-3 py-2 text-right text-slate-700">
                    {m.moldesLlenados !== null && <>{m.moldesLlenados} moldes</>}
                    {m.paquetes !== null && <>{m.paquetes} paquetes</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Link
            href={conPagina(pagina - 1)}
            aria-disabled={pagina <= 1}
            className={`inline-flex min-h-12 items-center rounded-lg px-4 text-sm font-semibold ${
              pagina <= 1
                ? "pointer-events-none text-slate-400"
                : "bg-white text-slate-800 ring-1 ring-slate-300"
            }`}
          >
            ← Anterior
          </Link>
          <span className="cifra text-sm text-slate-600">
            {pagina} de {paginas}
          </span>
          <Link
            href={conPagina(pagina + 1)}
            aria-disabled={pagina >= paginas}
            className={`inline-flex min-h-12 items-center rounded-lg px-4 text-sm font-semibold ${
              pagina >= paginas
                ? "pointer-events-none text-slate-400"
                : "bg-white text-slate-800 ring-1 ring-slate-300"
            }`}
          >
            Siguiente →
          </Link>
        </div>
      )}
    </Pantalla>
  );
}
