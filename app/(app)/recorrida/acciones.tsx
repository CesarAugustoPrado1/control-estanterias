"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionResolverAviso, accionTarjetaEncontrada } from "@/lib/acciones/flujo";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";

export function ResolverAviso({ avisoId }: { avisoId: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const { enviar, cargando, error } = usarAccion(accionResolverAviso, {
    alTerminar: () => router.refresh(),
  });

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 text-sm font-semibold text-blue-700 hover:underline"
      >
        Resolver
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <Campo etiqueta="Qué se encontró o qué se hizo">
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: la tarjeta estaba en otra estantería, se movió" />
      </Campo>
      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton
          type="button"
          disabled={cargando}
          onClick={() => {
            const fd = new FormData();
            fd.set("avisoId", String(avisoId));
            fd.set("resolucion", texto);
            enviar(fd);
          }}
        >
          Marcar resuelto
        </Boton>
        <Boton type="button" tono="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

export function TarjetaEncontrada({ tarjetaId, palabra }: { tarjetaId: number; palabra: string }) {
  const router = useRouter();
  const { enviar, cargando, error } = usarAccion(accionTarjetaEncontrada, {
    alTerminar: () => router.refresh(),
  });
  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span className="text-sm text-red-700">{error}</span>}
      <Boton
        type="button"
        tono="neutro"
        disabled={cargando}
        onClick={() => {
          const fd = new FormData();
          fd.set("tarjetaId", String(tarjetaId));
          enviar(fd);
        }}
        title={`${palabra} volvió a su gancho`}
      >
        Apareció
      </Boton>
    </span>
  );
}
