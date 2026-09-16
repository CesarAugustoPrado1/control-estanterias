import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import {
  RANGOS,
  efectoDeLaDevolucion,
  fraguadoNaturalPorMotivo,
  moldesSinLlenar,
  produccionDiaria,
  roturaPorProducto,
  roturaPorResponsable,
  roturaPorTrompo,
  roturaSegunHorno,
  roturaPorCemento,
  costoDeReasignaciones,
  TANDAS_DESPUES_DE_REASIGNAR,
  tiempoDeHorno,
  tiemposPorEtapa,
  type Rango,
} from "@/lib/estadisticas";
import { ETIQUETA_MOTIVO_FRAGUADO, QUE_MIDE_LA_DURACION } from "@/lib/estados";
import { numero, porcentaje, soloFecha } from "@/lib/formato";
import type { MotivoFraguado, TipoMovimiento } from "@/lib/db/schema";
import { Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";

export const metadata = { title: "Estadísticas · Control de Estanterías" };
export const dynamic = "force-dynamic";

type FilaRotura = {
  clave: string | null;
  tandas: number;
  esperados: number;
  reales: number;
  pct: string | null;
};

function TablaRotura({
  filas,
  encabezado,
}: {
  filas: FilaRotura[];
  encabezado: string;
}) {
  if (!filas.length) return <Vacio>Sin datos en este período.</Vacio>;
  return (
    <Tarjeta className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-slate-600">
          <tr>
            <th className="px-4 py-2 font-medium">{encabezado}</th>
            <th className="px-4 py-2 text-right font-medium">Tandas</th>
            <th className="px-4 py-2 text-right font-medium">Esperados</th>
            <th className="px-4 py-2 text-right font-medium">Reales</th>
            <th className="px-4 py-2 text-right font-medium">Rotura</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f, i) => {
            const pct = f.pct === null ? null : Number(f.pct);
            return (
              <tr key={`${f.clave}-${i}`}>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {f.clave ?? "—"}
                </td>
                <td className="cifra px-4 py-2 text-right">{f.tandas}</td>
                <td className="cifra px-4 py-2 text-right text-slate-600">
                  {numero(f.esperados)}
                </td>
                <td className="cifra px-4 py-2 text-right text-slate-600">
                  {numero(f.reales)}
                </td>
                <td
                  className={`cifra px-4 py-2 text-right font-semibold ${
                    pct !== null && pct >= 4
                      ? "text-red-700"
                      : pct !== null && pct >= 2
                        ? "text-amber-700"
                        : "text-slate-700"
                  }`}
                >
                  {porcentaje(pct, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Tarjeta>
  );
}

export default async function Estadisticas({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requerirRol("oficina", "auditor");
  const { dias: diasParam } = await searchParams;
  const dias = (RANGOS as readonly number[]).includes(Number(diasParam))
    ? (Number(diasParam) as Rango)
    : 30;

  const [
    etapas,
    horno,
    devolucion,
    porProducto,
    porTrompo,
    porLlenado,
    porDesmolde,
    segunHorno,
    fraguado,
    sinLlenar,
    diaria,
    porCemento,
    reasignaciones,
  ] = await Promise.all([
    tiemposPorEtapa(dias),
    tiempoDeHorno(dias),
    efectoDeLaDevolucion(dias),
    roturaPorProducto(dias),
    roturaPorTrompo(dias),
    roturaPorResponsable(dias, "llenado"),
    roturaPorResponsable(dias, "desmolde"),
    roturaSegunHorno(dias),
    fraguadoNaturalPorMotivo(dias),
    moldesSinLlenar(dias),
    produccionDiaria(dias),
    roturaPorCemento(dias),
    costoDeReasignaciones(),
  ]);

  const conDevolucion = devolucion.find((d) => d.volvio);
  const sinDevolucion = devolucion.find((d) => !d.volvio);
  const totalM2 = diaria.reduce((a, d) => a + Number(d.m2 ?? 0), 0);
  const totalPaq = diaria.reduce((a, d) => a + Number(d.paquetes ?? 0), 0);
  const maxM2 = Math.max(1, ...diaria.map((d) => Number(d.m2 ?? 0)));
  const perdidoPorHorno = fraguado.find((f) => f.motivo === "horno_lleno");

  return (
    <Pantalla
      titulo="Estadísticas"
      bajada={`Últimos ${dias} días`}
      acciones={
        <div className="flex flex-wrap gap-1">
          {RANGOS.map((r) => (
            <Link
              key={r}
              href={`/estadisticas?dias=${r}`}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                r === dias
                  ? "bg-blue-700 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              {r === 365 ? "1 año" : `${r} d`}
            </Link>
          ))}
        </div>
      }
    >
      <Seccion titulo="Resumen">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta>
            <div className="text-sm text-slate-600">Producción</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {numero(totalM2, 1)} m²
            </div>
            <div className="text-xs text-slate-500">
              {numero(totalPaq)} paquetes
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
              {perdidoPorHorno?.tandas ?? 0} tandas fuera del horno
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Moldes sin llenar</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {porcentaje(sinLlenar?.pct === null ? null : Number(sinLlenar?.pct), 2)}
            </div>
            <div className="text-xs text-slate-500">
              {numero(sinLlenar?.faltantes ?? 0)} moldes ·{" "}
              {numero(Number(sinLlenar?.m2 ?? 0), 1)} m²
            </div>
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion
        titulo="Tiempo por etapa"
        ayuda="Cada movimiento mide cuánto duró el estado anterior. Donde el promedio es alto es donde se hace la cola."
      >
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
                  <td className="cifra px-4 py-2 text-right font-semibold">
                    {e.prom} h
                  </td>
                  <td className="cifra px-4 py-2 text-right text-slate-600">
                    {e.mediana} h
                  </td>
                  <td className="cifra px-4 py-2 text-right text-slate-600">
                    {e.maximo} h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      </Seccion>

      {conDevolucion && sinDevolucion && (
        <Seccion titulo="Cuánto hay que hornear de verdad">
          <Tarjeta>
            <p className="text-sm text-slate-700">
              Las tandas que <strong>no</strong> necesitaron devolución estuvieron{" "}
              <strong className="cifra">{sinDevolucion.prom} h</strong> en el horno
              ({sinDevolucion.n} ciclos). Las que{" "}
              <strong>sí</strong> necesitaron volver habían estado{" "}
              <strong className="cifra">{conDevolucion.prom} h</strong> (
              {conDevolucion.n} ciclos).
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esa diferencia es el tiempo mínimo real de horno:{" "}
              <strong>medido, no estimado</strong>. Por debajo de ese número, la
              tanda vuelve.
            </p>
          </Tarjeta>
        </Seccion>
      )}

      <Seccion titulo="Tiempo de horno por producto">
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
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {h.producto}
                    </td>
                    <td className="cifra px-4 py-2 text-right">{h.ciclos}</td>
                    <td className="cifra px-4 py-2 text-right font-semibold">
                      {h.prom} h
                    </td>
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

      <Seccion
        titulo="Fraguado natural"
        ayuda="Por horno lleno es capacidad perdida; por clima es ahorro. Son opuestos y por eso van separados."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(["horno_lleno", "clima", "otro"] as MotivoFraguado[]).map((m) => {
            const f = fraguado.find((x) => x.motivo === m);
            return (
              <Tarjeta key={m} className={m === "horno_lleno" ? "ring-amber-300" : ""}>
                <div className="text-sm font-medium text-slate-700">
                  {ETIQUETA_MOTIVO_FRAGUADO[m]}
                </div>
                <div className="cifra mt-1 text-2xl font-bold text-slate-900">
                  {numero(Number(f?.m2 ?? 0), 1)} m²
                </div>
                <div className="text-xs text-slate-500">
                  {f?.tandas ?? 0} tandas
                </div>
              </Tarjeta>
            );
          })}
        </div>
      </Seccion>

      <Seccion
        titulo="Rotura por producto"
        ayuda="Se calcula como la diferencia entre lo que se llenó y lo que se contó en empaque. Nadie la carga."
      >
        <TablaRotura filas={porProducto} encabezado="Producto" />
      </Seccion>

      <Seccion titulo="Rotura con horno y sin horno">
        <TablaRotura filas={segunHorno} encabezado="Camino" />
      </Seccion>

      <Seccion titulo="Rotura por cemento">
        <TablaRotura filas={porCemento} encabezado="Cemento" />
      </Seccion>

      <Seccion
        titulo="Costo de las reasignaciones"
        cantidad={reasignaciones.length}
        ayuda={`Cuando una estantería cambia de familia o de cemento, las primeras tandas salen manchadas. Acá se mide cuánto: la rotura de las primeras ${TANDAS_DESPUES_DE_REASIGNAR} tandas contadas después del cambio contra la habitual de ese modelo, familia y cemento. No depende del rango de días elegido arriba.`}
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
                  <th className="px-4 py-2 text-right font-medium">Tandas medidas</th>
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
                          {r.cemento_despues} ·{" "}
                          {soloFecha(r.creado_en)} · {r.usuario_nombre}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Rotura por trompo">
          <TablaRotura filas={porTrompo} encabezado="Trompo" />
        </Seccion>
        <Seccion titulo="Rotura por responsable del llenado">
          <TablaRotura filas={porLlenado} encabezado="Quién llenó" />
        </Seccion>
      </div>

      <Seccion
        titulo="Rotura por quién desmoldó"
        ayuda="El grueso de la rotura pasa en el desmolde. El empaque no la genera: solo la evidencia, así que nunca se le atribuye a quien contó."
      >
        <TablaRotura filas={porDesmolde} encabezado="Quién desmoldó" />
      </Seccion>

      <Seccion titulo="Producción diaria">
        {diaria.length === 0 ? (
          <Vacio>Sin tandas terminadas en este período.</Vacio>
        ) : (
          <Tarjeta>
            <ul className="space-y-1.5">
              {diaria.map((d) => {
                const v = Number(d.m2 ?? 0);
                return (
                  <li key={d.dia} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 text-slate-600">
                      {soloFecha(d.dia)}
                    </span>
                    <span className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <span
                        className="block h-full rounded bg-emerald-500"
                        style={{ width: `${(v / maxM2) * 100}%` }}
                      />
                    </span>
                    <span className="cifra w-24 shrink-0 text-right font-semibold">
                      {numero(v, 1)} m²
                    </span>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )}
      </Seccion>
    </Pantalla>
  );
}
