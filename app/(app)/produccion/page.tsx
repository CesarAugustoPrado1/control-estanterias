import { requerirRol } from "@/lib/auth";
import type { UnidadSalida } from "@/lib/db/schema";
import { cantidadSalida, concordar, UNIDAD_SALIDA } from "@/lib/estados";
import { m2, numero, porcentaje } from "@/lib/formato";
import {
  empaquePorProducto,
  llenadoPorProducto,
  porUnidad,
  resolverPeriodo,
  sumaM2,
  type FilaEmpaque,
  type FilaLlenado,
} from "@/lib/produccion";
import { lavadosDelPeriodo } from "@/lib/lavados";
import { Plegable, SelectorPeriodo } from "@/components/plegable";
import { Pantalla, Vacio } from "@/components/ui";

export const metadata = { title: "Producción · Control de Estanterías" };
export const dynamic = "force-dynamic";

/** Un total por unidad, uno debajo del otro: sumar paquetes con unidades no dice nada. */
function PorUnidad({ m }: { m: Map<UnidadSalida, number> }) {
  if (!m.size) return <>—</>;
  return (
    <>
      {[...m].map(([u, n]) => (
        <div key={u}>{cantidadSalida(n, u, numero)}</div>
      ))}
    </>
  );
}

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
  const [llenado, empaque, lavados] = await Promise.all([
    llenadoPorProducto(desde, hasta),
    empaquePorProducto(desde, hasta),
    lavadosDelPeriodo({ desde, hasta }),
  ]);

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
      <SelectorPeriodo
        ruta="/produccion"
        periodo={{ desde, hasta }}
        eligiendo={eligiendo}
        nota={porDefecto ? "Último día con producción" : undefined}
        extras={[
          { texto: "Día productivo anterior", url: "/produccion?periodo=anterior", activo: porDefecto },
        ]}
      />

      <Plegable
        titulo="Llenado en el trompo"
        resumen={
          <>
            {llenado.length
              ? `${tandasDe(llenado)} · ${numero(moldes)} moldes${m2Llenado === null ? "" : ` · ${m2(m2Llenado)}`}`
              : "Sin llenados"}
            {lavados.dias > 0 && (
              <div>
                Lavados extra del trompo: <strong>{lavados.total}</strong>
                {desde !== hasta && ` (${lavados.dias} ${lavados.dias === 1 ? "día cargado" : "días cargados"})`}
              </div>
            )}
          </>
        }
        ayuda="Producto en proceso: lo que se llenó en el período, por fecha de llenado. La salida y los m² son lo que debería salir de esos moldes. Los lavados extra del trompo no cuentan el lavado de fin del día."
      >
        {llenado.length === 0 ? (
          <Vacio>No se llenó nada en este período.</Vacio>
        ) : (
          <TablaLlenado filas={llenado} />
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
          <TablaEmpaque filas={empaque} />
        )}
      </Plegable>
    </Pantalla>
  );
}

const tandasDe = (filas: { tandas: number }[]) => {
  const n = filas.reduce((a, f) => a + f.tandas, 0);
  return `${numero(n)} maquinada${n === 1 ? "" : "s"}`;
};

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

function TablaLlenado({ filas }: { filas: FilaLlenado[] }) {
  return (
    <>
      <div className={`${CAJA_TABLA} hidden sm:block`}>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={`${TH} min-w-48`}>Producto</th>
              <th className={`${TH} text-right`}>Maquinadas</th>
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
                <td className={TD}>Total</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.tandas, 0))}</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.moldes, 0))}</td>
                <td className={NUM}>
                  <PorUnidad m={porUnidad(filas, (f) => f.esperados)} />
                </td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TarjetaMovil
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

function TablaEmpaque({ filas }: { filas: FilaEmpaque[] }) {
  return (
    <>
      <div className={`${CAJA_TABLA} hidden sm:block`}>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={`${TH} min-w-48`}>Producto</th>
              <th className={`${TH} text-right`}>Maquinadas</th>
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
                <td className={TD}>Total</td>
                <td className={NUM}>{numero(filas.reduce((a, f) => a + f.tandas, 0))}</td>
                <td className={NUM}>
                  <PorUnidad m={porUnidad(filas, (f) => f.esperados)} />
                </td>
                <td className={NUM}>
                  <PorUnidad m={porUnidad(filas, (f) => f.obtenidos)} />
                </td>
                <td className={`${NUM} text-red-700`}>
                  <PorUnidad m={porUnidad(filas, (f) => f.esperados - f.obtenidos)} />
                </td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2)))}</td>
                <td className={NUM}>{m2(sumaM2(filas.map((f) => f.m2Obtenidos)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TarjetaMovil
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
  /** Solo hace falta cuando el total mezcla unidades. */
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
 * el total arriba a la derecha, y una fila por producto alternando fondo.
 */
function TarjetaMovil({
  total,
  bajada,
  filas,
}: {
  total: React.ReactNode;
  bajada?: string;
  filas: { f: FilaLlenado; detalle: string; valor: React.ReactNode; m2: string | null }[];
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-bold text-slate-900">Total</div>
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
                {f.codigo && (
                  <>
                    {" "}
                    · <span className="whitespace-nowrap">{f.codigo}</span>
                  </>
                )}
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
