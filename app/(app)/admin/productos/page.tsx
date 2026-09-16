import { guardarProducto } from "@/lib/acciones/admin";
import { listarFamilias, listarModelos, listarProductos } from "@/lib/consultas";
import { convertir } from "@/lib/estados";
import { EditorFilas, type CampoDef } from "@/components/admin/editor";
import { Aviso, Pantalla, Seccion } from "@/components/ui";

export const metadata = { title: "Productos · Admin" };
export const dynamic = "force-dynamic";

export default async function Productos() {
  const [prods, mods, fams] = await Promise.all([
    listarProductos(),
    listarModelos(),
    listarFamilias(),
  ]);

  const campos: CampoDef[] = [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
    {
      clave: "modeloId",
      etiqueta: "Modelo (la forma)",
      tipo: "select",
      requerido: true,
      opciones: mods.map((m) => ({ valor: m.id, texto: m.nombre })),
    },
    {
      clave: "familiaId",
      etiqueta: "Familia (compatibilidad de molde)",
      tipo: "select",
      requerido: true,
      opciones: fams.map((f) => ({ valor: f.id, texto: f.nombre })),
      ayuda: "Determina con qué estanterías se puede llenar.",
    },
    {
      clave: "piezasPorMolde",
      etiqueta: "Piezas por molde",
      tipo: "numero",
      requerido: true,
      ayuda: "Casi siempre 1. Poné 2 si de un molde salen dos piezas.",
    },
    {
      clave: "piezasPorPaquete",
      etiqueta: "Piezas por paquete",
      tipo: "numero",
      requerido: true,
      ayuda: "Casi siempre 1. Poné 2 si hacen falta dos moldes para un paquete.",
    },
    {
      clave: "m2PorPaquete",
      etiqueta: "m² por paquete",
      tipo: "decimal",
      ayuda: "Por ejemplo 0,26. Es lo que convierte la producción a m².",
    },
    {
      clave: "cemento",
      etiqueta: "Cemento",
      tipo: "select",
      requerido: true,
      opciones: [
        { valor: "gris", texto: "Cemento gris" },
        { valor: "blanco", texto: "Cemento blanco" },
      ],
      ayuda: "Solo se puede llenar en estanterías del mismo cemento.",
    },
    { clave: "requiereTunel", etiqueta: "Pasa por el túnel", tipo: "check" },
    { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
  ];

  const filas = prods.map((x) => {
    const ej = convertir(40, x.p.piezasPorMolde, x.p.piezasPorPaquete);
    return {
      id: x.p.id,
      titulo: x.p.nombre,
      subtitulo: `${x.modelo} · ${x.familia} · 40 moldes dan ${ej.paquetes} paquetes${x.p.m2PorPaquete ? ` · ${x.p.m2PorPaquete} m²/paq` : ""}`,
      etiquetas: [
        ...(x.p.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }]),
        ...(x.p.cemento === "blanco" ? [{ texto: "CEMENTO BLANCO", tono: "gris" as const }] : []),
        ...(x.p.requiereTunel ? [] : [{ texto: "sin túnel", tono: "ambar" as const }]),
        ...(x.p.piezasPorPaquete > 1
          ? [{ texto: `${x.p.piezasPorPaquete} piezas/paquete`, tono: "gris" as const }]
          : []),
        ...(x.p.piezasPorMolde > 1
          ? [{ texto: `${x.p.piezasPorMolde} piezas/molde`, tono: "gris" as const }]
          : []),
      ],
      valores: {
        nombre: x.p.nombre,
        modeloId: x.p.modeloId,
        familiaId: x.p.familiaId,
        piezasPorMolde: x.p.piezasPorMolde,
        piezasPorPaquete: x.p.piezasPorPaquete,
        m2PorPaquete: x.p.m2PorPaquete ?? "",
        requiereTunel: x.p.requiereTunel,
        cemento: x.p.cemento,
        activo: x.p.activo,
      },
    };
  });

  return (
    <Pantalla titulo="Productos">
      <div className="mb-4">
        <Aviso>
          Cambiar las conversiones de un producto <strong>no toca el pasado</strong>:
          cada tanda guarda las suyas al llenarse. Si no fuera así, corregir un
          factor reescribiría en silencio la rotura de todos los meses anteriores.
        </Aviso>
      </div>
      <Seccion titulo="Listado" cantidad={prods.length}>
        <EditorFilas
          campos={campos}
          filas={filas}
          accion={guardarProducto}
          etiquetaNuevo="Nuevo producto"
          ayuda="El producto es la forma del molde por el tono exacto."
        />
      </Seccion>
    </Pantalla>
  );
}
