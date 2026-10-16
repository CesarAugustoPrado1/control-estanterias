import { capacidadHorno, trompoPorDefecto } from "@/lib/acciones/motor";
import { guardarConfig, guardarMaquinista, guardarTrompoDefecto } from "@/lib/acciones/admin";
import { db } from "@/lib/db";
import { maquinistas } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { ocupacionHorno } from "@/lib/estadisticas";
import { EditorFilas } from "@/components/admin/editor";
import { Pantalla, Seccion } from "@/components/ui";
import { FormularioConfig, FormularioTrompo } from "./formulario";

export const metadata = { title: "Parámetros · Admin" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const [cupo, adentro, trompo, maqs] = await Promise.all([
    capacidadHorno(),
    ocupacionHorno(),
    trompoPorDefecto(),
    db.select().from(maquinistas).orderBy(asc(maquinistas.nombre)),
  ]);

  return (
    <Pantalla titulo="Parámetros">
      <Seccion
        titulo="Horno"
        ayuda="Cuántas estanterías entran a la vez. La pantalla del hornero no deja meter más de esto."
      >
        <FormularioConfig
          capacidadHorno={cupo}
          adentro={adentro}
          accion={guardarConfig}
        />
      </Seccion>
      <Seccion
        titulo="Trompo por defecto"
        ayuda="El que aparece elegido en la pantalla del trompo. El operario lo puede cambiar en cada llenado."
      >
        <FormularioTrompo trompo={trompo} accion={guardarTrompoDefecto} />
      </Seccion>
      <Seccion
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
    </Pantalla>
  );
}
