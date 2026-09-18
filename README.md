# Bloom — prototipo móvil de aprendizaje de inglés

Prototipo de diseño construido sobre la base existente de Next.js 16.3.3 y React 19. Mantiene una superficie móvil en teléfonos y una previsualización compacta en escritorio. No es una aplicación nativa compilada para iOS o Android.

## Recorridos

- **Hoy**: siguiente paso recomendado, evaluación inicial, meta diaria e intereses.
- **Palabras**: colección de ejemplo, búsqueda, filtros, pronunciación del navegador y tarjetas de repaso. Las respuestas cambian la familiaridad y el próximo intervalo en memoria.
- **Conversar**: selector visual GPT Live 1 / Gemini 3.8 Live y tres conversaciones guiadas con correcciones predeterminadas. No usa micrófono, modelos remotos ni llamadas de pago.
- **Jugar**: emparejar vocabulario, ordenar frases y elegir traducciones. Los juegos de vocabulario priorizan las expresiones con menor familiaridad.
- **Progreso**: resultado orientativo de cinco preguntas, repasos, puntos y distribución de familiaridad.

La información se conserva entre pantallas durante la sesión y se reinicia al recargar. Los minutos de la tarjeta diaria son una estimación de demostración basada en los repasos. La puntuación de nivel solo ilustra el recorrido: no es una evaluación validada de dominio del idioma.

## Diseño móvil

Tipografía del sistema, navegación inferior, áreas seguras, altura dinámica, desplazamiento por pantalla, paneles inferiores con foco modal, controles táctiles, tema claro/oscuro y respeto a reducción de movimiento y transparencia. La pronunciación utiliza `speechSynthesis` y depende de las voces disponibles en el dispositivo.

## Desarrollo local

```sh
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
```

Si el lanzador global de pnpm intenta reinstalar dependencias pese a estar presentes, se pueden ejecutar las herramientas instaladas directamente:

```sh
node node_modules/next/dist/bin/next dev
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
```

`allowedDevOrigins` incluye únicamente la dirección LAN observada durante la previsualización móvil. Debe actualizarse si cambia la dirección del servidor local.

## Integraciones de la siguiente etapa

No se ha configurado ni desplegado backend. Convex será la fuente de verdad para estudiantes, intereses, vocabulario, historial de ejercicios, evaluaciones, dominio por palabra y fechas de repetición espaciada. Las tablas, autenticación, permisos y funciones se definirán en la etapa de implementación.

Los nombres de modelos son las etiquetas solicitadas para el diseño, no identificadores de API verificados. Antes de integrar voz se deben comprobar disponibilidad, nombres e interfaces oficiales, utilizar credenciales efímeras apropiadas y mantener los secretos en servidor. El tutor debe limitarse a enseñanza del idioma y conversaciones con objetivo pedagógico; el texto del prototipo no implementa esa política en un modelo real.

Se conserva como requisito la evaluación adaptativa con «jev de TypesafeAI». Falta identificar el producto/SDK exacto antes de diseñar esa integración. El motor real debe evaluar comprensión y uso contextual, actualizar dominio y nivel y ajustar los intervalos; el prototipo solo demuestra visualmente esos conceptos.

Para una entrega nativa, esta interfaz sirve de referencia para componentes y navegación nativa de iOS/Android; todavía no hay binarios ni validación en dispositivos físicos.
