import { requerirRol } from "@/lib/auth";
import { cola, disponibilidadDeMoldes, productosParaLlenar } from "@/lib/consultas";
import { haceCuanto, numero } from "@/lib/formato";
import { Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { PanelTrompo } from "./panel";

export const metadata = { title: "Trompo · Control de Estanterías" };
export const dynamic = "force-dynamic";

export default async function Trompo() {
  await requerirRol("trompo");

  const [productos, moldes, enPatio] = await Promise.all([
    productosParaLlenar(),
    disponibilidadDeMoldes(),
    cola("patio"),
  ]);

  const libres = moldes.reduce((a, m) => a + m.libres, 0);
  const total = moldes.reduce((a, m) => a + m.total, 0);

  return (
    <Pantalla
      titulo="Trompo"
      bajada="Registrá cada estantería apenas sale del trompo."
    >
      <PanelTrompo productos={productos} />

      <Seccion
        titulo="Moldes libres ahora"
        cantidad={libres}
        ayuda={`De ${numero(total)} estanterías. El resto está en el circuito y se libera al desmoldarse.`}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {moldes.map((m) => (
            <Tarjeta
              key={`${m.modeloId}-${m.familiaId}`}
              className={m.libres === 0 ? "ring-amber-300" : ""}
            >
              <div className="truncate text-sm font-semibold text-slate-800">
                {m.modelo}
              </div>
              <div className="truncate text-xs text-slate-500">{m.familia}</div>
              <div
                className={`cifra mt-1 text-2xl font-bold ${m.libres === 0 ? "text-amber-700" : "text-slate-900"}`}
              >
                {m.libres}
                <span className="text-sm font-medium text-slate-500">
                  {" "}
                  / {m.total}
                </span>
              </div>
            </Tarjeta>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Últimas que mandaste al patio" cantidad={enPatio.length}>
        {enPatio.length === 0 ? (
          <Vacio>No hay nada fraguando en el patio.</Vacio>
        ) : (
          <ul className="space-y-2">
            {enPatio.slice(0, 8).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200"
              >
                <div className="min-w-0">
                  <span className="cifra font-bold text-slate-900">
                    {t.codigo}
                  </span>
                  <span className="ml-2 truncate text-slate-600">
                    {t.productoNombre}
                  </span>
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
