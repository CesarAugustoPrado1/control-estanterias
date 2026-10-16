import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import type { UnidadSalida } from "@/lib/db/schema";
import { cantidadSalida, concordar, UNIDAD_SALIDA } from "@/lib/estados";
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
import { Boton, Campo, Entrada, Pantalla, Vacio } from "@/components/ui";

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
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  await requerirRol("oficina", "auditor", "trompo");
  const params = await searchParams;
  const { desde, hasta, porDefecto } = await resolverPeriodo(params);
  // Recien entrado (sin nada en la URL) el periodo se muestra abierto para
  // elegir; una vez elegido se pliega y deja la pantalla para los numeros.
  const eligiendo = Object.keys(params).length === 0;
  const [llenado, empaque] = await Promise.all([
    llenadoPorProducto(desde, hasta),
    empaquePorProducto(desde, hasta),
  ]);

  const unDia = desde === hasta;
  const h = hoy();
  const primeroDeMes = `${h.slice(0, 8)}01`;
  const primeroMesAnterior = `${sumarDias(primeroDeMes, -1).slice(0, 8)}01`;
  const atajos = [
    { texto: "Día productivo anterior", url: "/produccion?periodo=anterior", activo: porDefecto },
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
      acciones={
        <a
          href={`/produccion/exportar?desde=${desde}&hasta=${hasta}`}
          className="inline-flex min-h-12 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Descargar Excel
        </a>
      }
    >
      {/* La clave por periodo vuelve a montar el bloque al cambiar de periodo:
          asi se pliega solo despues de elegir, y los campos no quedan mostrando
          las fechas anteriores. */}
      <details key={`${desde}-${hasta}`} open={eligiendo} className={`${PLEGABLE} mb-3`}>
        <summary className={RESUMEN}>
          {unDia && (
            <Link
              href={href(sumarDias(desde, -1), sumarDias(desde, -1))}
              aria-label="Día anterior"
              className={FLECHA}
            >
              ‹
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Período</div>
            <div className="truncate font-semibold text-slate-900 first-letter:uppercase">
              {unDia ? nombreDia(desde) : `Del ${nombreDia(desde, false)} al ${nombreDia(hasta, false)}`}
            </div>
          </div>
          {unDia && desde < h && (
            <Link
              href={href(sumarDias(desde, 1), sumarDias(desde, 1))}
              aria-label="Día siguiente"
              className={FLECHA}
            >
              ›
            </Link>
          )}
          <Flechita />
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-4">
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
          <form className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
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
        </div>
      </details>

      <Plegable
        titulo="Llenado en el trompo"
        resumen={
          llenado.length
            ? `${tandasDe(llenado)} · ${numero(moldes)} moldes${m2Llenado === null ? "" : ` · ${m2(m2Llenado)}`}`
            : "Sin llenados"
        }
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
      </Plegable>

      <Plegable
        titulo="Empaquetado"
        resumen={
          empaque.length ? (
            <>
              {tandasDe(empaque)} · {m2Empaque !== null && `${m2(m2Empaque)} · `}
              <span className={rotura ? "text-red-700" : ""}>rotura {porcentaje(rotura)}</span>
            </>
          ) : (
            "Sin empaquetados"
          )
        }
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
      </Plegable>
    </Pantalla>
  );
}

const tandasDe = (filas: { tandas: number }[]) => {
  const n = filas.reduce((a, f) => a + f.tandas, 0);
  return `${numero(n)} tanda${n === 1 ? "" : "s"}`;
};

/** ▾ que gira al abrir. */
function Flechita() {
  return (
    <span
      aria-hidden
      className="shrink-0 text-xl leading-none text-slate-400 transition-transform group-open:rotate-180"
    >
      ▾
    </span>
  );
}

/**
 * Seccion que se pliega con un toque en el titulo. `<details>` nativo: anda sin
 * JavaScript y el navegador recuerda si quedo abierta mientras se cambia de
 * periodo. Plegada muestra el resumen, para leer todo de un vistazo.
 */
function Plegable({
  titulo,
  resumen,
  ayuda,
  children,
}: {
  titulo: string;
  resumen: React.ReactNode;
  ayuda: string;
  children: React.ReactNode;
}) {
  return (
    <details open className={`${PLEGABLE} mb-3`}>
      <summary className={RESUMEN}>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{titulo}</div>
          <div className="cifra text-sm text-slate-600">{resumen}</div>
        </div>
        <Flechita />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3">
        <p className="text-sm text-slate-600">{ayuda}</p>
        {children}
      </div>
    </details>
  );
}

const PLEGABLE = "group rounded-xl bg-slate-50 shadow-sm ring-1 ring-slate-200";
const RESUMEN =
  "flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl bg-white px-4 py-2 select-none group-open:rounded-b-none [&::-webkit-details-marker]:hidden";
const FLECHA =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";
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
      <TarjetaMovil
        modelo={modelo}
        total={
          <span className="text-lg font-bold">{numero(filas.reduce((a, f) => a + f.moldes, 0))} moldes</span>
        }
        bajada={m2Texto(sumaM2(filas.map((f) => f.m2)))}
        filas={filas.map((f) => ({
          f,
          detalle: `${cantidadSalida(f.esperados, f.unidad, numero)} ${concordar("esperado", f.unidad, f.esperados)}`,
          valor: <span className="font-bold">{numero(f.moldes)} moldes</span>,
          m2: f.m2,
        }))}
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
              <th className={`${TH} text-right`}>Empaquetado</th>
              <th className={`${TH} text-right`}>Rotos</th>
              <th className={`${TH} text-right`}>m² esperados</th>
              <th className={`${TH} text-right`}>m² empaquetados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => {
              const rotos = f.esperados - f.obtenidos;
              return (
                <tr key={`${f.productoId}-${f.unidad}`}>
                  <Producto f={f} />
                  <td className={NUM}>{numero(f.tandas)}</td>
                  <td className={NUM}>{cantidadSalida(f.esperados, f.unidad, numero)}</td>
                  <td className={`${NUM} font-semibold`}>{cantidadSalida(f.obtenidos, f.unidad, numero)}</td>
                  <td className={`${NUM} ${rotos ? "font-semibold text-red-700" : "text-slate-400"}`}>
                    {numero(rotos)}
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
                <td className={`${NUM} text-red-700`}>
                  {textoPorUnidad(porUnidad(filas, (f) => f.esperados - f.obtenidos))}
                </td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2)))}</td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2Obtenidos)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TarjetaMovil
        modelo={modelo}
        total={
          <span className="flex flex-col items-end text-lg">
            {[...porUnidad(filas, (f) => f.esperados)].map(([u, esp]) => (
              <Ecuacion
                key={u}
                esperados={esp}
                empaquetados={porUnidad(filas, (f) => f.obtenidos).get(u) ?? 0}
                unidad={u}
                conUnidad={porUnidad(filas, (f) => f.esperados).size > 1}
              />
            ))}
          </span>
        }
        bajada={m2Texto(sumaM2(filas.map((f) => f.m2Obtenidos)), "empaquetados")}
        filas={filas.map((f) => ({
          f,
          detalle: UNIDAD_SALIDA[f.unidad].varios,
          valor: <Ecuacion esperados={f.esperados} empaquetados={f.obtenidos} unidad={f.unidad} />,
          m2: f.m2Obtenidos,
        }))}
      />
    </>
  );
}

