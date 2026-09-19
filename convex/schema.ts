import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const nivelIngles = v.union(
  v.literal("sin_evaluar"),
  v.literal("A1"),
  v.literal("A2"),
  v.literal("B1"),
  v.literal("B2"),
  v.literal("C1"),
  v.literal("C2")
);

export const proveedorVoz = v.union(v.literal("openai"), v.literal("gemini"), v.literal("mini"));

export const estadoDominio = v.union(
  v.literal("nuevo"),
  v.literal("aprendiendo"),
  v.literal("repasando"),
  v.literal("dominado")
);

export const tipoContenido = v.union(
  v.literal("palabra"),
  v.literal("frase"),
  v.literal("expresion"),
  v.literal("phrasal_verb")
);

export const tipoFrase = v.union(
  v.literal("frase"),
  v.literal("expresion"),
  v.literal("phrasal_verb")
);

export const nivelBasico = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3)
);

export const areaHotel = v.union(
  v.literal("general"),
  v.literal("recepcion"),
  v.literal("valet"),
  v.literal("guarda"),
  v.literal("housekeeping")
);

export const tipoActividad = v.union(
  v.literal("evaluacion_inicial"),
  v.literal("vocabulario"),
  v.literal("conversacion"),
  v.literal("escucha"),
  v.literal("pronunciacion"),
  v.literal("emparejar"),
  v.literal("ordenar_frase"),
  v.literal("elegir_significado")
);

export const estadoSesion = v.union(
  v.literal("iniciada"),
  v.literal("completada"),
  v.literal("abandonada"),
  v.literal("error")
);

export const tipoObjetivoEvaluacion = v.union(
  v.literal("intento"),
  v.literal("turno_conversacion"),
  v.literal("sesion_practica"),
  v.literal("vocabulario")
);

export const decisionRepaso = v.union(
  v.literal("reaprender"),
  v.literal("repasar_pronto"),
  v.literal("mantener_intervalo"),
  v.literal("ampliar_intervalo")
);

