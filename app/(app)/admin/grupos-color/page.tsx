import { guardarGrupoColor } from "@/lib/acciones/admin";
import { listarGruposColor, listarProductos } from "@/lib/consultas";
import { secuencia } from "@/lib/escala";
import { EditorFilas, type CampoDef } from "@/components/admin/editor";
import { Muestra } from "@/components/selector-producto";
import { Aviso, Pantalla, Seccion } from "@/components/ui";

export const metadata = { title: "Grupos de color · Admin" };
export const dynamic = "force-dynamic";

/**
 * Grupos de color: que productos llevan la misma formula. Los productos se
 * tildan desde el grupo; tambien se puede elegir el grupo desde el producto.
 */
export default async function GruposColor() {
  const [grupos, prods] = await Promise.all([listarGruposColor(), listarProductos()]);
  const activos = prods.filter((x) => x.p.activo);
  const nombreGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));
  const sinGrupo = activos.filter((x) => x.p.grupoColorId === null);

  const campos: CampoDef[] = [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true, ayuda: "Ej: Gris 1, Gris Green Deck, Beige Ekos." },
    { clave: "nota", etiqueta: "Nota (opcional)", tipo: "texto", ayuda: "Ej: la fórmula o el pigmento." },
    { clave: "orden", etiqueta: "Orden", tipo: "numero", ayuda: "En qué orden aparece en las listas." },
    {
      clave: "productos",
      etiqueta: "Productos de este grupo",
      tipo: "varios",
      opciones: activos.map((x) => ({
        valor: x.p.id,
        texto: x.p.grupoColorId ? `${x.p.nombre} (${nombreGrupo.get(x.p.grupoColorId)})` : x.p.nombre,
      })),
      ayuda: "Un producto tiene un solo grupo: si tildás uno que estaba en otro, se pasa a este.",
    },
    { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
  ];

  const tono = secuencia(2);
  return (
    <Pantalla titulo="Grupos de color">
      <div className="mb-4">
        <Aviso>
          Un <strong>grupo de color</strong> es una misma fórmula: los productos del grupo se pueden producir seguidos
          sin lavar el trompo. No es la <strong>familia</strong>, que dice con qué estanterías se llena. Por ejemplo,
          Listón Gris y Uhma Gris van juntos, y Green Deck Liso y Green Deck Pino son otro gris.
        </Aviso>
      </div>

      <Seccion tono={tono()} titulo="Grupos" cantidad={grupos.length}>
        <EditorFilas
          campos={campos}
          accion={guardarGrupoColor}
          etiquetaNuevo="Nuevo grupo de color"
          filas={grupos.map((g) => {
            const suyos = prods.filter((x) => x.p.grupoColorId === g.id);
            return {
              id: g.id,
              titulo: g.nombre,
              subtitulo:
                (suyos.length ? suyos.map((x) => x.p.nombre).join(" · ") : "Sin productos todavía") +
                (g.nota ? ` — ${g.nota}` : ""),
              etiquetas: [
                ...(g.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }]),
                { texto: `${suyos.length} producto${suyos.length === 1 ? "" : "s"}`, tono: "gris" as const },
              ],
              valores: {
                nombre: g.nombre,
                nota: g.nota ?? "",
                orden: g.orden,
                productos: suyos.map((x) => x.p.id).join(","),
                activo: g.activo,
              },
            };
          })}
        />
      </Seccion>

      <Seccion
        tono={tono()}
        titulo="Productos sin grupo"
        cantidad={sinGrupo.length}
        ayuda="Productos activos que todavía no tienen fórmula asignada. Se asignan tildándolos en un grupo, o desde Productos."
      >
        {sinGrupo.length === 0 ? (
          <p className="text-sm text-emerald-700">✓ Todos los productos activos tienen grupo.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sinGrupo.map((x) => (
              <li
                key={x.p.id}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-200"
              >
                <Muestra nombre={x.p.nombre} familia={x.familia} />
                {x.p.nombre}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </Pantalla>
  );
}
