"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { accionEntrar } from "@/lib/acciones/sesion";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";

export function Formulario({ volver }: { volver?: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const { enviar, cargando, error, reintentando } = usarAccion(accionEntrar, {
    alTerminar: (inicio) => {
      router.replace(volver && volver.startsWith("/") ? volver : inicio);
      router.refresh();
    },
  });

  return (
    <form
      ref={form}
      action={enviar}
      className="space-y-4"
      autoComplete="off"
    >
      <Campo etiqueta="Usuario">
        <Entrada
          name="usuario"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
        />
      </Campo>

      <Campo etiqueta="PIN" ayuda="4 a 8 dígitos">
        <Entrada
          name="pin"
          type="password"
          // Teclado numerico en el celular sin perder el ocultado del PIN.
          inputMode="numeric"
          pattern="\d*"
          maxLength={8}
          required
        />
      </Campo>

      {error && <Aviso tono="error">{error}</Aviso>}
      {reintentando > 0 && (
        <Aviso tono="atencion">
          Sin respuesta, reintentando ({reintentando}/3)…
        </Aviso>
      )}

      <Boton type="submit" ancho disabled={cargando}>
        {cargando ? "Entrando…" : "Entrar"}
      </Boton>
    </form>
  );
}
