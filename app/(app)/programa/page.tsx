import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { fechaHora, porcentaje } from "@/lib/formato";
import { FORMATO_DIA, hoy, nombrePeriodo, sumarDias } from "@/lib/periodo";
import { MARGEN_DESMOLDE, topeDesmolde } from "@/lib/reglas";
import {
  cumplimiento,
  historialCerrados,
  leerCalendario,
  leerDia,
  advertenciasDesmolde,
  cargaDesmolde,
  cargaLlenado,
  leerTromposFuera,
  disponibilidadDesmolde,
  listarMotivosIncumplimiento,
  metasSugeridas,
  productosParaProgramar,
  type LineaConAvance,
} from "@/lib/programa";
import type { SeccionPrograma } from "@/lib/db/schema";
import { lavadosDelDia } from "@/lib/lavados";
import { esHabil, motivoDia } from "@/lib/calendario";
import { ListaPrograma } from "@/components/programa";
import { clasesCaja, Flechita, Plegable } from "@/components/plegable";
import { tonos } from "@/lib/escala";
import { Pantalla, Seccion } from "@/components/ui";
import { AccionesDia, AgregarLinea, LavadosPrevistos, MetaSeccion } from "./acciones";
import { trompoPorDefecto } from "@/lib/acciones/motor";
import { disponiblesEn } from "@/lib/lavados-previstos";

export const metadata = { title: "Programa · Control de Estanterías" };
export const dynamic = "force-dynamic";

const TITULO: Record<SeccionPrograma, string> = {
  llenado: "Llenado (trompo)",
  desmolde: "Desmolde y paletizado",
};

/** Colores de las cajas, de frio (arriba) a calido (abajo). Fijos por caja, haya o no las otras. */
const TONO = tonos(["fecha", "estado", "llenado", "desmolde", "historial"] as const);
const CAJA_FECHA = clasesCaja(TONO.fecha);
const CAJA_ESTADO = clasesCaja(TONO.estado);

const FLECHA =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";

/**
 * Lo que se ve con la seccion plegada: hechas contra la meta (si hay) y
 * cuanto del programa se cumplio.
 */
function ResumenSeccion({
  lineas,
  hechas,
  meta,
  terminado,
}: {
  lineas: LineaConAvance[];
  hechas: number;
  meta: number | null;
  terminado: boolean;
}) {
  const c = cumplimiento(lineas);
  if (!c.programadas && meta === null) return <span className="text-slate-500">Nada programado</span>;
  return (
    <span className="flex flex-wrap gap-x-3">
      {meta !== null && (
        <span>
          Meta{" "}
          <strong className={hechas >= meta ? "text-emerald-700" : "text-slate-900"}>
            {hechas}/{meta}
          </strong>{" "}
          <span className={hechas >= meta ? "text-emerald-700" : "text-blue-700"}>
            {Math.round((100 * hechas) / meta)} %
          </span>
        </span>
      )}
      {c.programadas > 0 && (
        <span>
          Programa <Cumplimiento lineas={lineas} terminado={terminado} />
        </span>
      )}
    </span>
  );
}

/**
 * Lo programado contra la meta, al lado del titulo de cada seccion: se ve
 * aunque este plegada. Sin meta no hay contra que comparar.
 */
