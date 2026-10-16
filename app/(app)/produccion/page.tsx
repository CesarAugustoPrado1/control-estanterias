import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import type { UnidadSalida } from "@/lib/db/schema";
import { cantidadSalida, UNIDAD_SALIDA } from "@/lib/estados";
import { m2, numero, porcentaje } from "@/lib/formato";
import {
  empaquePorProducto,
  hoy,
  llenadoPorProducto,
  porModelo,
  porUnidad,
  resolverPeriodo,
  sumaM2,
  sumarDias,
  type FilaEmpaque,
  type FilaLlenado,
} from "@/lib/produccion";
import { Boton, Campo, Entrada, Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";

export const metadata = { title: "Producción · Control de Estanterías" };
export const dynamic = "force-dynamic";

/** "jueves 15/10/2026". El dia viene como texto: se formatea sin zona. */
function nombreDia(dia: string, conDiaSemana = true): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: conDiaSemana ? "long" : undefined,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dia}T12:00:00Z`));
}

/** "120 paquetes · 8 unidades". */
function textoPorUnidad(m: Map<UnidadSalida, number>): string {
  if (!m.size) return "—";
  return [...m].map(([u, n]) => cantidadSalida(n, u, numero)).join(" · ");
}

const href = (desde: string, hasta: string) =>
  desde === hasta ? `/produccion?desde=${desde}` : `/produccion?desde=${desde}&hasta=${hasta}`;

export default async function Produccion({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requerirRol("oficina", "auditor", "trompo");
  const { desde, hasta, porDefecto } = await resolverPeriodo(await searchParams);
  const [llenado, empaque] = await Promise.all([
    llenadoPorProducto(desde, hasta),
    empaquePorProducto(desde, hasta),
  ]);

  const unDia = desde === hasta;
  const h = hoy();
  const primeroDeMes = `${h.slice(0, 8)}01`;
  const primeroMesAnterior = `${sumarDias(primeroDeMes, -1).slice(0, 8)}01`;
  const atajos = [
    { texto: "Día productivo anterior", url: "/produccion", activo: porDefecto },
    { texto: "Hoy", url: href(h, h), activo: !porDefecto && unDia && desde === h },
    {
      texto: "Últimos 7 días",
      url: href(sumarDias(h, -6), h),
      activo: desde === sumarDias(h, -6) && hasta === h,
    },
    { texto: "Este mes", url: href(primeroDeMes, h), activo: desde === primeroDeMes && hasta === h },
    {
      texto: "Mes anterior",
      url: href(primeroMesAnterior, sumarDias(primeroDeMes, -1)),
      activo: desde === primeroMesAnterior && hasta === sumarDias(primeroDeMes, -1),
    },
  ];

  const moldes = llenado.reduce((a, f) => a + f.moldes, 0);
  const m2Llenado = sumaM2(llenado.map((f) => f.m2));
  const esperados = empaque.reduce((a, f) => a + f.esperados, 0);
  const obtenidos = empaque.reduce((a, f) => a + f.obtenidos, 0);
  const m2Empaque = sumaM2(empaque.map((f) => f.m2Obtenidos));
  const rotura = esperados ? (100 * (esperados - obtenidos)) / esperados : null;

  return (
    <Pantalla
      titulo="Producción"
      bajada={
        unDia ? (
          <>
            <span className="capitalize">{nombreDia(desde)}</span>
            {porDefecto && " · último día con producción"}
          </>
        ) : (
          `Del ${nombreDia(desde, false)} al ${nombreDia(hasta, false)}`
        )
      }
      acciones={
        <a
          href={`/produccion/exportar?desde=${desde}&hasta=${hasta}`}
          className="inline-flex min-h-12 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Descargar Excel
        </a>
      }
    >
      <Tarjeta className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Link
              key={a.texto}
              href={a.url}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${
                a.activo
                  ? "bg-blue-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {a.texto}
            </Link>
          ))}
        </div>
        {/* Clave por periodo: si no, al navegar con los atajos los campos
            quedan mostrando las fechas anteriores. */}
        <form key={`${desde}-${hasta}`} className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <Campo etiqueta="Desde">
            <Entrada type="date" name="desde" defaultValue={desde} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="date" name="hasta" defaultValue={hasta} />
          </Campo>
          <Boton type="submit" className="col-span-2 sm:col-span-1">
            Ver
          </Boton>
        </form>
        {unDia && (
          <div className="flex gap-2">
            <Link href={href(sumarDias(desde, -1), sumarDias(desde, -1))} className={FLECHA}>
              ‹ Día anterior
            </Link>
            {desde < h && (
              <Link href={href(sumarDias(desde, 1), sumarDias(desde, 1))} className={FLECHA}>
                Día siguiente ›
              </Link>
            )}
          </div>
        )}
      </Tarjeta>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato titulo="Moldes llenados" valor={numero(moldes)} />
        <Dato titulo="m² llenados" valor={m2(m2Llenado)} />
        <Dato titulo="m² empaquetados" valor={m2(m2Empaque)} />
        <Dato titulo="Rotura en empaque" valor={porcentaje(rotura)} alerta={rotura !== null && rotura > 0} />
      </div>

      <Seccion
        titulo="Llenado en el trompo"
        cantidad={llenado.reduce((a, f) => a + f.tandas, 0)}
        ayuda="Producto en proceso: lo que se llenó en el período, por fecha de llenado. La salida y los m² son lo que debería salir de esos moldes."
      >
        {llenado.length === 0 ? (
          <Vacio>No se llenó nada en este período.</Vacio>
        ) : (
          <div className="space-y-3">
            {porModelo(llenado).map((g) => (
              <TablaLlenado key={g.modelo} modelo={g.modelo} filas={g.filas} />
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Empaquetado"
        cantidad={empaque.reduce((a, f) => a + f.tandas, 0)}
        ayuda="Producto terminado: lo que se cerró en empaque en el período, por fecha de empaquetado (no de llenado). Esperado contra obtenido."
      >
        {empaque.length === 0 ? (
          <Vacio>No se empaquetó nada en este período.</Vacio>
        ) : (
          <div className="space-y-3">
            {porModelo(empaque).map((g) => (
              <TablaEmpaque key={g.modelo} modelo={g.modelo} filas={g.filas} />
            ))}
          </div>
        )}
      </Seccion>
    </Pantalla>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <Tarjeta>
      <div className="text-sm text-slate-600">{titulo}</div>
      <div className={`cifra mt-1 text-2xl font-bold ${alerta ? "text-red-700" : "text-slate-900"}`}>
        {valor}
      </div>
    </Tarjeta>
  );
}

const FLECHA =
  "inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";
const CAJA_TABLA = "overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200";
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
const TD = "px-3 py-2";
const NUM = "cifra px-3 py-2 text-right whitespace-nowrap";

function Producto({ f }: { f: FilaLlenado }) {
  return (
    <td className={TD}>
      <div className="font-medium text-slate-900">{f.producto}</div>
      {f.codigo && <div className="cifra text-xs text-slate-500">{f.codigo}</div>}
    </td>
  );
}

function TablaLlenado({ modelo, filas }: { modelo: string; filas: FilaLlenado[] }) {
  return (
    <>
      <div className={`${CAJA_TABLA} hidden sm:block`}>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={`${TH} text-slate-900`}>{modelo}</th>
              <th className={`${TH} text-right`}>Tandas</th>
              <th className={`${TH} text-right`}>Moldes</th>
              <th className={`${TH} text-right`}>Salida esperada</th>
              <th className={`${TH} text-right`}>m²</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={`${f.productoId}-${f.unidad}`}>
                <Producto f={f} />
                <td className={NUM}>{numero(f.tandas)}</td>
                <td className={NUM}>{numero(f.moldes)}</td>
                <td className={NUM}>{cantidadSalida(f.esperados, f.unidad, numero)}</td>
                <td className={NUM}>{m2(f.m2)}</td>
              </tr>
            ))}
          </tbody>
          {filas.length > 1 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className={TD}>Total {modelo}</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.tandas, 0))}</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.moldes, 0))}</td>
                <td className={NUM}>{textoPorUnidad(porUnidad(filas, (f) => f.esperados))}</td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <ListaMovil
        modelo={modelo}
        filas={filas.map((f) => ({
          f,
          detalle: `${numero(f.moldes)} moldes · ${cantidadSalida(f.esperados, f.unidad, numero)}`,
          m2: f.m2,
        }))}
        total={`${numero(filas.reduce((a, f) => a + f.moldes, 0))} moldes · ${textoPorUnidad(porUnidad(filas, (f) => f.esperados))}`}
        m2Total={sumaM2(filas.map((f) => f.m2))}
      />
    </>
  );
}

function TablaEmpaque({ modelo, filas }: { modelo: string; filas: FilaEmpaque[] }) {
  return (
    <>
      <div className={`${CAJA_TABLA} hidden sm:block`}>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={`${TH} text-slate-900`}>{modelo}</th>
              <th className={`${TH} text-right`}>Tandas</th>
              <th className={`${TH} text-right`}>Esperado</th>
              <th className={`${TH} text-right`}>Obtenido</th>
              <th className={`${TH} text-right`}>Diferencia</th>
              <th className={`${TH} text-right`}>m² esperados</th>
              <th className={`${TH} text-right`}>m² obtenidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => {
              const dif = f.obtenidos - f.esperados;
              return (
                <tr key={`${f.productoId}-${f.unidad}`}>
                  <Producto f={f} />
                  <td className={NUM}>{numero(f.tandas)}</td>
                  <td className={NUM}>{cantidadSalida(f.esperados, f.unidad, numero)}</td>
                  <td className={`${NUM} font-semibold`}>{cantidadSalida(f.obtenidos, f.unidad, numero)}</td>
                  <td className={`${NUM} ${dif < 0 ? "text-red-700" : "text-slate-500"}`}>
                    {dif === 0 ? "—" : numero(dif)}
                  </td>
                  <td className={NUM}>{m2(f.m2)}</td>
                  <td className={`${NUM} font-semibold`}>{m2(f.m2Obtenidos)}</td>
                </tr>
              );
            })}
          </tbody>
          {filas.length > 1 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className={TD}>Total {modelo}</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.tandas, 0))}</td>
                <td className={NUM}>{textoPorUnidad(porUnidad(filas, (f) => f.esperados))}</td>
                <td className={NUM}>{textoPorUnidad(porUnidad(filas, (f) => f.obtenidos))}</td>
                <td className={NUM} />
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2)))}</td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2Obtenidos)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <ListaMovil
        modelo={modelo}
        filas={filas.map((f) => {
          const dif = f.obtenidos - f.esperados;
          return {
            f,
            detalle: `${cantidadSalida(f.obtenidos, f.unidad, numero)} de ${numero(f.esperados)} esperad${UNIDAD_SALIDA[f.unidad].femenino ? "as" : "os"}${dif ? ` (${numero(dif)})` : ""}`,
            m2: f.m2Obtenidos,
            alerta: dif < 0,
          };
        })}
        total={`${textoPorUnidad(porUnidad(filas, (f) => f.obtenidos))} de ${textoPorUnidad(porUnidad(filas, (f) => f.esperados))}`}
        m2Total={sumaM2(filas.map((f) => f.m2Obtenidos))}
      />
    </>
  );
}

/** En el celular la tabla no entra: una linea por producto con lo importante. */
function ListaMovil({
  modelo,
  filas,
  total,
  m2Total,
}: {
  modelo: string;
  filas: { f: FilaLlenado; detalle: string; m2: string | null; alerta?: boolean }[];
  total: string;
  m2Total: number | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 sm:hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
        {modelo}
      </div>
      <ul className="divide-y divide-slate-100">
        {filas.map(({ f, detalle, m2: valor, alerta }) => (
          <li
            key={`${f.productoId}-${f.unidad}`}
            className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium text-slate-900">{f.producto}</div>
              <div className={`cifra text-xs ${alerta ? "text-red-700" : "text-slate-600"}`}>{detalle}</div>
              {f.codigo && <div className="cifra text-xs text-slate-400">{f.codigo}</div>}
            </div>
            <div className="cifra shrink-0 font-semibold text-slate-900">{m2(valor)}</div>
          </li>
        ))}
      </ul>
      {filas.length > 1 && (
        <div className="flex items-start justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
          <div className="cifra min-w-0 text-xs text-slate-700">{total}</div>
          <div className="cifra shrink-0">{m2(m2Total)}</div>
        </div>
      )}
    </div>
  );
}
