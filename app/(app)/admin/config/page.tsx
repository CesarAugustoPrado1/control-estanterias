import { capacidadHorno } from "@/lib/acciones/motor";
import { guardarConfig } from "@/lib/acciones/admin";
import { ocupacionHorno } from "@/lib/estadisticas";
import { Pantalla, Seccion } from "@/components/ui";
import { FormularioConfig } from "./formulario";

export const metadata = { title: "Parámetros · Admin" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const [cupo, adentro] = await Promise.all([capacidadHorno(), ocupacionHorno()]);

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
    </Pantalla>
  );
}
