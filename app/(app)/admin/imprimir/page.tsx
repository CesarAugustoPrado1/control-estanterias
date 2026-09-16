import Link from "next/link";
import { estadoDeTarjetas, listarEstanterias } from "@/lib/consultas";
import { DIA_DE_LETRA, LETRAS, type Letra } from "@/lib/tarjetas";
import { LetraDia } from "@/components/tanda";
import { Pantalla, Seccion } from "@/components/ui";
import { BotonImprimir } from "./boton";

export const metadata = { title: "Imprimir · Admin" };
export const dynamic = "force-dynamic";

/**
 * Material para el piso, sacado de los mismos datos que usa la app: si se
 * imprime desde aca, la etiqueta del gancho y la palabra que muestra la pantalla
 * no pueden diferir.
 */
export default async function Imprimir({
  searchParams,
}: {
  searchParams: Promise<{ que?: string; letra?: string; hasta?: string }>;
}) {
  const p = await searchParams;
  const que = p.que === "placas" ? "placas" : "ganchos";
  const letra: Letra = (LETRAS as readonly string[]).includes(p.letra ?? "") ? (p.letra as Letra) : "A";

  return (
    <Pantalla
      titulo="Imprimir"
      bajada="Etiquetas para los tableros de ganchos y listado de placas para grabar."
      acciones={<BotonImprimir />}
    >
      <div className="no-imprimir mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/imprimir?que=ganchos&letra=A"
          className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${que === "ganchos" ? "bg-slate-900 text-white" : "bg-white ring-slate-300"}`}
        >
          Etiquetas de ganchos
        </Link>
        <Link
          href="/admin/imprimir?que=placas"
          className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${que === "placas" ? "bg-slate-900 text-white" : "bg-white ring-slate-300"}`}
        >
          Placas de estanterías
        </Link>
      </div>

      {que === "ganchos" ? <Ganchos letra={letra} hasta={Number(p.hasta) || null} /> : <Placas />}
    </Pantalla>
  );
}

async function Ganchos({ letra, hasta }: { letra: Letra; hasta: number | null }) {
  const { fabricadas, tarjetas } = await estadoDeTarjetas();
  const limite = hasta ?? fabricadas[letra];
  const lista = tarjetas.filter((t) => t.letra === letra && t.orden <= limite);
  const d = DIA_DE_LETRA[letra];

  return (
    <>
      <div className="no-imprimir mb-4 flex flex-wrap items-center gap-2">
        {LETRAS.map((l) => (
          <Link
            key={l}
            href={`/admin/imprimir?que=ganchos&letra=${l}`}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm ring-1 ${l === letra ? "bg-slate-900 text-white" : "bg-white ring-slate-300"}`}
          >
            <LetraDia letra={l} /> <span className="capitalize">{DIA_DE_LETRA[l].dia}</span>
          </Link>
        ))}
        <span className="text-sm text-slate-500">
          Hasta el gancho {limite} (las fabricadas). Para imprimir más: agregá <code>&amp;hasta=70</code> a la dirección.
        </span>
      </div>

      <Seccion titulo={`Tablero del ${d.dia} · ${d.color}`} cantidad={lista.length}>
        <p className="no-imprimir mb-3 text-sm text-slate-600">
          Una etiqueta por gancho, en este orden de arriba para abajo. Recortar y pegar debajo de cada gancho.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3">
          {lista.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg bg-white p-3"
              style={{ border: `4px solid ${d.hex}`, breakInside: "avoid" }}
            >
              <span className="cifra w-8 text-right text-2xl font-bold text-slate-500">{t.orden}</span>
              <LetraDia letra={letra} />
              <span className="text-2xl font-black tracking-wide text-slate-900">{t.palabra.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </Seccion>
    </>
  );
}

async function Placas() {
  const ests = (await listarEstanterias()).filter((e) => e.activa);
  const sinNumero = ests.filter((e) => e.numero === null).length;

  return (
    <Seccion
      titulo="Placas de estanterías"
      cantidad={ests.length}
      ayuda="Para grabar. La placa dice modelo, familia y número; el cemento NO va grabado: las de cemento blanco se marcan pintando los laterales."
    >
      {sinNumero > 0 && (
        <p className="mb-3 text-sm font-semibold text-red-700">
          {sinNumero} estantería(s) no tienen número: cargalo en Admin → Estanterías antes de mandar a grabar.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">Texto a grabar</th>
              <th className="px-4 py-2 font-medium">Moldes</th>
              <th className="px-4 py-2 font-medium">Pintar laterales de blanco</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ests.map((e) => (
              <tr key={e.id} style={{ breakInside: "avoid" }}>
                <td className="px-4 py-2 font-mono text-base font-bold">{e.etiqueta}</td>
                <td className="cifra px-4 py-2">{e.moldes}</td>
                <td className="px-4 py-2">{e.cemento === "blanco" ? "SÍ" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}
