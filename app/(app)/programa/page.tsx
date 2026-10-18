import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { fechaHora, porcentaje } from "@/lib/formato";
import { FORMATO_DIA, hoy, nombrePeriodo, sumarDias } from "@/lib/periodo";
import {
  cumplimiento,
  historialCerrados,
  leerDia,
  listarMotivosIncumplimiento,
  metasSugeridas,
  productosParaProgramar,
  type LineaConAvance,
} from "@/lib/programa";
import type { SeccionPrograma } from "@/lib/db/schema";
import { ListaPrograma } from "@/components/programa";
import { Plegable } from "@/components/plegable";
import { Pantalla, Seccion, Tarjeta } from "@/components/ui";
import { AccionesDia, AgregarLinea, MetaSeccion } from "./acciones";

export const metadata = { title: "Programa · Control de Estanterías" };
export const dynamic = "force-dynamic";

const TITULO: Record<SeccionPrograma, string> = {
  llenado: "Llenado (trompo)",
  desmolde: "Desmolde y paletizado",
};

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
  const sesion = await requerirRol("oficina", "auditor");
  // Solo el admin arma el programa; oficina y auditoria lo miran.
  const editar = sesion.roles.includes("admin");
  const p = await searchParams;
  const h = hoy();
  const dia = p.dia && FORMATO_DIA.test(p.dia) ? p.dia : h;

  const [programa, motivos, productos, historial, sugeridas] = await Promise.all([
    leerDia(dia),
    listarMotivosIncumplimiento(),
    productosParaProgramar(),
    historialCerrados(),
    metasSugeridas(dia),
  ]);
  const cerrado = programa.cerrado !== null;
  // Un dia pasado ya termino aunque nadie lo haya cerrado: lo que falta, falto.
  const terminado = cerrado || dia < h;
  const sinMotivo = programa.lineas.filter((l) => l.faltan > 0 && !l.motivoNombre && !l.reprogramadaA).length;
  const url = (d: string) => `/programa?dia=${d}`;

  return (
    <Pantalla titulo="Programa" bajada="La hoja de producción del día: lo que se pide y lo que se hizo.">
      {/* Dia */}
      <Tarjeta className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link href={url(sumarDias(dia, -1))} aria-label="Día anterior" className={FLECHA}>
            ‹
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-lg font-bold text-slate-900">
              {nombrePeriodo({ desde: dia, hasta: dia })}
            </div>
            <div className="text-xs text-slate-500">
              {dia === h
                ? "Hoy"
                : dia === sumarDias(h, 1)
                  ? "Mañana"
                  : dia === sumarDias(h, -1)
                    ? "Ayer"
                    : ""}
            </div>
          </div>
          <Link href={url(sumarDias(dia, 1))} aria-label="Día siguiente" className={FLECHA}>
            ›
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
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
      </Tarjeta>

      {/* Estado del dia */}
      {programa.lineas.length > 0 && (
        <Tarjeta className={`mb-4 ${cerrado ? "ring-emerald-300" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-600">
                {cerrado
                  ? `Cerrado ${fechaHora(programa.cerrado!.en)}${programa.cerrado!.por ? ` por ${programa.cerrado!.por}` : ""}`
                  : terminado
                    ? "Terminado, sin cerrar"
                    : "En curso"}
              </div>
              <Cumplimiento lineas={programa.lineas} grande terminado={terminado} />
            </div>
            {editar && (
              <AccionesDia
                dia={dia}
                cerrado={cerrado}
                hayLineas={programa.lineas.length > 0}
                sinMotivo={sinMotivo}
                sugerirCopiaDe={sumarDias(dia, -1)}
              />
            )}
          </div>
          {terminado && sinMotivo > 0 && (
            <p className="mt-2 text-sm text-red-700">
              {sinMotivo} línea{sinMotivo === 1 ? "" : "s"} sin cumplir y sin motivo: lo informa cada puesto
              desde su pantalla, o cargalo acá.
            </p>
          )}
        </Tarjeta>
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
        const hechas = lineas.reduce((a, l) => a + l.hechas, 0) + fuera.reduce((a, f) => a + f.hechas, 0);
        const meta = programa.meta[seccion];
        return (
          <Plegable
            key={seccion}
            titulo={TITULO[seccion]}
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
            <ListaPrograma
              lineas={lineas}
              motivos={motivos}
              editar={editar && !cerrado}
              informar={editar}
              terminado={terminado}
              manana={sumarDias(dia, 1)}
              vacio={seccion === "llenado" ? "Sin llenados programados." : "Sin desmoldes programados."}
            />
            {editar && !cerrado && (
              <AgregarLinea
                dia={dia}
                seccion={seccion}
                productos={productos}
                meta={programa.meta[seccion]}
                programadas={programadas}
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
        <Seccion titulo="Días cerrados" ayuda="Cumplimiento registrado al cerrar cada día.">
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
