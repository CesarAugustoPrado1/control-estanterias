import { requerirRol } from "@/lib/auth";
import { cola, maquinistasActivos } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { Pantalla, Seccion, Vacio } from "@/components/ui";
import { haceCuanto } from "@/lib/formato";
import { PanelDesmolde } from "./panel";
import { ListaPrograma } from "@/components/programa";
import { Plegable } from "@/components/plegable";
import { hoy } from "@/lib/periodo";
import { leerDia, listarMotivosIncumplimiento } from "@/lib/programa";
import { NombreTanda } from "@/components/tanda";

export const metadata = { title: "Desmolde · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Desmolde() {
  await requerirRol("desmolde");
  const [aDesmoldar, aEmpaquetar, desmoldadores, programa, motivos] = await Promise.all([
    cola("a_desmoldar"),
    cola("a_empaquetar"),
    maquinistasActivos(),
    leerDia(hoy()),
    listarMotivosIncumplimiento(),
  ]);
  const lineas = programa.lineas.filter((l) => l.seccion === "desmolde");

  return (
    <Pantalla
      titulo="Desmolde"
      bajada="Separá moldes y piezas. Los moldes quedan libres apenas registrás el desmolde."
    >
      {lineas.length > 0 && (
        <Plegable
          titulo="Programa de hoy"
          resumen={`${lineas.reduce((a, l) => a + Math.min(l.hechas, l.cantidad), 0)} de ${lineas.reduce((a, l) => a + l.cantidad, 0)} maquinadas desmoldadas`}
        >
          <ListaPrograma
            lineas={lineas}
            motivos={motivos}
            informar={programa.cerrado === null}
            terminado={programa.cerrado !== null}
          />
        </Plegable>
      )}

      <PanelDesmolde aDesmoldar={aDesmoldar} desmoldadores={desmoldadores} />

      <Seccion
        titulo="Desmoldadas, esperando empaque"
        cantidad={aEmpaquetar.length}
        ayuda="Ya no retienen moldes. Las cuenta y las cierra empaque."
      >
        {aEmpaquetar.length === 0 ? (
          <Vacio>No hay nada esperando empaque.</Vacio>
        ) : (
          <ul className="space-y-2">
            {aEmpaquetar.slice(0, 10).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200"
              >
                <div className="min-w-0 space-y-1">
                  <NombreTanda palabra={t.tarjetaPalabra} letra={t.tarjetaLetra} codigo={t.codigo} />
                  <div className="text-slate-600">{t.productoNombre}</div>
                  <div className="text-xs text-slate-500">
                    {numero(t.moldesLlenados)} moldes
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {haceCuanto(t.estadoDesde)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </Pantalla>
  );
}
