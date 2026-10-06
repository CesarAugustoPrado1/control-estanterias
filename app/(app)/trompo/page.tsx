import { requerirRol } from "@/lib/auth";
import { trompoPorDefecto } from "@/lib/acciones/motor";
import {
  disponibilidadDeMoldes,
  llenadosDeHoy,
  productosParaTrompo,
  ultimoCementoPorTrompo,
} from "@/lib/consultas";
import { paquetesEsperados, TIPO_TROMPO } from "@/lib/estados";
import { hora, numero } from "@/lib/formato";
import { ChipCemento, NombreTanda, Placa } from "@/components/tanda";
import { ChipEstado, Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { PanelTrompo } from "./panel";

export const metadata = { title: "Trompo · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Trompo() {
  await requerirRol("trompo");

  const [productos, ultimoCemento, moldes, hoy, trompoDefecto] = await Promise.all([
    productosParaTrompo(),
    ultimoCementoPorTrompo(),
    disponibilidadDeMoldes(),
    llenadosDeHoy(),
    trompoPorDefecto(),
  ]);

  const libres = moldes.reduce((a, m) => a + m.libres, 0);
  const total = moldes.reduce((a, m) => a + m.total, 0);
  const moldesHoy = hoy.reduce((a, t) => a + t.moldesLlenados, 0);
  const paquetesHoy = hoy.reduce((a, t) => a + paquetesEsperados(t), 0);

  return (
    <Pantalla titulo="Trompo" bajada="Verificá la placa de la estantería antes de volcar.">
      <PanelTrompo productos={productos} ultimoCemento={ultimoCemento} trompoDefecto={trompoDefecto} />

      <Seccion
        titulo="Llenados de hoy"
        cantidad={hoy.length}
        ayuda={
          hoy.length
            ? `${numero(moldesHoy)} moldes · ${numero(paquetesHoy)} paquetes esperados.`
            : undefined
        }
      >
        {hoy.length === 0 ? (
          <Vacio>Todavía no se llenó nada hoy.</Vacio>
        ) : (
          <ul className="space-y-2">
            {hoy.map((t) => (
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
                      {t.moldesLlenados} moldes · Trompo {t.trompo.toUpperCase()} ({TIPO_TROMPO[t.trompo]})
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

      <Seccion
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