export default defineSchema({
  usuarios: defineTable({
    identificadorToken: v.string(),
    nombre: v.string(),
    idiomaNativo: v.string(),
    nivelActual: nivelIngles,
    objetivoMinutosDiarios: v.number(),
    proveedorVozPreferido: proveedorVoz,
    modeloOpenAI: v.string(),
    modeloGemini: v.string(),
    zonaHoraria: v.string(),
    evaluacionInicialCompletada: v.boolean(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("por_identificador_token", ["identificadorToken"])
    .index("por_nivel_actual", ["nivelActual"]),

  intereses: defineTable({
    clave: v.string(),
    nombre: v.string(),
    descripcion: v.optional(v.string()),
    icono: v.optional(v.string()),
    activo: v.boolean(),
    orden: v.number(),
  })
    .index("por_clave", ["clave"])
    .index("por_activo_y_orden", ["activo", "orden"]),

  interesesUsuario: defineTable({
    usuarioId: v.id("usuarios"),
    interesId: v.id("intereses"),
    prioridad: v.number(),
    creadoEn: v.number(),
  })
    .index("por_usuario", ["usuarioId"])
    .index("por_usuario_y_interes", ["usuarioId", "interesId"])
    .index("por_interes", ["interesId"]),

  vocabulario: defineTable({
    textoIngles: v.string(),
    traduccionEspanol: v.string(),
    pronunciacionIPA: v.optional(v.string()),
    explicacionEspanol: v.optional(v.string()),
    ejemploIngles: v.string(),
    ejemploEspanol: v.optional(v.string()),
    nivel: nivelIngles,
    nivelBasico: v.optional(nivelBasico),
    area: v.optional(areaHotel),
    tipo: tipoContenido,
    categoria: v.string(),
    interesId: v.optional(v.id("intereses")),
    etiquetas: v.array(v.string()),
    audioId: v.optional(v.id("_storage")),
    activo: v.boolean(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("por_texto_ingles", ["textoIngles"])
    .index("por_nivel_y_activo", ["nivel", "activo"])
    .index("por_nivel_basico_y_activo", ["nivelBasico", "activo"])
    .index("por_area_y_nivel_basico", ["area", "nivelBasico"])
    .index("por_categoria_y_activo", ["categoria", "activo"])
    .index("por_interes_y_nivel", ["interesId", "nivel"])
    .index("por_tipo_y_nivel", ["tipo", "nivel"])
    .searchIndex("buscar_vocabulario", {
      searchField: "textoIngles",
      filterFields: ["nivel", "categoria", "activo"],
    }),

  frases: defineTable({
    textoIngles: v.string(),
    traduccionEspanol: v.string(),
    pronunciacionIPA: v.optional(v.string()),
    explicacionEspanol: v.optional(v.string()),
    ejemploIngles: v.optional(v.string()),
    ejemploEspanol: v.optional(v.string()),
    nivel: nivelIngles,
    nivelBasico: v.optional(nivelBasico),
    area: v.optional(areaHotel),
    tipo: tipoFrase,
    categoria: v.string(),
    interesId: v.optional(v.id("intereses")),
    etiquetas: v.array(v.string()),
    audioId: v.optional(v.id("_storage")),
    activo: v.boolean(),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("por_texto_ingles", ["textoIngles"])
    .index("por_nivel_y_activo", ["nivel", "activo"])
    .index("por_nivel_basico_y_activo", ["nivelBasico", "activo"])
    .index("por_area_y_nivel_basico", ["area", "nivelBasico"])
    .index("por_categoria_y_activo", ["categoria", "activo"])
    .index("por_interes_y_nivel", ["interesId", "nivel"])
    .index("por_tipo_y_nivel", ["tipo", "nivel"])
    .searchIndex("buscar_frases", {
      searchField: "textoIngles",
      filterFields: ["nivel", "categoria", "activo"],
    }),

  progresoVocabulario: defineTable({
    usuarioId: v.id("usuarios"),
    vocabularioId: v.optional(v.id("vocabulario")),
    fraseId: v.optional(v.id("frases")),
    estadoDominio: estadoDominio,
    // Validar en mutaciones: 0 <= dominioGeneral <= 1
    dominioGeneral: v.number(),
    // Validar en mutaciones: 0 <= dominioReconocimiento <= 1
    dominioReconocimiento: v.number(),
    // Validar en mutaciones: 0 <= dominioRecuerdo <= 1
    dominioRecuerdo: v.number(),
    // Validar en mutaciones: 0 <= dominioUsoContextual <= 1
    dominioUsoContextual: v.number(),
    // Validar en mutaciones: 0 <= dominioEscucha <= 1
    dominioEscucha: v.number(),
    // Validar en mutaciones: 0 <= dominioPronunciacion <= 1
    dominioPronunciacion: v.number(),
    factorFacilidad: v.number(),
    intervaloDias: v.number(),
    repeticionesCorrectas: v.number(),
    fallos: v.number(),
    proximoRepasoEn: v.number(),
    ultimoRepasoEn: v.optional(v.number()),
    ultimoResultado: v.optional(v.string()),
    creadoEn: v.number(),
    actualizadoEn: v.number(),
  })
    .index("por_usuario_y_vocabulario", ["usuarioId", "vocabularioId"])
    .index("por_usuario_y_frase", ["usuarioId", "fraseId"])
    .index("por_usuario_y_proximo_repaso", ["usuarioId", "proximoRepasoEn"])
    .index("por_usuario_y_estado_dominio", ["usuarioId", "estadoDominio"])
    .index("por_vocabulario", ["vocabularioId"])
    .index("por_frase", ["fraseId"]),

  evaluacionesIniciales: defineTable({
    usuarioId: v.id("usuarios"),
    estado: estadoSesion,
    nivelEstimado: v.optional(nivelIngles),
    // Validar en mutaciones: 0 <= puntajeGeneral <= 1
    puntajeGeneral: v.optional(v.number()),
    // Validar en mutaciones: 0 <= puntajeGramatica <= 1
    puntajeGramatica: v.optional(v.number()),
    // Validar en mutaciones: 0 <= puntajeVocabulario <= 1
    puntajeVocabulario: v.optional(v.number()),
    // Validar en mutaciones: 0 <= puntajeEscucha <= 1
    puntajeEscucha: v.optional(v.number()),
    // Validar en mutaciones: 0 <= puntajeHabla <= 1
    puntajeHabla: v.optional(v.number()),
    iniciadaEn: v.number(),
    completadaEn: v.optional(v.number()),
    versionEvaluacion: v.string(),
  })
    .index("por_usuario_y_fecha", ["usuarioId", "iniciadaEn"])
    .index("por_usuario_y_estado", ["usuarioId", "estado"]),

  respuestasEvaluacion: defineTable({
    evaluacionId: v.id("evaluacionesIniciales"),
    usuarioId: v.id("usuarios"),
    tipoActividad: tipoActividad,
    preguntaClave: v.string(),
    pregunta: v.string(),
    respuestaEstudiante: v.optional(v.string()),
    respuestaEsperada: v.optional(v.string()),
    esCorrecta: v.optional(v.boolean()),
    // Validar en mutaciones: 0 <= puntaje <= 1
    puntaje: v.optional(v.number()),
    tiempoRespuestaMs: v.optional(v.number()),
    ayudasUsadas: v.number(),
    respondidaEn: v.number(),
  })
    .index("por_evaluacion", ["evaluacionId"])
    .index("por_usuario_y_fecha", ["usuarioId", "respondidaEn"])
    .index("por_evaluacion_y_pregunta", ["evaluacionId", "preguntaClave"]),

  sesionesPractica: defineTable({
    usuarioId: v.id("usuarios"),
    tipoActividad: tipoActividad,
    estado: estadoSesion,
    proveedorVoz: v.optional(proveedorVoz),
    modeloVoz: v.optional(v.string()),
    interesId: v.optional(v.id("intereses")),
    escenario: v.optional(v.string()),
    nivelAlIniciar: nivelIngles,
    duracionSegundos: v.optional(v.number()),
    cantidadIntentos: v.number(),
    cantidadAciertos: v.number(),
    cantidadCorrecciones: v.number(),
    resumen: v.optional(v.string()),
    iniciadaEn: v.number(),
    finalizadaEn: v.optional(v.number()),
  })
    .index("por_usuario_y_fecha", ["usuarioId", "iniciadaEn"])
    .index("por_usuario_y_tipo", ["usuarioId", "tipoActividad"])
    .index("por_usuario_y_estado", ["usuarioId", "estado"]),

  intentosAprendizaje: defineTable({
    usuarioId: v.id("usuarios"),
    sesionId: v.optional(v.id("sesionesPractica")),
    vocabularioId: v.optional(v.id("vocabulario")),
    fraseId: v.optional(v.id("frases")),
    tipoActividad: tipoActividad,
    contenidoPresentado: v.string(),
    respuestaEstudiante: v.optional(v.string()),
    respuestaEsperada: v.optional(v.string()),
    transcripcion: v.optional(v.string()),
    audioId: v.optional(v.id("_storage")),
    esCorrecta: v.optional(v.boolean()),
    // Validar en mutaciones: 0 <= puntaje <= 1
    puntaje: v.optional(v.number()),
    // Validar en mutaciones: 0 <= confianzaTranscripcion <= 1
    confianzaTranscripcion: v.optional(v.number()),
    duracionAudioMs: v.optional(v.number()),
    tiempoRespuestaMs: v.optional(v.number()),
    ayudasUsadas: v.number(),
    creadoEn: v.number(),
  })
    .index("por_usuario_y_fecha", ["usuarioId", "creadoEn"])
    .index("por_sesion_y_fecha", ["sesionId", "creadoEn"])
    .index("por_usuario_y_vocabulario", ["usuarioId", "vocabularioId"])
    .index("por_vocabulario_y_fecha", ["vocabularioId", "creadoEn"])
    .index("por_usuario_y_frase", ["usuarioId", "fraseId"])
    .index("por_frase_y_fecha", ["fraseId", "creadoEn"]),

  evaluacionesJev: defineTable({
    usuarioId: v.id("usuarios"),
    tipoObjetivo: tipoObjetivoEvaluacion,
    intentoId: v.optional(v.id("intentosAprendizaje")),
    sesionId: v.optional(v.id("sesionesPractica")),
    vocabularioId: v.optional(v.id("vocabulario")),
    fraseId: v.optional(v.id("frases")),
    // Validar en mutaciones: 0 <= comprensionSignificado <= 1
    comprensionSignificado: v.optional(v.number()),
    // Validar en mutaciones: 0 <= usoContextual <= 1
    usoContextual: v.optional(v.number()),
    // Validar en mutaciones: 0 <= gramatica <= 1
    gramatica: v.optional(v.number()),
    // Validar en mutaciones: 0 <= fluidez <= 1
    fluidez: v.optional(v.number()),
    // Validar en mutaciones: 0 <= escucha <= 1
    escucha: v.optional(v.number()),
    // Validar en mutaciones: 0 <= pronunciacion <= 1
    pronunciacion: v.optional(v.number()),
    // Validar en mutaciones: 0 <= recordadoSinAyuda <= 1
    recordadoSinAyuda: v.optional(v.number()),
    // Validar en mutaciones: 0 <= confianzaEvaluacion <= 1
    confianzaEvaluacion: v.number(),
    decisionRepaso: decisionRepaso,
    tipoError: v.optional(v.string()),
    modeloJev: v.string(),
    versionCriterios: v.string(),
    creadoEn: v.number(),
  })
    .index("por_usuario_y_fecha", ["usuarioId", "creadoEn"])
    .index("por_intento", ["intentoId"])
    .index("por_sesion_y_fecha", ["sesionId", "creadoEn"])
    .index("por_usuario_y_vocabulario", ["usuarioId", "vocabularioId"])
    .index("por_usuario_y_frase", ["usuarioId", "fraseId"])
    .index("por_decision_y_fecha", ["decisionRepaso", "creadoEn"]),

  historialNivel: defineTable({
    usuarioId: v.id("usuarios"),
    nivelAnterior: nivelIngles,
    nivelNuevo: nivelIngles,
    motivo: v.union(
      v.literal("evaluacion_inicial"),
      v.literal("avance_adaptativo"),
      v.literal("ajuste_manual"),
      v.literal("reevaluacion")
    ),
    // Validar en mutaciones: 0 <= puntajeConfianza <= 1
    puntajeConfianza: v.number(),
    evaluacionInicialId: v.optional(v.id("evaluacionesIniciales")),
    sesionId: v.optional(v.id("sesionesPractica")),
    creadoEn: v.number(),
  })
    .index("por_usuario_y_fecha", ["usuarioId", "creadoEn"])
    .index("por_usuario_y_nivel", ["usuarioId", "nivelNuevo"]),

  configuracionAprendizaje: defineTable({
    usuarioId: v.id("usuarios"),
    correccionesDuranteConversacion: v.boolean(),
    mostrarTraducciones: v.boolean(),
    velocidadVoz: v.number(),
    varianteIngles: v.union(
      v.literal("estadounidense"),
      v.literal("britanico")
    ),
    nivelDificultadAdaptativa: v.union(
      v.literal("suave"),
      v.literal("normal"),
      v.literal("intensiva")
    ),
    permitirGrabacionAudio: v.boolean(),
    actualizadoEn: v.number(),
  }).index("por_usuario", ["usuarioId"]),

  // Compact voice-practice memory: only a tiny summary per session, never transcripts.
  progresoConversaciones: defineTable({
    usuarioId: v.optional(v.id("usuarios")),
    nivel: nivelIngles,
    aprendidas: v.array(v.string()),
    porPracticar: v.array(v.string()),
    creadoEn: v.number(),
  }).index("por_usuario_y_fecha", ["usuarioId", "creadoEn"]),
});