const m2Texto = (n: number | null, que = "") => (n === null ? undefined : `${m2(n)}${que ? ` ${que}` : ""}`);

/**
 * "70 = 67 + 3 rotos": lo que tendria que haber salido, igual a lo empaquetado
 * mas lo roto. Mismo formato que la app de secaderos, para que se lean igual.
 */
function Ecuacion({
  esperados,
  empaquetados,
  unidad,
  conUnidad,
}: {
  esperados: number;
  empaquetados: number;
  unidad: UnidadSalida;
  /** Solo hace falta cuando un mismo modelo mezcla unidades. */
  conUnidad?: boolean;
}) {
  const rotos = esperados - empaquetados;
  return (
    <span className="cifra whitespace-nowrap">
      <span className="font-bold text-slate-900">{numero(esperados)}</span>
      <span className="text-slate-400"> = </span>
      <span className="text-slate-800">{numero(empaquetados)}</span>
      <span className="text-slate-400"> + </span>
      <span className={rotos ? "font-bold text-red-700" : "text-slate-400"}>{numero(rotos)}</span>{" "}
      <span className={`text-[0.8em] ${rotos ? "text-red-700" : "text-slate-400"}`}>
        {concordar("roto", unidad, rotos)}
      </span>
      {conUnidad && <span className="text-[0.8em] text-slate-500"> {UNIDAD_SALIDA[unidad].corto}</span>}
    </span>
  );
}

/**
 * En el celular la tabla no entra. Misma diagramacion que la app de secaderos:
 * el modelo con su total a la derecha, y una fila por producto alternando fondo.
 */
function TarjetaMovil({
  modelo,
  total,
  bajada,
  filas,
}: {
  modelo: string;
  total: React.ReactNode;
  bajada?: string;
  filas: { f: FilaLlenado; detalle: string; valor: React.ReactNode; m2: string | null }[];
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-bold text-slate-900">{modelo}</div>
        <div className="text-right">{total}</div>
      </div>
      {bajada && <div className="cifra mb-2 text-sm text-slate-500">{bajada}</div>}
      <ul className="mt-2 space-y-1">
        {filas.map(({ f, detalle, valor, m2: superficie }, i) => (
          <li
            key={`${f.productoId}-${f.unidad}`}
            className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 ${i % 2 === 0 ? "bg-slate-50" : ""}`}
          >
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{f.producto}</div>
              <div className="cifra text-xs text-slate-500">
                {detalle}
                {f.codigo && <> · <span className="whitespace-nowrap">{f.codigo}</span></>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div>{valor}</div>
              <div className="cifra text-xs text-slate-500">{m2(superficie)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