function EstadoPrograma({ programadas, meta }: { programadas: number; meta: number | null }) {
  if (meta === null) return null;
  const [texto, clase] =
    programadas === meta
      ? ["Programa completo", "bg-emerald-100 text-emerald-800"]
      : programadas < meta
        ? ["Programa incompleto", "bg-red-100 text-red-800"]
        : ["Programa excedido", "bg-amber-100 text-amber-900"];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${clase}`}>
      {texto}
      <span className="cifra font-semibold opacity-80">
        {" "}
        {programadas}/{meta}
      </span>
    </span>
  );
}

/** Mientras el dia no termino, lo que falta no es incumplimiento: va en gris. */
function Cumplimiento({
  lineas,
  grande,
  terminado,
}: {
  lineas: LineaConAvance[];
  grande?: boolean;
  terminado: boolean;
}) {
  const c = cumplimiento(lineas);
  if (!c.programadas) return null;
  const color =
    c.pct === 100
      ? "text-emerald-700"
      : !terminado
        ? "text-slate-700"
        : c.pct !== null && c.pct >= 80
          ? "text-amber-700"
          : "text-red-700";
  return (
    <span className="cifra">
      <span className={`${grande ? "text-2xl" : "text-base"} font-bold ${color}`}>
        {porcentaje(c.pct, 0)}
      </span>
      <span className="text-sm text-slate-500">
        {" "}
        · {c.hechas} de {c.programadas}
      </span>
    </span>
  );
}

export default async function Programa({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sesion = await requerirRol("oficina", "auditor", "trompo", "horno", "desmolde", "empaque");
  // Solo el admin arma el programa; oficina, auditoria y los puestos lo miran.
  // Las acciones vuelven a exigir admin por su cuenta (lib/acciones/programa.ts).
  const editar = sesion.roles.includes("admin");
  const p = await searchParams;
  const h = hoy();
  const dia = p.dia && FORMATO_DIA.test(p.dia) ? p.dia : h;

  // Dias cercanos donde buscar lugar para un llenado (lavados del trompo).
  const ventanaDesde = [h, sumarDias(dia, -10)].sort()[1];
  const ventanaHasta = sumarDias(dia, 10);
  const [programa, motivos, productos, historial, sugeridas, disponible, carga, lavados, cal, llenadosCerca, trompoDefecto, fueraDelDia] = await Promise.all([
    leerDia(dia),
    listarMotivosIncumplimiento(),
    productosParaProgramar(),
    historialCerrados(),
    metasSugeridas(dia),
    disponibilidadDesmolde(dia),
    // Desde el primer dia de la ventana: un llenado se puede pasar a otro dia.
    cargaDesmolde(sumarDias(ventanaDesde < dia ? ventanaDesde : dia, 1)),
    lavadosDelDia(dia),
    leerCalendario(dia, dia),
    cargaLlenado(ventanaDesde < dia ? ventanaDesde : dia, ventanaHasta),
    trompoPorDefecto(),
    leerTromposFuera(dia, dia),
  ]);
  // Trompos que andan ese dia: los calculos de lavados se hacen con esos.
  const trompos = { defecto: trompoDefecto, disponibles: disponiblesEn(dia, fueraDelDia) };
  const motivoDelDia = motivoDia(dia, cal);
  const habilDelDia = esHabil(dia, cal);
  // Tiempo de desmolde: avisos (no bloquean) en las lineas de desmolde, y
  // cuantas quedan listas de cada producto para lo que se agregue.
  const advertencias = advertenciasDesmolde(dia, programa.lineas, disponible);
  const listasParaAgregar: Record<number, number> = {};
  for (const [id, d] of disponible) {
    const yaProgramadas = programa.lineas
      .filter((l) => l.seccion === "desmolde" && l.productoId === id && !l.reprogramadaA)
      .reduce((a, l) => a + l.faltan, 0);
    listasParaAgregar[id] = Math.max(0, d.listas - yaProgramadas);
  }
  const cerrado = programa.cerrado !== null;
  // Un dia pasado ya termino aunque nadie lo haya cerrado: lo que falta, falto.
  const terminado = cerrado || dia < h;
  const sinMotivo = programa.lineas.filter((l) => l.faltan > 0 && !l.motivoNombre && !l.reprogramadaA).length;
  const url = (d: string) => `/programa?dia=${d}`;
  const relativo =
    dia === h ? "Hoy" : dia === sumarDias(h, 1) ? "Mañana" : dia === sumarDias(h, -1) ? "Ayer" : "";
  const estado = cerrado
    ? `Cerrado ${fechaHora(programa.cerrado!.en)}${programa.cerrado!.por ? ` por ${programa.cerrado!.por}` : ""}`
    : terminado
      ? "Terminado, sin cerrar"
      : "En curso";
  // Lo hecho de verdad en cada seccion (programado o no): es lo que cuenta para la meta.
  const hechasDe = (s: SeccionPrograma) =>
    programa.lineas.filter((l) => l.seccion === s).reduce((a, l) => a + l.hechas, 0) +
    programa.fuera.filter((f) => f.seccion === s).reduce((a, f) => a + f.hechas, 0);
  // Regla de diferencia: el desmolde del dia no puede llegar a todo lo que se llena.
  const llenadoProgramado = programa.lineas
    .filter((l) => l.seccion === "llenado")
    .reduce((a, l) => a + l.cantidad, 0);
  const desmoldeProgramado = programa.lineas
    .filter((l) => l.seccion === "desmolde")
    .reduce((a, l) => a + l.cantidad, 0);
  const tope = topeDesmolde(llenadoProgramado);
  const metas = (["llenado", "desmolde"] as const).flatMap((s) => {
    const meta = programa.meta[s];
    return meta === null
      ? []
      : [{ seccion: s, nombre: s === "llenado" ? "llenado" : "desmolde", meta, hechas: hechasDe(s) }];
  });

  return (
    <Pantalla titulo="Programa" bajada="La hoja de producción del día: lo que se pide y lo que se hizo.">
      {/* Dia: plegado queda la barra con las flechas, que andan sin desplegarlo. */}
      <details open className={`${CAJA_FECHA.caja} mb-3`}>
        <summary className={CAJA_FECHA.resumen}>
          <Link href={url(sumarDias(dia, -1))} aria-label="Día anterior" className={FLECHA}>
            ‹
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-lg font-bold text-slate-900">
              {nombrePeriodo({ desde: dia, hasta: dia })}
            </div>
            <div className="text-xs text-slate-500">{relativo}</div>
            {motivoDelDia && (
              <div
                className={`mt-0.5 truncate text-xs font-semibold ${habilDelDia ? "text-emerald-700" : "text-red-700"}`}
              >
                {motivoDelDia}
              </div>
            )}
            {fueraDelDia.map((f) => (
              <div key={f.id} className="mt-0.5 truncate text-xs font-semibold text-red-700">
                Trompo {f.trompo.toUpperCase()} fuera de servicio{f.motivo ? ` · ${f.motivo}` : ""}
              </div>
            ))}
          </div>
          <Link href={url(sumarDias(dia, 1))} aria-label="Día siguiente" className={FLECHA}>
            ›
          </Link>
          <Flechita />
        </summary>
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 p-3">
          {dia !== h && (
            <Link href={url(h)} className={FLECHA}>
              Hoy
            </Link>
          )}
          {dia !== sumarDias(h, 1) && (
            <Link href={url(sumarDias(h, 1))} className={FLECHA}>
              Mañana
            </Link>
          )}
          <form action="/programa" className="flex items-center gap-2">
            <input
              type="date"
              name="dia"
              defaultValue={dia}
              key={dia}
              className="min-h-11 rounded-lg bg-white px-2 text-sm ring-1 ring-slate-300"
            />
            <button type="submit" className={FLECHA}>
              Ir
            </button>
          </form>
        </div>
      </details>

      {/* Estado del dia: plegado queda el resumen; los botones van adentro. */}
      {programa.lineas.length > 0 && (
        <details open className={`${CAJA_ESTADO.caja} mb-4 ${cerrado ? "ring-emerald-300" : ""}`}>
          <summary className={CAJA_ESTADO.resumen}>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-600">
                {estado}
                {lavados && (
                  <>
                    {" · "}Lavados extra del trompo: <strong className="cifra">{lavados.cantidad}</strong>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4">
                <span>
                  <span className="text-sm text-slate-600">Programa </span>
                  <Cumplimiento lineas={programa.lineas} grande terminado={terminado} />
                </span>
                {metas.length > 0 && (
                  <span className="cifra text-sm text-slate-600">
                    Meta{" "}
                    {metas.map((m, k) => (
                      <span key={m.seccion}>
                        {k > 0 && " · "}
                        {m.nombre}{" "}
                        <strong className={m.hechas >= m.meta ? "text-emerald-700" : "text-slate-900"}>
                          {m.hechas}/{m.meta}
                        </strong>{" "}
                        <span className={m.hechas >= m.meta ? "text-emerald-700" : "text-blue-700"}>
                          {Math.round((100 * m.hechas) / m.meta)} %
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <Flechita />
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-3">
            {editar && (
              <AccionesDia
                dia={dia}
                cerrado={cerrado}
                hayLineas={programa.lineas.length > 0}
                sinMotivo={sinMotivo}
                sugerirCopiaDe={sumarDias(dia, -1)}
              />
            )}
            {terminado && sinMotivo > 0 && (
              <p className="text-sm text-red-700">
                {sinMotivo} línea{sinMotivo === 1 ? "" : "s"} sin cumplir y sin motivo: lo informa cada puesto
                desde su pantalla, o cargalo acá.
              </p>
            )}
            {!editar && !(terminado && sinMotivo > 0) && (
              <p className="text-sm text-slate-500">Sin acciones: el programa lo arma el administrador.</p>
            )}
          </div>
        </details>
      )}
      {programa.lineas.length === 0 && editar && (
        <div className="mb-4">
          <AccionesDia
            dia={dia}
            cerrado={false}
            hayLineas={false}
            sinMotivo={0}
            sugerirCopiaDe={sumarDias(dia, -1)}
          />
        </div>
      )}

      {(["llenado", "desmolde"] as const).map((seccion) => {
        const lineas = programa.lineas.filter((l) => l.seccion === seccion);
        const fuera = programa.fuera.filter((f) => f.seccion === seccion);
        const programadas = lineas.reduce((a, l) => a + l.cantidad, 0);
        // Todo lo hecho en la seccion, este o no en el programa: es lo que cuenta para la meta.
        const hechas = hechasDe(seccion);
        const meta = programa.meta[seccion];
        return (
          <Plegable
            key={seccion}
            tono={TONO[seccion]}
            titulo={TITULO[seccion]}
            insignia={<EstadoPrograma programadas={programadas} meta={meta} />}
            resumen={<ResumenSeccion lineas={lineas} hechas={hechas} meta={meta} terminado={terminado} />}
          >
            <MetaSeccion
              dia={dia}
              seccion={seccion}
              meta={meta}
              sugerida={sugeridas[seccion]}
              programadas={programadas}
              hechas={hechas}
              editar={editar}
            />
            {seccion === "llenado" && (
              <LavadosPrevistos
                dia={dia}
                lineas={lineas.map((l) => ({
                  id: l.id,
                  grupoId: l.grupoColorId,
                  grupoColor: l.grupoColor,
                  trompo: l.trompo,
                }))}
                trompos={trompos}
                editar={editar && !cerrado}
              />
            )}
            {seccion === "desmolde" && tope !== null && (
              <p
                className={`mb-3 rounded-lg px-3 py-2 text-sm ring-1 ${
                  desmoldeProgramado > tope
                    ? "bg-amber-50 text-amber-900 ring-amber-200"
                    : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                {desmoldeProgramado > tope && <strong>Ojo: </strong>}
                Llenado del día: {llenadoProgramado} → con {MARGEN_DESMOLDE} de diferencia, el desmolde llega
                hasta <strong className="cifra">{tope}</strong>
                {desmoldeProgramado > tope
                  ? `, y hay ${desmoldeProgramado} programados (${desmoldeProgramado - tope} de más). Mientras se desmolda la primera, el trompo espera.`
                  : ` (programados: ${desmoldeProgramado}).`}
              </p>
            )}
            <ListaPrograma
              lineas={lineas}
              motivos={motivos}
              editar={editar && !cerrado}
              informar={editar}
              terminado={terminado}
              manana={sumarDias(dia, 1)}
              advertencias={seccion === "desmolde" && !cerrado ? advertencias : {}}
              vacio={seccion === "llenado" ? "Sin llenados programados." : "Sin desmoldes programados."}
              trompos={seccion === "llenado" ? trompos : undefined}
            />
            {editar && !cerrado && (
              <AgregarLinea
                dia={dia}
                seccion={seccion}
                productos={productos}
                meta={programa.meta[seccion]}
                programadas={programadas}
                listas={seccion === "desmolde" ? listasParaAgregar : undefined}
                carga={seccion === "llenado" ? carga : undefined}
                llenadoDelDia={llenadoProgramado}
                cargaLlenado={seccion === "llenado" ? llenadosCerca : undefined}
                trompoDefecto={trompoDefecto}
                hoy={h}
              />
            )}
            {fuera.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
                <div className="font-semibold text-amber-900">
                  {seccion === "llenado" ? "Llenadas" : "Desmoldadas"} fuera de programa
                </div>
                <ul className="mt-1 text-amber-900">
                  {fuera.map((f) => (
                    <li key={f.productoId}>
                      <span className="cifra font-bold">{f.hechas}</span> {f.producto}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Plegable>
        );
      })}

      {historial.length > 0 && (
        <Seccion tono={TONO.historial} titulo="Días cerrados" ayuda="Cumplimiento registrado al cerrar cada día.">
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Día</th>
                  <th className="px-3 py-2 text-right font-medium">Llenado</th>
                  <th className="px-3 py-2 text-right font-medium">Desmolde</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historial.map((d) => (
                  <tr key={d.dia}>
                    <td className="px-3 py-2">
                      <Link href={url(d.dia)} className="font-medium text-blue-700 hover:underline">
                        {nombrePeriodo({ desde: d.dia, hasta: d.dia })}
                      </Link>
                    </td>
                    {[d.llenado, d.desmolde, d.total].map((c, i) => (
                      <td key={i} className="cifra whitespace-nowrap px-3 py-2 text-right">
                        {c.programadas ? (
                          <>
                            <span
                              className={`font-semibold ${c.pct === 100 ? "text-emerald-700" : c.pct !== null && c.pct >= 80 ? "text-amber-700" : "text-red-700"}`}
                            >
                              {porcentaje(c.pct, 0)}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {c.hechas}/{c.programadas}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </Pantalla>
  );
}
