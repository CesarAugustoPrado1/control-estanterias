"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Resultado } from "@/lib/acciones/comun";
import type { Trompo } from "@/lib/db/schema";
import { TIPO_TROMPO } from "@/lib/estados";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada, Tarjeta } from "@/components/ui";

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
