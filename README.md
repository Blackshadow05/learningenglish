# Bloom — prototipo móvil de aprendizaje de inglés

Prototipo de diseño construido sobre la base existente de Next.js 16.3.3 y React 19. Mantiene una superficie móvil en teléfonos y una previsualización compacta en escritorio. No es una aplicación nativa compilada para iOS o Android.

## Recorridos

- **Hoy**: siguiente paso recomendado, evaluación inicial, meta diaria e intereses.
- **Palabras**: colección de ejemplo, búsqueda, filtros, pronunciación del navegador y tarjetas de repaso. Las respuestas cambian la familiaridad y el próximo intervalo en memoria.
- **Conversar**: conversación de voz con Gemini Live y tres situaciones de hotel. Vista de voz a pantalla completa, saludo automático, escucha continua, interrupciones al hablar, controles de micrófono, transcripción opcional y alternativa para escribir. Al terminar muestra la duración y las intervenciones de la sesión.
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
pnpm test:voice
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

## Conversación de voz

El cliente obtiene un token efímero con `conversacion.crearTokenLive` y conecta directamente con Gemini Live. La clave permanente permanece en Convex. Requiere `NEXT_PUBLIC_CONVEX_URL` en Next.js y `GEMINI_API_KEY` en el deployment de Convex; `GEMINI_MODELO_LIVE` y `GEMINI_VOZ_LIVE` permiten configurar el modelo y la voz. Las sesiones reales consumen la API configurada.

La voz necesita HTTPS o localhost y permiso del micrófono. AudioWorklet envía PCM de 16 kHz; la reproducción usa un contexto de 24 kHz. La detección de turnos e interrupciones la realiza el servicio, con 800 ms de tolerancia al silencio. Al silenciar se desactiva la pista y se envía `audioStreamEnd`, según la [documentación de Gemini Live](https://ai.google.dev/gemini-api/docs/live-api/capabilities). El estado de reproducción se mantiene hasta que termina el último bloque de audio, independientemente de cuándo finalice la generación.

Escribir silencia el micrófono; se reactiva explícitamente con el control central. Cancelar, salir de la página, perder la conexión o desconectar el micrófono libera los recursos de audio. Las transcripciones y el resumen solo viven en memoria durante esta sesión; no se guarda un historial remoto.

`pnpm test:voice` (o `node --test tests/live-session.test.mjs`) verifica el controlador con dispositivos y transporte simulados: cancelación durante permisos/token/conexión, errores, silencio, transcripciones, interrupciones y cola de reproducción. No utiliza el micrófono ni consume la API. La calidad percibida, el eco y la latencia deben comprobarse también con micrófono y altavoces o auriculares reales.

## Integraciones y próximos pasos

Convex ya sirve vocabulario, escenarios y tokens de conversación. El progreso del estudiante, historial de ejercicios, evaluaciones y fechas de repetición espaciada todavía se mantienen en memoria en la interfaz.

Se conserva como requisito la evaluación adaptativa con «jev de TypesafeAI». Falta identificar el producto/SDK exacto antes de diseñar esa integración. El motor real debe evaluar comprensión y uso contextual, actualizar dominio y nivel y ajustar los intervalos; el prototipo solo demuestra visualmente esos conceptos.

Para una entrega nativa, esta interfaz sirve de referencia para componentes y navegación nativa de iOS/Android; todavía no hay binarios ni validación en dispositivos físicos.
