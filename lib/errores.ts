/**
 * Clases de error del sistema. Modulo PURO: sin `server-only`, sin imports.
 *
 * Vive aparte de `acciones/comun.ts` por una razon concreta: `session.ts` las
 * necesita, y `session.ts` lo importa el middleware, que corre en el runtime
 * edge. Cualquier cadena de imports que termine en `server-only` rompe ahi.
 *
 * Son vocabulario del dominio, no del framework, asi que no deberian arrastrar
 * nada de Next ni de la base.
 */

/** Error esperable, que se le muestra al usuario tal cual. Aborta la transaccion. */
export class ErrorDeNegocio extends Error {}

/** Sesion vencida, usuario dado de baja o rol sin permiso. */
export class ErrorDeAutorizacion extends Error {}

/**
 * Falta una variable de entorno o esta mal puesta.
 *
 * Tiene clase propia porque NO es un error inesperado, y esconderlo detras del
 * mensaje generico es lo peor que se puede hacer con el: un deploy sin
 * SESSION_SECRET falla SIEMPRE y de la misma forma, asi que decir "hubo un
 * problema, si vuelve a pasar avisá" manda a alguien a reintentar para siempre
 * un login que no puede funcionar. El mensaje nombra la variable -nunca su
 * valor- porque el que lo lee es justamente quien puede arreglarlo.
 */
export class ErrorDeConfiguracion extends Error {}

export function fallar(mensaje: string): never {
  throw new ErrorDeNegocio(mensaje);
}
