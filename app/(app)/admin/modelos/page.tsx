import {
  guardarFamilia,
  guardarModelo,
  guardarMotivo,
} from "@/lib/acciones/admin";
import { db } from "@/lib/db";
import { motivosRotura } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { listarFamilias, listarModelos } from "@/lib/consultas";
import { EditorFilas, type CampoDef } from "@/components/admin/editor";
import { Aviso, Pantalla, Seccion } from "@/components/ui";

export const metadata = { title: "Modelos y familias · Admin" };
export const dynamic = "force-dynamic";

const CAMPOS_BASE = (claveActivo: string): CampoDef[] => [
  { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
  {
    clave: "orden",
    etiqueta: "Orden",
    tipo: "numero",
    ayuda: "En qué orden aparece en los selectores.",
  },
  { clave: claveActivo, etiqueta: "Activo", tipo: "check", soloEdicion: true },
];

export default async function ModelosYFamilias() {
  const [mods, fams, motivos] = await Promise.all([
    listarModelos(),
    listarFamilias(),
    db.select().from(motivosRotura).orderBy(asc(motivosRotura.nombre)),
  ]);

  return (
    <Pantalla titulo="Modelos y familias">
      <div className="mb-4">
        <Aviso>
          El <strong>modelo</strong> es la forma de la pieza. La{" "}
          <strong>familia</strong> es con qué se puede compartir molde: dos tonos
          de beige comparten, un gris y un beige no, y cemento gris con cemento
          blanco tampoco. No es el color exacto — ese vive en el producto.
        </Aviso>
      </div>

      <Seccion titulo="Modelos" cantidad={mods.length}>
        <EditorFilas
          campos={CAMPOS_BASE("activo")}
          accion={guardarModelo}
          etiquetaNuevo="Nuevo modelo"
          filas={mods.map((m) => ({
            id: m.id,
            titulo: m.nombre,
            etiquetas: m.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }],
            valores: { nombre: m.nombre, orden: m.orden, activo: m.activo },
          }))}
        />
      </Seccion>

      <Seccion titulo="Familias" cantidad={fams.length}>
        <EditorFilas
          campos={CAMPOS_BASE("activa")}
          accion={guardarFamilia}
          etiquetaNuevo="Nueva familia"
          filas={fams.map((f) => ({
            id: f.id,
            titulo: f.nombre,
            etiquetas: f.activa ? [] : [{ texto: "de baja", tono: "rojo" as const }],
            valores: { nombre: f.nombre, orden: f.orden, activa: f.activa },
          }))}
        />
      </Seccion>

      <Seccion
        titulo="Motivos de rotura"
        cantidad={motivos.length}
        ayuda="Los que elige empaque cuando salieron menos paquetes de los que correspondían."
      >
        <EditorFilas
          campos={[
            { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
          ]}
          accion={guardarMotivo}
          etiquetaNuevo="Nuevo motivo"
          filas={motivos.map((m) => ({
            id: m.id,
            titulo: m.nombre,
            etiquetas: m.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }],
            valores: { nombre: m.nombre, activo: m.activo },
          }))}
        />
      </Seccion>
    </Pantalla>
  );
}
