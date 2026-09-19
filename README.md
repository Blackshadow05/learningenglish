# Bloom — prototipo móvil de aprendizaje de inglés

Prototipo de diseño construido sobre la base existente de Next.js 16.3.3 y React 19. Mantiene una superficie móvil en teléfonos y una previsualización compacta en escritorio. No es una aplicación nativa compilada para iOS o Android.

## Recorridos

- **Hoy**: siguiente paso recomendado, evaluación inicial, meta diaria e intereses.
- **Palabras**: colección de ejemplo, búsqueda, filtros, pronunciación del navegador y tarjetas de repaso. Las respuestas cambian la familiaridad y el próximo intervalo en memoria.
- **Conversar**: Gemini Live con modos Conversar, Aprender y Simular. Conversación libre, profesor con explicaciones o situaciones de hotel con elección de huésped/colaborador, tres escenarios y situación personalizada. Voz a pantalla completa, manos libres o mantener pulsado, ayudas durante la sesión, transcripción opcional y alternativa para escribir. Repaso final con evidencia de la transcripción.
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

La voz necesita HTTPS o localhost y permiso del micrófono. AudioWorklet envía PCM de 16 kHz; la reproducción usa un contexto de 24 kHz. Manos libres usa sensibilidad de inicio baja, 250 ms de prefijo y 1200 ms de silencio, con cancelación de eco y supresión de ruido solicitadas al navegador, sin ganancia automática. Son valores iniciales que requieren calibración con dispositivos reales. Al silenciar se desactiva la pista y se envía `audioStreamEnd`, según la [documentación de Gemini Live](https://ai.google.dev/gemini-api/docs/live-api/capabilities).

En mantener pulsado se desactiva el VAD automático y se envían `activityStart`/`activityEnd`. La pista solo se habilita al pulsar. Al soltar, el worklet vacía el último paquete parcial antes de cerrar el turno; hay un límite de 250 ms si el hilo de audio se suspende. Soltar, cancelar el gesto, perder el foco o esconder la página termina la pulsación. También admite Espacio/Enter. El estado de reproducción se mantiene hasta terminar el último bloque, aunque la generación ya haya acabado.

Escribir silencia el micrófono; se reactiva explícitamente con el control central. Cancelar, salir de la página, perder la conexión o desconectar el micrófono libera los recursos de audio. Las preferencias se guardan en este navegador, sin tema ni transcripciones. No equivalen a un perfil autenticado ni se sincronizan entre dispositivos.

El usuario elige correcciones durante la práctica, al terminar o solo a petición, y explicaciones en español/inglés. Las ayudas permiten repetir, bajar el ritmo, pedir una explicación, retomar la conversación o intercambiar papeles. Los cambios hablados se reflejan mediante `actualizar_contexto`.

Al terminar, el micrófono se detiene inmediatamente. Si corresponde un repaso, la misma conexión solicita `entregar_resumen`, con un máximo de 15 segundos antes de liberar todo. Se aceptan un logro y hasta dos correcciones cuyas citas existan en las intervenciones del alumno; no se califican pronunciación ni nivel desde texto. Una cita existente verifica la procedencia, no garantiza la calidad pedagógica del modelo. Si falla, la interfaz lo indica y conserva la transcripción. «Solo si lo pido» no genera repaso automático; permite pedirlo desde las ayudas. Transcripciones y resumen viven en memoria, sin historial remoto.

`pnpm test:voice` (o `node --test tests/live-session.test.mjs`) verifica el controlador con dispositivos y transporte simulados: cancelación durante permisos/token/conexión, errores, silencio, transcripciones, interrupciones, cola de reproducción, turnos manuales, vaciado del worklet, configuración y repaso con evidencia. No utiliza el micrófono ni consume la API. La calidad percibida, el eco y la latencia deben comprobarse también con micrófono y altavoces o auriculares reales.

Para actualizar una instalación existente, publicar primero las funciones de Convex en el destino autorizado y después el cliente Next.js. `configuracion` es opcional en `crearTokenLive` para mantener compatibilidad con el cliente anterior. El nuevo cliente requiere ese argumento habilitado en el servidor. No hay cambios de esquema ni migraciones de datos.

## Integraciones y próximos pasos

Convex ya sirve vocabulario, escenarios y tokens de conversación. El progreso del estudiante, historial de ejercicios, evaluaciones y fechas de repetición espaciada todavía se mantienen en memoria en la interfaz.

Se conserva como requisito la evaluación adaptativa con «jev de TypesafeAI». Falta identificar el producto/SDK exacto antes de diseñar esa integración. El motor real debe evaluar comprensión y uso contextual, actualizar dominio y nivel y ajustar los intervalos; el prototipo solo demuestra visualmente esos conceptos.

Para una entrega nativa, esta interfaz sirve de referencia para componentes y navegación nativa de iOS/Android; todavía no hay binarios ni validación en dispositivos físicos.
