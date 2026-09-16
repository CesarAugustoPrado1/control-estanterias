import Link from "next/link";
import { estadoDeTarjetas } from "@/lib/consultas";
import { ETIQUETA_ESTADO } from "@/lib/estados";
import { haceCuanto } from "@/lib/formato";
import { DIA_DE_LETRA, LETRAS, type Letra } from "@/lib/tarjetas";
import { LetraDia } from "@/components/tanda";
import { Aviso, Pantalla, Seccion, Tarjeta } from "@/components/ui";
import { FormularioFabricadas } from "./fabricadas";

export const metadata = { title: "Tarjetas · Admin" };
export const dynamic = "force-dynamic";

export default async function Tarjetas({
  searchParams,
}: {
  searchParams: Promise<{ letra?: string }>;
}) {
  const { letra: param } = await searchParams;
  const letra: Letra = (LETRAS as readonly string[]).includes(param ?? "") ? (param as Letra) : "A";
  const { fabricadas, tarjetas } = await estadoDeTarjetas();
  const deLaLetra = tarjetas.filter((t) => t.letra === letra);
  const d = DIA_DE_LETRA[letra];

  const resumen = LETRAS.map((l) => {
    const ts = tarjetas.filter((t) => t.letra === l);
    return {
      l,
      total: ts.length,
      enUso: ts.filter((t) => t.uso).length,
      perdidas: ts.filter((t) => t.perdidaDesde).length,
    };
  });

  return (
    <Pantalla
      titulo="Tarjetas"
      bajada="Una tarjeta por palabra. Siempre se asigna la primera libre de arriba para abajo."
    >
      {tarjetas.length === 0 && (
        <div className="mb-4">
          <Aviso tono="atencion">
            No hay tarjetas cargadas. Corré <code>npm run db:palabras</code> para cargarlas desde{" "}
            <code>datos/palabras.json</code>.
          </Aviso>
        </div>
      )}

      <Seccion
        titulo="Cuántas existen físicamente"
        ayuda="La app nunca manda a buscar una tarjeta más allá de este número. Subilo a medida que se fabriquen más."
      >
        <FormularioFabricadas fabricadas={fabricadas} />
      </Seccion>

      <Seccion titulo="Por día">
        <div className="mb-3 flex flex-wrap gap-2">
          {resumen.map((r) => (
            <Link
              key={r.l}
              href={`/admin/tarjetas?letra=${r.l}`}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${
                r.l === letra ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300"
              }`}
            >
              <LetraDia letra={r.l} />
              <span className="capitalize">{DIA_DE_LETRA[r.l].dia}</span>
              <span className="cifra text-xs opacity-80">
                {r.enUso} en uso{r.perdidas ? ` · ${r.perdidas} perdidas` : ""}
              </span>
            </Link>
          ))}
        </div>

        <Tarjeta className="overflow-x-auto p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <LetraDia letra={letra} />
            <span className="font-semibold capitalize">{d.dia}</span>
            <span className="text-sm text-slate-500">
              tarjetas {d.color}s · {fabricadas[letra]} fabricadas de {deLaLetra.length}
            </span>
            <Link
              href={`/admin/imprimir?que=ganchos&letra=${letra}`}
              className="ml-auto text-sm font-semibold text-blue-700 hover:underline"
            >
              Imprimir etiquetas de ganchos
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Gancho</th>
                <th className="px-4 py-2 font-medium">Palabra</th>
                <th className="px-4 py-2 font-medium">Dónde debería estar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deLaLetra.map((t) => (
                <tr key={t.id} className={t.fabricada ? "" : "text-slate-400"}>
                  <td className="cifra px-4 py-2">{t.orden}</td>
                  <td className="px-4 py-2 font-bold">{t.palabra.toUpperCase()}</td>
                  <td className="px-4 py-2">
                    {!t.fabricada ? (
                      "No fabricada todavía"
                    ) : t.perdidaDesde ? (
                      <span className="font-semibold text-amber-700">
                        Perdida {haceCuanto(t.perdidaDesde)} (ver Recorrida)
                      </span>
                    ) : t.uso ? (
                      <Link href={`/tanda/${t.uso.codigo}`} className="text-blue-700 hover:underline">
                        En uso: {t.uso.producto}, {ETIQUETA_ESTADO[t.uso.estado]} {haceCuanto(t.uso.estadoDesde)}
                      </Link>
                    ) : (
                      <span className="text-emerald-700">En su gancho</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
        <p className="mt-2 text-xs text-slate-500">
          Las palabras se cambian editando <code>datos/palabras.json</code> y corriendo{" "}
          <code>npm run db:palabras</code>. Una tarjeta en uso no se toca hasta que vuelva a su gancho.
        </p>
      </Seccion>
    </Pantalla>
  );
}
