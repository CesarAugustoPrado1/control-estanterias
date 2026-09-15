import { requerirRol } from "@/lib/auth";
import { cola } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { Pantalla, Seccion, Vacio } from "@/components/ui";
import { haceCuanto } from "@/lib/formato";
import { PanelDesmolde } from "./panel";

export const metadata = { title: "Desmolde · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Desmolde() {
  await requerirRol("desmolde");
  const [aDesmoldar, aEmpaquetar] = await Promise.all([
    cola("a_desmoldar"),
    cola("a_empaquetar"),
  ]);

  return (
    <Pantalla
      titulo="Desmolde"
      bajada="Separá moldes y piezas. Los moldes quedan libres apenas registrás el desmolde."
    >
      <PanelDesmolde aDesmoldar={aDesmoldar} />

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
                <div className="min-w-0">
                  <span className="cifra font-bold text-slate-900">
                    {t.codigo}
                  </span>
                  <span className="ml-2 text-slate-600">{t.productoNombre}</span>
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
