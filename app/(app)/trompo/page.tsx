import { requerirRol } from "@/lib/auth";
import { trompoPorDefecto } from "@/lib/acciones/motor";
import { hoy, sumarDias } from "@/lib/periodo";
import { lavadosDelDia } from "@/lib/lavados";
import { leerDia, listarMotivosIncumplimiento } from "@/lib/programa";
import {
  disponibilidadDeMoldes,
  llenadosDeHoy,
  maquinistasActivos,
  productosParaTrompo,
  ultimoCementoPorTrompo,
} from "@/lib/consultas";
import { cantidadSalida, paquetesEsperados, TIPO_TROMPO } from "@/lib/estados";
import type { UnidadSalida } from "@/lib/db/schema";
import Link from "next/link";
import { hora, numero } from "@/lib/formato";
import { ChipCemento, NombreTanda, Placa } from "@/components/tanda";
import { ChipEstado, Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { LavadosTrompo } from "@/components/lavados";
import { PanelTrompo } from "./panel";
import { tonos } from "@/lib/escala";

/** Colores de las cajas, de frio (arriba) a calido (abajo): lib/escala.ts. */
const TONO = tonos(["programa", "llenados", "lavados", "estanterias"] as const);

export const metadata = { title: "Trompo · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Trompo() {
  await requerirRol("trompo");

  const h = hoy();
  const ayer = sumarDias(h, -1);
  const [productos, ultimoCemento, moldes, deHoy, trompoDefecto, maquinistas, programa, motivos, lavHoy, lavAyer] =
    await Promise.all([
    productosParaTrompo(),
    ultimoCementoPorTrompo(),
    disponibilidadDeMoldes(),
    llenadosDeHoy(),
    trompoPorDefecto(),
    maquinistasActivos(),
    leerDia(h),
    listarMotivosIncumplimiento(),
    lavadosDelDia(h),
    lavadosDelDia(ayer),
  ]);
  const programaLlenado = programa.lineas.filter((l) => l.seccion === "llenado");

  const libres = moldes.reduce((a, m) => a + m.libres, 0);
  const total = moldes.reduce((a, m) => a + m.total, 0);
  const moldesHoy = deHoy.reduce((a, t) => a + t.moldesLlenados, 0);
  // Cada producto se cuenta en su unidad: sumar paquetes con unidades no dice
  // nada, asi que el total va separado por unidad.
  const salidaHoy = new Map<UnidadSalida, number>();
  for (const t of deHoy) salidaHoy.set(t.unidad, (salidaHoy.get(t.unidad) ?? 0) + paquetesEsperados(t));
  const textoSalidaHoy = [...salidaHoy]
    .map(([u, n]) => cantidadSalida(n, u, numero))
    .join(" · ");

  return (
    <Pantalla titulo="Trompo" bajada="Verificá la placa de la estantería antes de volcar.">
      <PanelTrompo
        productos={productos}
        ultimoCemento={ultimoCemento}
        trompoDefecto={trompoDefecto}
        maquinistas={maquinistas}
        programa={programaLlenado}
        motivos={motivos}
        programaCerrado={programa.cerrado !== null}
        tono={TONO.programa}
      />

      <Seccion
        tono={TONO.llenados}
        titulo="Llenados de hoy"
        cantidad={deHoy.length}
        acciones={
          <Link href="/produccion" className="text-sm font-semibold text-blue-700 hover:underline">
            Ver lo empaquetado y otros días →
          </Link>
        }
        ayuda={
          deHoy.length
            ? `${numero(moldesHoy)} moldes · se esperan ${textoSalidaHoy}.`
            : undefined
        }
      >
        {deHoy.length === 0 ? (
          <Vacio>Todavía no se llenó nada hoy.</Vacio>
        ) : (
          <ul className="space-y-2">
            {deHoy.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NombreTanda palabra={t.tarjetaPalabra} letra={t.tarjetaLetra} codigo={t.codigo} />
                    {t.cemento === "blanco" && <ChipCemento cemento="blanco" />}
                  </div>
                  <div className="font-semibold text-slate-800">{t.productoNombre}</div>
                  <div className="flex flex-wrap items-center gap-1 text-slate-600">
                    <Placa etiqueta={t.estanteriaEtiqueta} />
                    <span>
                      {t.moldesLlenados} moldes → {cantidadSalida(paquetesEsperados(t), t.unidad)} · Trompo {t.trompo.toUpperCase()} ({TIPO_TROMPO[t.trompo]})
                      {t.maquinistaNombre && <> · {t.maquinistaNombre}</>}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="cifra text-xs text-slate-500">{hora(t.creadaEn)}</span>
                  <ChipEstado estado={t.estado} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <LavadosTrompo
        tono={TONO.lavados}
        hoy={{ dia: h, cantidad: lavHoy?.cantidad ?? null }}
        ayer={{ dia: ayer, cantidad: lavAyer?.cantidad ?? null }}
      />

      <Seccion
        tono={TONO.estanterias}
        titulo="Estanterías libres ahora"
        cantidad={libres}
        ayuda={`De ${numero(total)}. El resto está en el circuito y se libera al desmoldarse.`}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {moldes.map((m) => (
            <Tarjeta
              key={`${m.modeloId}-${m.familiaId}-${m.cemento}`}
              className={m.libres === 0 ? "ring-amber-300" : ""}
            >
              <div className="truncate text-sm font-semibold text-slate-800">{m.modelo}</div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                {m.familia} {m.cemento === "blanco" && <ChipCemento cemento="blanco" />}
              </div>
              <div
                className={`cifra mt-1 text-2xl font-bold ${m.libres === 0 ? "text-amber-700" : "text-slate-900"}`}
              >
                {m.libres}
                <span className="text-sm font-medium text-slate-500"> / {m.total}</span>
              </div>
            </Tarjeta>
          ))}
        </div>
      </Seccion>

    </Pantalla>
  );
}
