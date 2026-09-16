import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth";
import { listarMotivos, tandaPorCodigo } from "@/lib/consultas";
import { convertir, ETIQUETA_MOTIVO_FRAGUADO, ETIQUETA_MOVIMIENTO, ETIQUETA_TROMPO, QUE_MIDE_LA_DURACION } from "@/lib/estados";
import { duracion, fechaCompleta, haceCuanto, numero } from "@/lib/formato";
import {
  Aviso,
  ChipEstado,
  MarcaRehornear,
  Pantalla,
  Seccion,
  Tarjeta,
} from "@/components/ui";
import { FormularioCorreccion } from "./correccion";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  return { title: `${decodeURIComponent(codigo)} · Control de Estanterías` };
}

export default async function DetalleTanda({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const sesion = await requerirSesion();
  const { codigo } = await params;
  const datos = await tandaPorCodigo(decodeURIComponent(codigo));
  if (!datos) notFound();

  const { tanda: t, movimientos: movs, estanteria } = datos;
  const previsto = convertir(t.moldesLlenados, t.piezasPorMolde, t.piezasPorPaquete);
  const rotura = t.paquetes === null ? null : previsto.paquetes - t.paquetes;
  const m2 =
    t.paquetes !== null && t.m2PorPaquete ? t.paquetes * Number(t.m2PorPaquete) : null;
  const total = movs.reduce((a, m) => a + (m.duracionMin ?? 0), 0);

  const motivos = sesion.rol === "admin" ? await listarMotivos() : [];

  return (
    <Pantalla
      titulo={t.codigo}
      bajada={
        <>
          {t.productoNombre} · {t.modeloNombre} · {t.familiaNombre}
        </>
      }
      acciones={<ChipEstado estado={t.estado} />}
    >
      {t.rehornear && (
        <div className="mb-4">
          <Aviso tono="atencion">
            <MarcaRehornear /> Salió del horno sin fraguar y volvió a la cola.
          </Aviso>
        </div>
      )}

      <Seccion titulo="Números">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta>
            <div className="text-sm text-slate-600">Moldes llenados</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {numero(t.moldesLlenados)}
              {t.moldesNominal && (
                <span className="text-base font-medium text-slate-500">
                  {" "}
                  / {t.moldesNominal}
                </span>
              )}
            </div>
            {t.moldesNominal && t.moldesNominal > t.moldesLlenados && (
              <div className="text-xs text-amber-700">
                faltaron {t.moldesNominal - t.moldesLlenados}
              </div>
            )}
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Paquetes previstos</div>
            <div className="cifra mt-1 text-2xl font-bold">{previsto.paquetes}</div>
            <div className="text-xs text-slate-500">
              {t.piezasPorMolde} pza/molde · {t.piezasPorPaquete} pza/paq
            </div>
          </Tarjeta>
          <Tarjeta>
            <div className="text-sm text-slate-600">Paquetes reales</div>
            <div className="cifra mt-1 text-2xl font-bold">
              {t.paquetes === null ? "—" : numero(t.paquetes)}
            </div>
            <div className="text-xs text-slate-500">
              {t.paquetes === null ? "todavía sin contar" : m2 !== null ? `${numero(m2, 1)} m²` : ""}
            </div>
          </Tarjeta>
          <Tarjeta className={rotura ? "ring-red-300" : ""}>
            <div className="text-sm text-slate-600">Rotura</div>
            <div
              className={`cifra mt-1 text-2xl font-bold ${rotura ? "text-red-700" : ""}`}
            >
              {rotura === null ? "—" : rotura}
            </div>
            <div className="text-xs text-slate-500">
              {t.motivoRoturaNombre ?? (rotura === null ? "se calcula al empacar" : "sin rotura")}
            </div>
          </Tarjeta>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {ETIQUETA_TROMPO[t.trompo]}
          {estanteria && <> · estantería {estanteria.codigo}</>} · en este estado{" "}
          {haceCuanto(t.estadoDesde)}
          {total > 0 && <> · ciclo acumulado {duracion(total)}</>}
        </p>
      </Seccion>

      <Seccion titulo="Línea de tiempo" cantidad={movs.length}>
        <ol className="space-y-2">
          {movs.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">
                  {ETIQUETA_MOVIMIENTO[m.tipo]}
                  {m.motivoFraguado && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      {ETIQUETA_MOTIVO_FRAGUADO[m.motivoFraguado]}
                    </span>
                  )}
                </div>
                <div className="text-sm text-slate-600">
                  {fechaCompleta(m.creadoEn)} · {m.usuarioNombre}
                </div>
                {m.nota && (
                  <div className="mt-0.5 text-sm text-slate-500">{m.nota}</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                {m.duracionMin !== null && (
                  <>
                    <div className="cifra font-semibold text-slate-800">
                      {duracion(m.duracionMin)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {QUE_MIDE_LA_DURACION[m.tipo] ?? "estado anterior"}
                    </div>
                  </>
                )}
                {m.moldesLlenados !== null && (
                  <div className="cifra text-sm text-slate-700">
                    {m.moldesLlenados} moldes
                  </div>
                )}
                {m.paquetes !== null && (
                  <div className="cifra text-sm text-slate-700">
                    {m.paquetes} paquetes
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Seccion>

      {sesion.rol === "admin" && (
        <Seccion
          titulo="Corregir"
          ayuda="Para arreglar un error de carga. Queda registrado como movimiento con su nota: nada se edita en silencio."
        >
          <FormularioCorreccion
            tandaId={t.id}
            codigo={t.codigo}
            estado={t.estado}
            moldesLlenados={t.moldesLlenados}
            paquetes={t.paquetes}
            motivos={motivos}
          />
        </Seccion>
      )}

      <div className="mt-6">
        <Link
          href={`/movimientos?texto=${encodeURIComponent(t.codigo)}`}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          Ver en el historial general →
        </Link>
      </div>
    </Pantalla>
  );
}
