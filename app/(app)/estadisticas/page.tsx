import { requerirRol } from "@/lib/auth";
import {
  costoDeReasignaciones,
  efectoDeLaDevolucion,
  fraguadoNaturalPorMotivo,
  moldesSinLlenar,
  produccionDiaria,
  roturaGeneral,
  roturaPorArido,
  roturaPorCemento,
  roturaPorDesmoldador,
  roturaPorMaquinista,
  roturaPorProducto,
  roturaPorTrompo,
  roturaSegunHorno,
  TANDAS_DESPUES_DE_REASIGNAR,
  tiempoDeHorno,
  tiemposPorEtapa,
  type FilaRotura,
} from "@/lib/estadisticas";
import { cantidadSalida, ETIQUETA_MOTIVO_FRAGUADO, QUE_MIDE_LA_DURACION } from "@/lib/estados";
import { numero, porcentaje, soloFecha } from "@/lib/formato";
import { atajosComunes, leerPeriodo } from "@/lib/periodo";
import type { MotivoFraguado, TipoMovimiento } from "@/lib/db/schema";
import { SelectorPeriodo } from "@/components/plegable";
import { secuencia } from "@/lib/escala";
import { Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";

export const metadata = { title: "Estadísticas · Control de Estanterías" };
export const dynamic = "force-dynamic";

/** Rojo desde 4 %, ambar desde 2 %: los mismos cortes en toda la pantalla. */
const colorRotura = (pct: number | null) =>
  pct !== null && pct >= 4 ? "text-red-700" : pct !== null && pct >= 2 ? "text-amber-700" : "text-slate-700";

/**
 * Tres columnas para que entre en el celular y en la grilla de a dos: el
 * nombre (con sus maquinadas), "esperado = empaquetado + rotos" como en
 * Produccion, y el porcentaje, que es lo que se mira.
 */
function TablaRotura({ filas, encabezado }: { filas: FilaRotura[]; encabezado: string }) {
  if (!filas.length) return <Vacio>Sin datos en este período.</Vacio>;
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">{encabezado}</th>
            <th className="px-3 py-2 text-right font-medium">Esperado = empaquetado + rotos</th>
            <th className="px-3 py-2 text-right font-medium">Rotura</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f, i) => {
            const pct = f.pct === null ? null : Number(f.pct);
            const rotos = f.esperados - f.reales;
            return (
              <tr key={`${f.clave}-${i}`} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{f.clave ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {numero(f.tandas)} maquinada{f.tandas === 1 ? "" : "s"}
                  </div>
                </td>
                <td className="cifra whitespace-nowrap px-3 py-2 text-right text-slate-600">
                  {numero(f.esperados)}
                  <span className="text-slate-400"> = </span>
                  {numero(f.reales)}
                  <span className="text-slate-400"> + </span>
                  <span className={rotos ? "font-semibold text-red-700" : "text-slate-400"}>
                    {numero(rotos)}
                  </span>
                </td>
                <td
                  className={`cifra whitespace-nowrap px-3 py-2 text-right text-base font-bold ${colorRotura(pct)}`}
                >
                  {porcentaje(pct, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Estadisticas({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await requerirRol("oficina", "auditor");
  const params = await searchParams;
  // Sin fechas en la URL: los ultimos 30 dias, como antes. Recien entrado el
  // selector se muestra abierto; una vez elegido, se pliega.
  const periodo = leerPeriodo(params) ?? atajosComunes().find((a) => a.texto === "Últimos 30 días")!.periodo;
  const eligiendo = !params.desde && !params.hasta;

  const [
    general,
    etapas,
    horno,
    devolucion,
    porProducto,
    porTrompo,
    porMaquinista,
    porDesmoldador,
    segunHorno,
    fraguado,
    sinLlenar,
    diaria,
    porCemento,
    porArido,
    reasignaciones,
  ] = await Promise.all([
    roturaGeneral(periodo),
    tiemposPorEtapa(periodo),
    tiempoDeHorno(periodo),
    efectoDeLaDevolucion(periodo),
    roturaPorProducto(periodo),
    roturaPorTrompo(periodo),
    roturaPorMaquinista(periodo),
    roturaPorDesmoldador(periodo),
    roturaSegunHorno(periodo),
    fraguadoNaturalPorMotivo(periodo),
    moldesSinLlenar(periodo),
    produccionDiaria(periodo),
    roturaPorCemento(periodo),
    roturaPorArido(periodo),
    costoDeReasignaciones(),
  ]);

  const conDevolucion = devolucion.find((d) => d.volvio);
  const sinDevolucion = devolucion.find((d) => !d.volvio);
  const totalM2 = diaria.reduce((a, d) => a + Number(d.m2 ?? 0), 0);
  const salida = (["paquete", "unidad", "nivel"] as const)
    .map((u) => {
      const col = u === "paquete" ? "en_paquetes" : u === "unidad" ? "en_unidades" : "en_niveles";
      return { u, n: diaria.reduce((a, d) => a + Number(d[col] ?? 0), 0) };
    })
    .filter((x) => x.n > 0);
  const maxM2 = Math.max(1, ...diaria.map((d) => Number(d.m2 ?? 0)));
  const perdidoPorHorno = fraguado.find((f) => f.motivo === "horno_lleno");
  const pctGeneral = general?.pct == null ? null : Number(general.pct);
  const rotos = general?.tandas ? general.esperados - general.reales : 0;

  // Colores de las secciones, de frio (arriba) a calido (abajo): lib/escala.ts.
  const tono = secuencia(15);

  return (
    <Pantalla titulo="Estadísticas">
      <SelectorPeriodo ruta="/estadisticas" periodo={periodo} eligiendo={eligiendo} tono={tono()} />

      <Seccion tono={tono()} titulo="Resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tarjeta
            className={`col-span-2 lg:col-span-1 ${pctGeneral !== null && pctGeneral >= 4 ? "ring-red-300" : ""}`}
          >
            <div className="text-sm text-slate-600">Rotura</div>
            <div className={`cifra mt-1 text-2xl font-bold ${colorRotura(pctGeneral)}`}>
              {porcentaje(pctGeneral, 2)}
            </div>
            <div className="text-xs text-slate-500">
              {general?.tandas
                ? `${numero(rotos)} ${rotos === 1 ? "roto" : "rotos"} de ${numero(general.esperados)}${general.m2 ? ` · ${numero(Number(general.m2), 1)} m²` : ""}`
                : "sin empaquetados"}
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Producción</div>
            <div className="cifra mt-1 text-2xl font-bold">{numero(totalM2, 1)} m²</div>
            <div className="text-xs text-slate-500">
              {salida.length
                ? salida.map((x) => cantidadSalida(x.n, x.u, numero)).join(" · ")
                : "sin conteos"}
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Horno real</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {sinDevolucion ? `${sinDevolucion.prom} h` : "—"}
            </div>
            <div className="text-xs text-slate-500">promedio por ciclo</div>
          </Tarjeta>
          <Tarjeta className={perdidoPorHorno ? "ring-amber-300" : ""}>
            <div className="text-sm text-slate-600">Perdido por horno lleno</div>
            <div className="cifra mt-1 text-2xl font-bold text-amber-700">
              {perdidoPorHorno ? `${numero(Number(perdidoPorHorno.m2), 1)} m²` : "0 m²"}
            </div>
            <div className="text-xs text-slate-500">
              {perdidoPorHorno?.tandas ?? 0} maquinadas fuera del horno
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Moldes sin llenar</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {porcentaje(sinLlenar?.pct === null ? null : Number(sinLlenar?.pct), 2)}
            </div>
            <div className="text-xs text-slate-500">
              {numero(sinLlenar?.faltantes ?? 0)} moldes · {numero(Number(sinLlenar?.m2 ?? 0), 1)} m²
            </div>
          </Tarjeta>
        </div>
      </Seccion>

      <h2 className="mb-1 mt-8 text-xl font-bold text-slate-900">Rotura</h2>
      <p className="mb-4 text-sm text-slate-600">
        Lo que se llenó contra lo que se contó en empaque. Nadie la carga: sale sola. Cuenta por fecha de
        empaquetado, igual que la pantalla de Producción.
      </p>

      <Seccion tono={tono()} titulo="Por producto">
        <TablaRotura filas={porProducto} encabezado="Producto" />
      </Seccion>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Seccion tono={tono()} titulo="Por maquinista">
          <TablaRotura filas={porMaquinista} encabezado="Maquinista" />
        </Seccion>
        <Seccion tono={tono()}
          titulo="Por desmoldador"
          ayuda="El grueso de la rotura pasa en el desmolde. El empaque no la genera: solo la evidencia."
        >
          <TablaRotura filas={porDesmoldador} encabezado="Desmoldador" />
        </Seccion>
        <Seccion tono={tono()} titulo="Por trompo">
          <TablaRotura filas={porTrompo} encabezado="Trompo" />
        </Seccion>
        <Seccion tono={tono()} titulo="Con horno y sin horno">
          <TablaRotura filas={segunHorno} encabezado="Camino" />
        </Seccion>
        <Seccion tono={tono()} titulo="Por cemento">
          <TablaRotura filas={porCemento} encabezado="Cemento" />
        </Seccion>
        <Seccion tono={tono()} titulo="Por árido">
          <TablaRotura filas={porArido} encabezado="Árido" />
        </Seccion>
      </div>

      <h2 className="mb-4 mt-8 text-xl font-bold text-slate-900">Producción y tiempos</h2>

      <Seccion tono={tono()}
        titulo="Producción diaria"
        ayuda="Lo empaquetado cada día del período, por fecha de empaquetado."
      >
        {diaria.length === 0 ? (
          <Vacio>Sin maquinadas empaquetadas en este período.</Vacio>
        ) : (
          <Tarjeta>
            <ul className="space-y-1.5">
              {diaria.map((d) => {
                const v = Number(d.m2 ?? 0);
                return (
                  <li key={d.dia} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-slate-600">{soloFecha(d.dia)}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <span
                        className="block h-full rounded bg-emerald-500"
                        style={{ width: `${(v / maxM2) * 100}%` }}
                      />
                    </span>
                    <span className="cifra w-24 shrink-0 text-right font-semibold">{numero(v, 1)} m²</span>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )}
      </Seccion>

      <Seccion tono={tono()}
        titulo="Tiempo por etapa"
        ayuda="Cada movimiento mide cuánto duró el estado anterior. Donde el promedio es alto es donde se hace la cola."
      >
        {etapas.length === 0 ? (
          <Vacio>Sin movimientos en este período.</Vacio>
        ) : (
          <Tarjeta className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Mide</th>
                  <th className="px-4 py-2 text-right font-medium">Casos</th>
                  <th className="px-4 py-2 text-right font-medium">Promedio</th>
                  <th className="px-4 py-2 text-right font-medium">Mediana</th>
                  <th className="px-4 py-2 text-right font-medium">Máximo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {etapas.map((e) => (
                  <tr key={e.tipo}>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {QUE_MIDE_LA_DURACION[e.tipo as TipoMovimiento] ?? e.tipo}
                    </td>
                    <td className="cifra px-4 py-2 text-right">{e.n}</td>
                    <td className="cifra px-4 py-2 text-right font-semibold">{e.prom} h</td>
                    <td className="cifra px-4 py-2 text-right text-slate-600">{e.mediana} h</td>
                    <td className="cifra px-4 py-2 text-right text-slate-600">{e.maximo} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </Seccion>

      {conDevolucion && sinDevolucion && (
        <Seccion tono={tono()} titulo="Cuánto hay que hornear de verdad">
          <Tarjeta>
            <p className="text-sm text-slate-700">
              Las maquinadas que <strong>no</strong> necesitaron devolución estuvieron{" "}
              <strong className="cifra">{sinDevolucion.prom} h</strong> en el horno ({sinDevolucion.n}{" "}
              ciclos). Las que <strong>sí</strong> necesitaron volver habían estado{" "}
              <strong className="cifra">{conDevolucion.prom} h</strong> ({conDevolucion.n} ciclos).
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esa diferencia es el tiempo mínimo real de horno: <strong>medido, no estimado</strong>. Por
              debajo de ese número, la maquinada vuelve.
            </p>
          </Tarjeta>
        </Seccion>
      )}

      <Seccion tono={tono()} titulo="Tiempo de horno por producto">
        {horno.length === 0 ? (
          <Vacio>Sin ciclos de horno en este período.</Vacio>
        ) : (
          <Tarjeta className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 text-right font-medium">Ciclos</th>
                  <th className="px-4 py-2 text-right font-medium">Promedio</th>
                  <th className="px-4 py-2 text-right font-medium">Rango</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {horno.map((h) => (
                  <tr key={h.producto}>
                    <td className="px-4 py-2 font-medium text-slate-800">{h.producto}</td>
                    <td className="cifra px-4 py-2 text-right">{h.ciclos}</td>
                    <td className="cifra px-4 py-2 text-right font-semibold">{h.prom} h</td>
                    <td className="cifra px-4 py-2 text-right text-slate-600">
                      {h.minimo} – {h.maximo} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </Seccion>

      <Seccion tono={tono()}
        titulo="Fraguado natural"
        ayuda="Por horno lleno es capacidad perdida; por clima es ahorro. Son opuestos y por eso van separados."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(["horno_lleno", "clima", "otro"] as MotivoFraguado[]).map((m) => {
            const f = fraguado.find((x) => x.motivo === m);
            return (
              <Tarjeta key={m} className={m === "horno_lleno" ? "ring-amber-300" : ""}>
                <div className="text-sm font-medium text-slate-700">{ETIQUETA_MOTIVO_FRAGUADO[m]}</div>
                <div className="cifra mt-1 text-2xl font-bold text-slate-900">
                  {numero(Number(f?.m2 ?? 0), 1)} m²
                </div>
                <div className="text-xs text-slate-500">{f?.tandas ?? 0} maquinadas</div>
              </Tarjeta>
            );
          })}
        </div>
      </Seccion>

      <Seccion tono={tono()}
        titulo="Costo de las reasignaciones"
        cantidad={reasignaciones.length}
        ayuda={`Cuando una estantería cambia de familia o de cemento, las primeras maquinadas salen manchadas. Acá se mide cuánto: la rotura de las primeras ${TANDAS_DESPUES_DE_REASIGNAR} maquinadas contadas después del cambio contra la habitual de ese modelo, familia y cemento. No depende del período elegido arriba: mira siempre las primeras maquinadas después de cada cambio.`}
      >
        {reasignaciones.length === 0 ? (
          <Vacio>No hubo reasignaciones.</Vacio>
        ) : (
          <Tarjeta className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Cambio</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 text-right font-medium">Maquinadas medidas</th>
                  <th className="px-4 py-2 text-right font-medium">Rotura después</th>
                  <th className="px-4 py-2 text-right font-medium">Habitual</th>
                  <th className="px-4 py-2 text-right font-medium">m² perdidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reasignaciones.map((r) => {
                  const pct = r.pct === null ? null : Number(r.pct);
                  const habitual = r.pct_habitual === null ? null : Number(r.pct_habitual);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-800">{r.etiqueta_despues}</div>
                        <div className="text-xs text-slate-500">
                          {r.familia_antes} · cemento {r.cemento_antes} → {r.familia_despues} · cemento{" "}
                          {r.cemento_despues} · {soloFecha(r.creado_en)} · {r.usuario_nombre}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{r.motivo}</td>
                      <td className="cifra px-4 py-2 text-right">
                        {r.tandas} de {TANDAS_DESPUES_DE_REASIGNAR}
                      </td>
                      <td
                        className={`cifra px-4 py-2 text-right font-semibold ${
                          pct !== null && habitual !== null && pct > habitual ? "text-red-700" : ""
                        }`}
                      >
                        {porcentaje(pct, 2)}
                      </td>
                      <td className="cifra px-4 py-2 text-right text-slate-600">{porcentaje(habitual, 2)}</td>
                      <td className="cifra px-4 py-2 text-right">
                        {r.m2_perdidos ? numero(Number(r.m2_perdidos), 1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </Seccion>
    </Pantalla>
  );
}
