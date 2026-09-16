import { guardarEstanteria } from "@/lib/acciones/admin";
import {
  listarEstanterias,
  listarFamilias,
  listarModelos,
} from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { EditorFilas, type CampoDef } from "@/components/admin/editor";
import { Aviso, Pantalla, Seccion } from "@/components/ui";

export const metadata = { title: "Estanterías · Admin" };
export const dynamic = "force-dynamic";

export default async function Estanterias() {
  const [ests, mods, fams] = await Promise.all([
    listarEstanterias(),
    listarModelos(),
    listarFamilias(),
  ]);

  const campos: CampoDef[] = [
    {
      clave: "modeloId",
      etiqueta: "Modelo",
      tipo: "select",
      requerido: true,
      opciones: mods.map((m) => ({ valor: m.id, texto: m.nombre })),
    },
    {
      clave: "familiaId",
      etiqueta: "Familia",
      tipo: "select",
      requerido: true,
      opciones: fams.map((f) => ({ valor: f.id, texto: f.nombre })),
    },
    {
      clave: "numero",
      etiqueta: "Número de placa",
      tipo: "numero",
      requerido: true,
      ayuda: "El que va grabado. Único dentro del mismo modelo y familia.",
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
      ayuda: "Las de cemento blanco llevan los laterales pintados de blanco.",
    },
    {
      clave: "moldes",
      etiqueta: "Cantidad de moldes",
      tipo: "numero",
      requerido: true,
      ayuda: "Los de ESTE grupo. Pueden ser 39, 38 o 40 entre estanterías del mismo producto.",
    },
    {
      clave: "motivo",
      etiqueta: "Motivo del cambio de familia o cemento",
      tipo: "texto",
      soloEdicion: true,
      ayuda: "Solo si cambiás familia o cemento. Es una reasignación: se registra para medir cuánto costó.",
    },
    { clave: "activa", etiqueta: "Activa", tipo: "check", soloEdicion: true },
  ];

  const total = ests.reduce((a, e) => a + (e.activa ? e.moldes : 0), 0);
  const ocupadas = ests.filter((e) => e.ocupadaPor).length;

  return (
    <Pantalla
      titulo="Estanterías"
      bajada={`${ests.length} grupos de moldes · ${numero(total)} moldes activos · ${ocupadas} en el circuito`}
    >
      <div className="mb-4">
        <Aviso>
          Una estantería es un <strong>grupo fijo de moldes</strong>, no un carro:
          los 40 moldes de una son siempre esos 40. El soporte físico se cambia,
          el grupo no, así que la identidad va con los moldes.
        </Aviso>
      </div>

      <Seccion titulo="Listado" cantidad={ests.length}>
        <EditorFilas
          campos={campos}
          filas={ests.map((e) => ({
            id: e.id,
            titulo: e.etiqueta,
            subtitulo: `${e.moldes} moldes · código interno ${e.codigo}`,
            etiquetas: [
              ...(e.cemento === "blanco" ? [{ texto: "CEMENTO BLANCO", tono: "gris" as const }] : []),
              ...(e.numero === null ? [{ texto: "sin número de placa", tono: "rojo" as const }] : []),
              ...(e.reasignaciones ? [{ texto: `${e.reasignaciones} reasignación(es)`, tono: "gris" as const }] : []),
              ...(e.activa ? [] : [{ texto: "de baja", tono: "rojo" as const }]),
              ...(e.ocupadaPor
                ? [{ texto: `en uso: ${e.ocupadaPor}`, tono: "ambar" as const }]
                : [{ texto: "libre", tono: "verde" as const }]),
            ],
            valores: {
              modeloId: e.modeloId,
              familiaId: e.familiaId,
              numero: e.numero,
              cemento: e.cemento,
              moldes: e.moldes,
              motivo: "",
              activa: e.activa,
            },
            bloqueada: e.ocupadaPor
              ? `La tanda ${e.ocupadaPor} está usando esta estantería. Podés corregir moldes o número, pero no cambiar familia ni cemento, ni darla de baja, hasta que se desmolde.`
              : undefined,
          }))}
          accion={guardarEstanteria}
          etiquetaNuevo="Nueva estantería"
        />
      </Seccion>
    </Pantalla>
  );
}
