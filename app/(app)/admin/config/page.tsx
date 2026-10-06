import { capacidadHorno, trompoPorDefecto } from "@/lib/acciones/motor";
import { guardarConfig, guardarTrompoDefecto } from "@/lib/acciones/admin";
import { ocupacionHorno } from "@/lib/estadisticas";
import { Pantalla, Seccion } from "@/components/ui";
import { FormularioConfig, FormularioTrompo } from "./formulario";

export const metadata = { title: "Parámetros · Admin" };
export const dynamic = "force-dynamic";

export default async function Config() {
  const [cupo, adentro, trompo] = await Promise.all([
    capacidadHorno(),
    ocupacionHorno(),
    trompoPorDefecto(),
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
    </Pantalla>
  );
}
