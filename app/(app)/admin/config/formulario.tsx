"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Resultado } from "@/lib/acciones/comun";
import type { Trompo } from "@/lib/db/schema";
import { TIPO_TROMPO } from "@/lib/estados";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Selector, Tarjeta } from "@/components/ui";
import { accionTrompoFuera, accionTrompoVuelve } from "@/lib/acciones/trompos";

export function FormularioConfig({
  capacidadHorno,
  adentro,
  accion,
}: {
  capacidadHorno: number;
  adentro: number;
  accion: (fd: FormData) => Promise<Resultado<void>>;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(String(capacidadHorno));
  const { enviar, cargando, error, ok } = usarAccion(accion, {
    alTerminar: () => router.refresh(),
  });

  const n = Number(valor);
  // Bajar el cupo por debajo de lo que ya esta adentro no es un error de
  // validacion -el horno fisico no se achica-, pero hay que decirlo: hasta que
  // no saquen, el hornero no va a poder meter nada.
  const porDebajo = Number.isInteger(n) && n < adentro;

  return (
    <Tarjeta>
      <form action={enviar} className="space-y-4">
        <Campo
          etiqueta="Lugares en el horno"
          ayuda={`Ahora hay ${adentro} ocupados.`}
        >
          <Entrada
            name="capacidadHorno"
            inputMode="numeric"
            pattern="\d*"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
            required
            className="cifra text-2xl font-bold"
          />
        </Campo>

        {porDebajo && (
          <Aviso tono="atencion">
            Vas a dejar el cupo ({n}) por debajo de lo que ya está adentro (
            {adentro}). No rompe nada, pero el hornero no va a poder meter nada
            nuevo hasta sacar {adentro - n} o más.
          </Aviso>
        )}
        {error && <Aviso tono="error">{error}</Aviso>}
        {ok !== null && <Aviso tono="ok">Guardado.</Aviso>}

        <Boton type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

export function FormularioTrompo({
  trompo,
  accion,
}: {
  trompo: Trompo;
  accion: (fd: FormData) => Promise<Resultado<void>>;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<Trompo>(trompo);
  const { enviar, cargando, error, ok } = usarAccion(accion, {
    alTerminar: () => router.refresh(),
  });

  return (
    <Tarjeta>
      <form action={enviar} className="space-y-4">
        <input type="hidden" name="trompo" value={valor} />
        <div className="grid grid-cols-2 gap-2">
          {(["a", "b"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValor(t)}
              className={`min-h-16 rounded-lg transition-colors ${
                valor === t ? "bg-blue-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"
              }`}
            >
              <span className="block text-lg font-bold">Trompo {t.toUpperCase()}</span>
              <span className="block text-sm capitalize">{TIPO_TROMPO[t]}</span>
            </button>
          ))}
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        {ok !== null && <Aviso tono="ok">Guardado.</Aviso>}
        <Boton type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

type PeriodoFuera = { id: number; trompo: Trompo; desde: string; hasta: string | null; motivo: string | null };

/** "lun 26/10" sin pasar por la zona horaria. */
const corto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Trompos fuera de servicio: los periodos vigentes y los que vienen, y el
 * formulario para cargar uno. Volver a servicio lo termina ayer (o lo borra si
 * todavia no empezo).
 */
export function FueraDeServicio({ periodos, hoy }: { periodos: PeriodoFuera[]; hoy: string }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState({ trompo: "b", desde: hoy, hasta: "", motivo: "" });
  const poner = usarAccion(accionTrompoFuera, {
    alTerminar: () => {
      setNuevo({ trompo: "b", desde: hoy, hasta: "", motivo: "" });
      router.refresh();
    },
  });
  const volver = usarAccion(accionTrompoVuelve, { alTerminar: () => router.refresh() });
  const fd = (o: Record<string, string | number>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, String(v));
    return f;
  };

  return (
    <div className="space-y-3">
      {(["a", "b"] as const).map((t) => {
        const suyos = periodos.filter((p) => p.trompo === t);
        const ahora = suyos.find((p) => p.desde <= hoy && (!p.hasta || hoy <= p.hasta));
        return (
          <Tarjeta key={t}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-bold text-slate-900">Trompo {t.toUpperCase()}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  ahora ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {ahora ? "Fuera de servicio" : "En servicio"}
              </span>
            </div>
            {suyos.map((p) => (
              <div key={p.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                <span>
                  {p.desde <= hoy ? "Parado" : "Va a estar parado"}{" "}
                  {p.hasta === p.desde
                    ? `el ${corto(p.desde)}`
                    : `desde el ${corto(p.desde)}${p.hasta ? ` hasta el ${corto(p.hasta)} inclusive` : ", sin fecha de vuelta"}`}
                  {p.motivo && ` · ${p.motivo}`}
                </span>
                <Boton
                  tono="neutro"
                  className="min-h-11 text-sm"
                  disabled={volver.cargando}
                  onClick={() => volver.enviar(fd({ id: p.id }))}
                >
                  {p.desde > hoy ? "Cancelar" : "Volver a servicio"}
                </Boton>
              </div>
            ))}
          </Tarjeta>
        );
      })}
      {volver.error && <Aviso tono="error">{volver.error}</Aviso>}

      <Tarjeta>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            poner.enviar(fd(nuevo));
          }}
        >
          <Campo etiqueta="Trompo">
            <Selector value={nuevo.trompo} onChange={(e) => setNuevo({ ...nuevo, trompo: e.target.value })}>
              <option value="a">Trompo A</option>
              <option value="b">Trompo B</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Motivo (opcional)">
            <Entrada
              value={nuevo.motivo}
              placeholder="Ej: rotura de motor"
              onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Desde">
            <Entrada type="date" required value={nuevo.desde} onChange={(e) => setNuevo({ ...nuevo, desde: e.target.value })} />
          </Campo>
          <Campo etiqueta="Hasta (opcional)" ayuda="Vacío: hasta que lo vuelvas a poner en servicio.">
            <Entrada type="date" value={nuevo.hasta} onChange={(e) => setNuevo({ ...nuevo, hasta: e.target.value })} />
          </Campo>
          <div className="sm:col-span-2">
            <Boton type="submit" tono="peligro" disabled={poner.cargando}>
              {poner.cargando ? "Guardando…" : "Poner fuera de servicio"}
            </Boton>
          </div>
        </form>
        {poner.error && (
          <div className="mt-2">
            <Aviso tono="error">{poner.error}</Aviso>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
