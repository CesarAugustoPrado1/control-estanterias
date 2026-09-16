import { guardarUsuario } from "@/lib/acciones/admin";
import { listarUsuarios } from "@/lib/consultas";
import { rolEnum } from "@/lib/db/schema";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { fechaHora } from "@/lib/formato";
import { EditorFilas, type CampoDef } from "@/components/admin/editor";
import { Aviso, Pantalla, Seccion } from "@/components/ui";

export const metadata = { title: "Usuarios · Admin" };
export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const us = await listarUsuarios();
  const ahora = new Date();

  const campos: CampoDef[] = [
    {
      clave: "usuario",
      etiqueta: "Usuario",
      tipo: "texto",
      requerido: true,
      ayuda: "Con lo que entra. Sin espacios ni mayúsculas.",
    },
    { clave: "nombre", etiqueta: "Nombre y apellido", tipo: "texto", requerido: true },
    {
      clave: "rol",
      etiqueta: "Rol",
      tipo: "select",
      requerido: true,
      opciones: rolEnum.enumValues.map((r) => ({ valor: r, texto: ETIQUETA_ROL[r] })),
    },
    {
      clave: "pin",
      etiqueta: "PIN",
      tipo: "pin",
      ayuda: "4 a 8 dígitos. Al editar, dejalo vacío para no cambiarlo.",
    },
    { clave: "activo", etiqueta: "Activo", tipo: "check", soloEdicion: true },
  ];

  return (
    <Pantalla titulo="Usuarios">
      <div className="mb-4">
        <Aviso>
          El nombre queda copiado en cada movimiento que la persona registra, así
          que el historial se sigue leyendo aunque después se lo cambies. Dar de
          baja a alguien le corta la sesión en el próximo request, no a los 30 días.
        </Aviso>
      </div>

      <Seccion titulo="Listado" cantidad={us.length}>
        <EditorFilas
          campos={campos}
          accion={guardarUsuario}
          etiquetaNuevo="Nuevo usuario"
          filas={us.map((u) => {
            const bloqueado = u.bloqueadoHasta && u.bloqueadoHasta > ahora;
            return {
              id: u.id,
              titulo: u.nombre,
              subtitulo: `${u.usuario} · ${ETIQUETA_ROL[u.rol]}`,
              etiquetas: [
                ...(u.activo ? [] : [{ texto: "de baja", tono: "rojo" as const }]),
                ...(bloqueado
                  ? [
                      {
                        texto: `bloqueado hasta ${fechaHora(u.bloqueadoHasta)}`,
                        tono: "ambar" as const,
                      },
                    ]
                  : []),
              ],
              valores: {
                usuario: u.usuario,
                nombre: u.nombre,
                rol: u.rol,
                pin: "",
                activo: u.activo,
              },
              bloqueada: bloqueado
                ? "Se pasó de intentos con el PIN. Guardá un PIN nuevo acá para destrabarlo en el momento."
                : undefined,
            };
          })}
        />
      </Seccion>
    </Pantalla>
  );
}
