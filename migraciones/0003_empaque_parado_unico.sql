-- 0003 · Un solo desvio de empaque abierto a la vez.
--
-- Separado de 0002 a proposito: nombra el valor de enum que agrega 0002, y cada
-- migracion corre en su propia transaccion. Ver el comentario de 0002.
--
-- El motor valida antes y con un mensaje entendible; este indice es el que hace
-- que dos pantallas abiertas al mismo tiempo no puedan dejar dos desvios
-- abiertos, que despues nadie sabria cual cerrar.

CREATE UNIQUE INDEX IF NOT EXISTS avisos_empaque_parado_idx
  ON estanterias.avisos (tipo)
  WHERE tipo = 'empaque_parado' AND resuelto_en IS NULL;
