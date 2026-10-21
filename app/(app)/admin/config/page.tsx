import { secuencia } from "@/lib/escala";
import { capacidadHorno, trompoPorDefecto } from "@/lib/acciones/motor";
import { guardarConfig, guardarMaquinista, guardarTrompoDefecto } from "@/lib/acciones/admin";
import { db } from "@/lib/db";
import { maquinistas } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { ocupacionHorno } from "@/lib/estadisticas";
import { guardarMotivoIncumplimiento } from "@/lib/acciones/programa";
import { listarMotivosIncumplimiento } from "@/lib/programa";
import { EditorFilas } from "@/components/admin/editor";
import { Pantalla, Seccion } from "@/components/ui";
import { FormularioConfig, FormularioTrompo } from "./formulario";

export const metadata = { title: "Parámetros · Admin" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const [cupo, adentro, trompo, maqs, motivosPrograma] = await Promise.all([
    capacidadHorno(),
    ocupacionHorno(),
    trompoPorDefecto(),
    db.select().from(maquinistas).orderBy(asc(maquinistas.nombre)),
    listarMotivosIncumplimiento(false),
  ]);

  // Colores de las secciones, de frio (arriba) a calido (abajo): lib/escala.ts.
  const tono = secuencia(4);

  return (
    <Pantalla titulo="Parámetros">
      <Seccion tono={tono()}
        titulo="Horno"
        ayuda="Cuántas estanterías entran a la vez. La pantalla del hornero no deja meter más de esto."
      >
        <FormularioConfig
          capacidadHorno={cupo}
          adentro={adentro}
          accion={guardarConfig}
        />
      </Seccion>
      <Seccion tono={tono()}
        titulo="Trompo por defecto"
        ayuda="El que aparece elegido en la pantalla del trompo. El operario lo puede cambiar en cada llenado."
      >
        <FormularioTrompo trompo={trompo} accion={guardarTrompoDefecto} />
      </Seccion>
      <Seccion tono={tono()}
        titulo="Maquinistas y desmoldadores"
        cantidad={maqs.length}
        ayuda="Una sola lista, porque rotan de puesto: de acá se elige el maquinista en cada llenado del trompo y el desmoldador en cada desmolde. No son usuarios de la app. Solo aparecen los activos."
      >
        <EditorFilas
          campos={[
            { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
          ]}
          accion={guardarMaquinista}
          etiquetaNuevo="Nueva persona"
          filas={maqs.map((m) => ({
            id: m.id,
            titulo: m.nombre,
            etiquetas: m.activo ? [] : [{ texto: "inactivo", tono: "rojo" as const }],
            valores: { nombre: m.nombre, activo: m.activo },
          }))}
        />
      </Seccion>
      <Seccion tono={tono()}
        titulo="Motivos de incumplimiento del programa"
        cantidad={motivosPrograma.length}
        ayuda="Los que eligen el trompo y el desmolde cuando no se llegó a lo programado. Aparecen ordenados por el número de orden."
      >
        <EditorFilas
          campos={[
            { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { clave: "orden", etiqueta: "Orden", tipo: "numero", ayuda: "En qué lugar aparece en la lista." },
            { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
          ]}
          accion={guardarMotivoIncumplimiento}
          etiquetaNuevo="Nuevo motivo"
          filas={motivosPrograma.map((m) => ({
            id: m.id,
            titulo: m.nombre,
            etiquetas: m.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }],
            valores: { nombre: m.nombre, orden: m.orden, activo: m.activo },
          }))}
        />
      </Seccion>
    </Pantalla>
  );
}
