import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { datosRecorrida, estadoDeTarjetas } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { TITULO_ESTADO } from "@/lib/estados";
import { fechaHora, haceCuanto } from "@/lib/formato";
import { DIA_DE_LETRA, LETRAS } from "@/lib/tarjetas";
import {
  ChipCemento,
  LetraDia,
  MarcaSospechosa,
  NombreTanda,
  Placa,
  esSospechosa,
} from "@/components/tanda";
import { MarcaRehornear, Pantalla, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { ResolverAviso, TarjetaEncontrada } from "./acciones";

export const metadata = { title: "Recorrida · Control de Estanterías" };
export const dynamic = "force-dynamic";

/** Donde tiene que estar fisicamente la tarjeta en cada estado. */
const DONDE: Record<Exclude<Estado, "listo">, string> = {
  patio: "colgada en la estantería, en el patio",
  horno: "colgada en la estantería, adentro del horno",
  a_desmoldar: "colgada en la estantería, esperando desmolde",
  a_empaquetar: "en el palet, esperando empaque",
};

/**
 * Recorrida diaria: lo que el sistema cree que hay en el piso, para compararlo
 * caminando. Ver ARQUITECTURA.md §10.8.
 *
 * La identificacion es por lectura, asi que no todos los errores se pueden
 * prevenir. Lo que se puede es que no pasen en silencio: una tanda que el
 * sistema ve en el patio y en el piso no esta, o un gancho que tendria que estar
 * vacio y tiene tarjeta, es un movimiento que alguien no registro.
 */
export default async function Recorrida() {
  const sesion = await requerirRol("oficina", "auditor");
  const esAdmin = sesion.rol === "admin";
  const [{ vivas, avisos, perdidas }, { tarjetas }] = await Promise.all([
    datosRecorrida(),
    estadoDeTarjetas(),
  ]);

  const sospechosas = vivas.filter((t) => esSospechosa(t.estado, t.estadoDesde));
  const estados = ["patio", "horno", "a_desmoldar", "a_empaquetar"] as const;

  return (
    <Pantalla
      titulo="Recorrida"
      bajada="Lo que debería haber en el piso ahora. Caminá, compará y anotá lo que no coincida."
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta className={avisos.length ? "ring-red-300" : ""}>
          <div className="text-sm text-slate-600">Avisos abiertos</div>
          <div className={`cifra text-3xl font-bold ${avisos.length ? "text-red-700" : ""}`}>{avisos.length}</div>
        </Tarjeta>
        <Tarjeta className={sospechosas.length ? "ring-red-300" : ""}>
          <div className="text-sm text-slate-600">¿Falta registrar algo?</div>
          <div className={`cifra text-3xl font-bold ${sospechosas.length ? "text-red-700" : ""}`}>
            {sospechosas.length}
          </div>
        </Tarjeta>
        <Tarjeta className={perdidas.length ? "ring-amber-300" : ""}>
          <div className="text-sm text-slate-600">Tarjetas perdidas</div>
          <div className={`cifra text-3xl font-bold ${perdidas.length ? "text-amber-700" : ""}`}>
            {perdidas.length}
          </div>
        </Tarjeta>
        <Tarjeta>
          <div className="text-sm text-slate-600">Tandas en el piso</div>
          <div className="cifra text-3xl font-bold">{vivas.length}</div>
        </Tarjeta>
      </div>

      <Seccion
        titulo="Avisos del piso"
        cantidad={avisos.length}
        ayuda="Cosas que alguien vio que no cierran. Se resuelven mirando el piso, no la pantalla."
      >
        {avisos.length === 0 ? (
          <Vacio>No hay avisos abiertos.</Vacio>
        ) : (
          <ul className="space-y-2">
            {avisos.map(({ a, palabra, codigo }) => (
              <li key={a.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-red-200">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                    {a.tipo === "tarjeta_perdida" ? "TARJETA PERDIDA" : "PLACA NO COINCIDE"}
                  </span>
                  {codigo && (
                    <Link href={`/tanda/${codigo}`} className="font-semibold text-blue-700 hover:underline">
                      {palabra ? palabra.toUpperCase() : codigo}
                    </Link>
                  )}
                  <span className="text-slate-500">
                    {a.usuarioNombre} · {fechaHora(a.creadoEn)}
                  </span>
                </div>
                <p className="mt-1 text-slate-800">{a.texto}</p>
                {esAdmin && <ResolverAviso avisoId={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {sospechosas.length > 0 && (
        <Seccion
          titulo="¿Falta registrar algo?"
          cantidad={sospechosas.length}
          ayuda="Tandas que llevan en su estado mucho más de lo normal. Casi siempre es un movimiento que no se cargó: fijate dónde están de verdad."
        >
          <ListaTandas tandas={sospechosas} />
        </Seccion>
      )}

      {estados.map((e) => {
        const lista = vivas.filter((t) => t.estado === e);
        return (
          <Seccion key={e} titulo={TITULO_ESTADO[e]} cantidad={lista.length} ayuda={`La tarjeta tiene que estar ${DONDE[e]}.`}>
            {lista.length === 0 ? <Vacio>Nada en este estado.</Vacio> : <ListaTandas tandas={lista} />}
          </Seccion>
        );
      })}

      <Seccion
        titulo="Tableros de ganchos"
        ayuda="Estos ganchos tienen que estar VACÍOS: su tarjeta está en el piso. Un gancho de la lista con tarjeta, o uno vacío que no está en la lista, es algo sin registrar."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {LETRAS.map((l) => {
            const enUso = tarjetas.filter((t) => t.letra === l && t.uso);
            const d = DIA_DE_LETRA[l];
            return (
              <Tarjeta key={l}>
                <div className="mb-2 flex items-center gap-2">
                  <LetraDia letra={l} />
                  <span className="font-semibold capitalize text-slate-800">{d.dia}</span>
                  <span className="text-sm text-slate-500">({d.color})</span>
                  <span className="cifra ml-auto text-sm text-slate-600">{enUso.length} vacíos</span>
                </div>
                {enUso.length === 0 ? (
                  <p className="text-sm text-slate-500">Todas las tarjetas en su gancho.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {enUso.map((t) => (
                      <li key={t.id} className="rounded bg-slate-100 px-2 py-1 text-sm">
                        <span className="cifra mr-1 text-slate-500">{t.orden}</span>
                        <span className="font-bold">{t.palabra.toUpperCase()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            );
          })}
        </div>
      </Seccion>

      <Seccion titulo="Tarjetas perdidas" cantidad={perdidas.length} ayuda="No se asignan hasta que aparezcan.">
        {perdidas.length === 0 ? (
          <Vacio>No hay tarjetas perdidas.</Vacio>
        ) : (
          <ul className="space-y-2">
            {perdidas.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-amber-200"
              >
                <LetraDia letra={t.letra} />
                <span className="font-bold">{t.palabra.toUpperCase()}</span>
                <span className="text-sm text-slate-500">
                  gancho {t.orden} · perdida {t.perdidaDesde ? haceCuanto(t.perdidaDesde) : ""}
                </span>
                {esAdmin && <TarjetaEncontrada tarjetaId={t.id} palabra={t.palabra} />}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </Pantalla>
  );
}

function ListaTandas({ tandas }: { tandas: Awaited<ReturnType<typeof datosRecorrida>>["vivas"] }) {
  return (
    <ul className="space-y-2">
      {tandas.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tanda/${t.codigo}`}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <NombreTanda palabra={t.tarjetaPalabra} letra={t.tarjetaLetra} codigo={t.codigo} />
            <Placa etiqueta={t.estanteriaEtiqueta} />
            {t.cemento === "blanco" && <ChipCemento cemento="blanco" />}
            {t.rehornear && <MarcaRehornear />}
            {esSospechosa(t.estado, t.estadoDesde) && <MarcaSospechosa />}
            <span className="text-sm text-slate-600">{t.productoNombre}</span>
            <span className="ml-auto text-xs text-slate-500">{haceCuanto(t.estadoDesde)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
