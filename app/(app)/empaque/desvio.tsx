"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accionEmpaqueAnda, accionEmpaqueParado } from "@/lib/acciones/flujo";
import { usarAccion } from "@/components/usar-accion";
import { Aviso, Boton, Campo, DetalleTecnico, Entrada } from "@/components/ui";

/**
 * Avisar que el empaque esta parado (tunel roto, corte de luz).
 *
 * Lo abre y lo cierra el puesto que lo sufre. No mueve ninguna tanda: los
 * palets siguen esperando donde estan. Lo unico que hace es que la espera de
 * todos quede explicada, para que la recorrida no los marque como movimientos
 * sin registrar. Ver ARQUITECTURA.md §10.8.
 */
export function Desvio({
  parado,
}: {
  parado: { texto: string; usuarioNombre: string; desde: string } | null;
}) {
  return parado ? <Abierto parado={parado} /> : <Abrir />;
}

function Abrir() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const { enviar, cargando, error, detalle } = usarAccion(accionEmpaqueParado, {
    alTerminar: () => {
      setAbierto(false);
      setTexto("");
      router.refresh();
    },
  });

  if (!abierto) {
    return (
      <div className="mb-4 text-right">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="text-sm font-semibold text-violet-700 hover:underline"
        >
          El empaque está parado
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
      <p className="text-sm text-violet-900">
        Esto no mueve ninguna tanda: los palets se quedan donde están. Sirve para que en la
        recorrida se entienda por qué están todos esperando, en vez de que parezca que falta
        registrar movimientos.
      </p>
      <Campo etiqueta="¿Qué pasó?">
        <Entrada
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: se rompió el túnel"
          autoFocus
        />
      </Campo>
      {error && (
        <>
          <Aviso tono="error">{error}</Aviso>
          <DetalleTecnico texto={detalle} />
        </>
      )}
      <div className="flex gap-2">
        <Boton
          type="button"
          disabled={cargando}
          onClick={() => {
            const fd = new FormData();
            fd.set("texto", texto);
            enviar(fd);
          }}
        >
          {cargando ? "Avisando…" : "Avisar"}
        </Boton>
        <Boton type="button" tono="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

function Abierto({
  parado,
}: {
  parado: { texto: string; usuarioNombre: string; desde: string };
}) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const { enviar, cargando, error, detalle } = usarAccion(accionEmpaqueAnda, {
    alTerminar: () => router.refresh(),
  });

  return (
    <div className="mb-4 space-y-3 rounded-2xl border-4 border-violet-500 bg-violet-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-violet-600 px-2 py-0.5 text-xs font-bold text-white">
          EMPAQUE PARADO
        </span>
        <span className="text-sm text-violet-900">
          {parado.usuarioNombre} · {parado.desde}
        </span>
      </div>
      <p className="text-xl font-bold text-slate-900">{parado.texto}</p>
      <p className="text-sm text-violet-900">
        Mientras esté abierto, los palets que esperan no se marcan como movimientos sin
        registrar. Cerralo cuando el empaque vuelva a andar.
      </p>
      <Campo etiqueta="Nota al cerrar (opcional)">
        <Entrada
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: vino el técnico, cambió la resistencia"
        />
      </Campo>
      {error && (
        <>
          <Aviso tono="error">{error}</Aviso>
          <DetalleTecnico texto={detalle} />
        </>
      )}
      <Boton
        type="button"
        disabled={cargando}
        onClick={() => {
          const fd = new FormData();
          fd.set("nota", nota);
          enviar(fd);
        }}
      >
        {cargando ? "Cerrando…" : "Volvió a andar"}
      </Boton>
    </div>
  );
}
