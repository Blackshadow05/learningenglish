"use client";

import { useEffect, useRef, useState } from "react";

// Conexión mínima y directa con gpt-realtime-2.1-mini vía WebRTC.
// Sin Agents SDK, sin herramientas, sin segundo modelo, sin transcriptor.
type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "error";

export default function RealtimeEnglishTutor() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function startConversation() {
    if (status === "connecting" || status === "connected" || status === "listening" || status === "speaking") {
      return;
    }

    setError(null);
    setStatus("connecting");

    try {
      // 1. Pedir token temporal a Next.js (la API key real nunca llega al navegador).
      const tokenResponse = await fetch("/api/realtime-token", {
        method: "POST",
        cache: "no-store",
      });
      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error("Token endpoint error:", tokenData);
        throw new Error(
          tokenData?.details?.error?.message ?? tokenData?.error ?? "No se pudo obtener el token de OpenAI"
        );
      }

      const ephemeralKey = tokenData.value as string;
      if (!ephemeralKey) {
        throw new Error("OpenAI no devolvió una credencial efímera");
      }

      // 2. Crear conexión WebRTC.
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // 3. Recibir la voz de GPT.
      pc.ontrack = (event) => {
        const audio = audioRef.current;
        if (!audio) return;
        const remoteStream = event.streams[0];
        if (remoteStream) {
          audio.srcObject = remoteStream;
          audio.play().catch((playError) => {
            console.warn("El navegador bloqueó temporalmente el audio:", playError);
          });
        }
      };

      // 4. Micrófono.
      const microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      microphoneStreamRef.current = microphoneStream;
      for (const track of microphoneStream.getTracks()) {
        pc.addTrack(track, microphoneStream);
      }
      // 5. Canal de eventos.
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.addEventListener("open", () => {
        console.log("Realtime data channel abierto");
        setStatus("listening");
      });

      dc.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("[Realtime event]", message.type, message);

          if (message.type === "input_audio_buffer.speech_started") setStatus("listening");
          if (message.type === "input_audio_buffer.speech_stopped") setStatus("connected");
          if (message.type === "response.created") setStatus("speaking");
          if (message.type === "response.done") {
            setStatus("listening");
            if (message.response?.usage) console.log("[Realtime usage]", message.response.usage);
          }
          if (message.type === "error") {
            console.error("[Realtime error]", message);
            setError(message.error?.message ?? "Error de OpenAI Realtime");
          }
        } catch (parseError) {
          console.error("No se pudo procesar un evento:", parseError);
        }
      });

      dc.addEventListener("close", () => console.log("Realtime data channel cerrado"));
      dc.addEventListener("error", (event) => console.error("Data channel error:", event));

      // 6. Crear SDP offer.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("WebRTC no generó SDP");

      // 7. Conectar directamente a OpenAI usando el token temporal ek_...
      const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      const answerSdp = await realtimeResponse.text();
      if (!realtimeResponse.ok) {
        console.error("WebRTC connection error:", answerSdp);
        throw new Error(`OpenAI Realtime rechazó la conexión: ${answerSdp}`);
      }

      // 8. Aplicar SDP answer.
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setStatus("connected");
      console.log("Conectado a gpt-realtime-2.1-mini");
    } catch (err) {
      console.error("Error iniciando Realtime:", err);
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(message);
      setStatus("error");
      stopConversation();
    }
  }
  function stopConversation() {
    // IMPORTANTE: detener realmente el micrófono.
    const stream = microphoneStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    microphoneStreamRef.current = null;

    try { dataChannelRef.current?.close(); } catch { /* puede estar cerrado */ }
    dataChannelRef.current = null;

    try { peerConnectionRef.current?.close(); } catch { /* puede estar cerrado */ }
    peerConnectionRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }

    setStatus("disconnected");
  }

  function muteMicrophone() {
    const stream = microphoneStreamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = false;
  }

  function unmuteMicrophone() {
    const stream = microphoneStreamRef.current;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = true;
  }

  // Si el usuario cambia de página, cerramos completamente la conexión.
  useEffect(() => {
    return () => {
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      try { dataChannelRef.current?.close(); } catch { /* puede estar cerrado */ }
      try { peerConnectionRef.current?.close(); } catch { /* puede estar cerrado */ }
    };
  }, []);

  const connected = status === "connected" || status === "listening" || status === "speaking";

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <audio ref={audioRef} autoPlay />

      <div>
        <h1 className="text-2xl font-bold">English Tutor</h1>
        <p className="mt-2 text-sm text-gray-500">GPT-Realtime-2.1 Mini</p>
      </div>

      <div className="rounded-xl border p-4">
        <p>Estado: <strong>{status}</strong></p>
        {error && <p className="mt-3 text-red-600">{error}</p>}
      </div>

      {!connected ? (
        <button
          type="button"
          onClick={startConversation}
          disabled={status === "connecting"}
          className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-50"
        >
          {status === "connecting" ? "Conectando..." : "Iniciar conversación"}
        </button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={muteMicrophone} className="rounded-xl border px-4 py-3">Silenciar</button>
          <button type="button" onClick={unmuteMicrophone} className="rounded-xl border px-4 py-3">Activar micrófono</button>
          <button type="button" onClick={stopConversation} className="rounded-xl bg-red-600 px-4 py-3 text-white">Terminar</button>
        </div>
      )}

      {connected && (
        <p className="text-sm text-gray-600">
          Ya puedes hablar. Cuando termines una frase, el modelo detectará automáticamente el final y te responderá.
        </p>
      )}
    </div>
  );
}