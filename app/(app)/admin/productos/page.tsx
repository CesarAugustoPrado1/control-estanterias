import { guardarProducto } from "@/lib/acciones/admin";
import { listarFamilias, listarModelos, listarProductos } from "@/lib/consultas";
import { cantidadSalida, convertir, UNIDAD_SALIDA } from "@/lib/estados";
import { ETIQUETA_ARIDO } from "@/lib/tarjetas";
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
      clave: "unidad",
      etiqueta: "Unidad de salida",
      tipo: "select",
      requerido: true,
      opciones: [
        { valor: "paquete", texto: "Paquete" },
        { valor: "unidad", texto: "Unidad" },
        { valor: "nivel", texto: "Nivel de palet" },
      ],
      ayuda: "Cómo se cuenta lo que sale de empaque. Por ejemplo, el Green Deck liso sale por unidad.",
    },
    {
      clave: "piezasPorPaquete",
      etiqueta: "Piezas por unidad de salida",
      tipo: "numero",
      requerido: true,
      ayuda: "Cuántas piezas lleva un paquete, una unidad o un nivel de palet. Casi siempre 1 en paquete y unidad.",
    },
    {
      clave: "m2PorPaquete",
      etiqueta: "m² por unidad de salida",
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
    {
      clave: "arido",
      etiqueta: "Árido",
      tipo: "select",
      requerido: true,
      opciones: [
        { valor: "alivianado", texto: "Alivianado (granulado volcánico + dolomita)" },
        { valor: "hormigon", texto: "Hormigón (arena + piedra)" },
      ],
      ayuda: "La fórmula del producto. No cambia en qué estanterías se puede llenar.",
    },
    {
      clave: "codigoPlataformaProceso",
      etiqueta: "Código Plataforma · producto en proceso",
      tipo: "texto",
      ayuda: "El código del ERP. Opcional por ahora; no se puede repetir entre productos.",
    },
    {
      clave: "codigoPlataformaTerminado",
      etiqueta: "Código Plataforma · producto terminado",
      tipo: "texto",
      ayuda: "El código del ERP. Opcional por ahora; no se puede repetir entre productos.",
    },
    { clave: "requiereTunel", etiqueta: "Pasa por el túnel", tipo: "check" },
    { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
  ];

  const filas = prods.map((x) => {
    const ej = convertir(40, x.p.piezasPorMolde, x.p.piezasPorPaquete);
    return {
      id: x.p.id,
      titulo: x.p.nombre,
      subtitulo:
        `${x.modelo} · ${x.familia} · ${ETIQUETA_ARIDO[x.p.arido]} · 40 moldes dan ${cantidadSalida(ej.paquetes, x.p.unidad)}` +
        (x.p.m2PorPaquete ? ` · ${x.p.m2PorPaquete} m²/${UNIDAD_SALIDA[x.p.unidad].corto}` : "") +
        (x.p.codigoPlataformaProceso || x.p.codigoPlataformaTerminado
          ? ` · Plataforma ${x.p.codigoPlataformaProceso ?? "—"} / ${x.p.codigoPlataformaTerminado ?? "—"}`
          : ""),
      etiquetas: [
        ...(x.p.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }]),
        ...(x.p.cemento === "blanco" ? [{ texto: "CEMENTO BLANCO", tono: "gris" as const }] : []),
        ...(x.p.requiereTunel ? [] : [{ texto: "sin túnel", tono: "ambar" as const }]),
        ...(x.p.piezasPorPaquete > 1
          ? [{ texto: `${x.p.piezasPorPaquete} piezas/${UNIDAD_SALIDA[x.p.unidad].uno}`, tono: "gris" as const }]
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
        unidad: x.p.unidad,
        m2PorPaquete: x.p.m2PorPaquete ?? "",
        requiereTunel: x.p.requiereTunel,
        cemento: x.p.cemento,
        arido: x.p.arido,
        codigoPlataformaProceso: x.p.codigoPlataformaProceso ?? "",
        codigoPlataformaTerminado: x.p.codigoPlataformaTerminado ?? "",
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
