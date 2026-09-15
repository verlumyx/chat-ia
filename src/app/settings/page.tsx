"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const [instanceName, setInstanceName] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [instanceCreated, setInstanceCreated] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkInstance() {
      try {
        const res = await fetch("/api/evolution/list");
        const data = await res.json();
        if (mounted && data?.instance) {
          setInstanceName(data.instance.instance_name);
          setInstanceCreated(true);
          if (data.instance.qr_scanned) {
            setHasScanned(true);
            setStatus("Conexión guardada. Procede con el Webhook.");
          }
        }
      } catch (err) {
        console.error("Error fetching instance:", err);
      }
    }
    checkInstance();
    return () => { mounted = false; };
  }, []);

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceName) return;

    setLoading(true);
    setError("");
    setQrCode("");
    setStatus("Creando y guardando instancia...");
    setInstanceCreated(false);
    setHasScanned(false);

    try {
      const createRes = await fetch("/api/evolution/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });

      const createData = await createRes.json();
      
      // Ignore conflict error if instance already exists
      if (!createRes.ok && createRes.status !== 409 && createData.message?.message !== "Instance already exists") {
        throw new Error(createData.error || createData.message?.message || "Error al crear instancia");
      }

      setInstanceCreated(true);
      setStatus("Instancia creada y guardada en base de datos. Ahora puedes generar el QR.");
    } catch (err: any) {
      setError(err.message || "Error desconocido al crear instancia");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQR = async () => {
    setLoading(true);
    setError("");
    setStatus("Obteniendo código QR...");

    try {
      const connectRes = await fetch(`/api/evolution/connect?instanceName=${instanceName}`);
      const connectData = await connectRes.json();

      if (!connectRes.ok) {
        throw new Error(connectData.error || connectData.message?.message || "Error al conectar instancia");
      }

      if (connectData?.base64 || connectData?.qrcode?.base64) {
        setQrCode(connectData.base64 || connectData.qrcode.base64);
        setStatus("Escanea el código QR con WhatsApp");
      } else if (connectData?.instance?.state === "open" || connectData?.instance?.status === "open") {
         setStatus("La instancia ya está conectada y lista para usarse.");
      } else {
        throw new Error("No se recibió código QR");
      }
    } catch (err: any) {
      setError(err.message || "Error desconocido al generar QR");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWebhook = async () => {
    setLoading(true);
    setError("");
    setStatus("Configurando Webhook...");
    try {
      const res = await fetch("/api/evolution/webhook/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al configurar webhook");
      setStatus("Webhook configurado exitosamente. La IA ya está conectada.");
    } catch (err: any) {
      setError(err.message || "Error al configurar webhook");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-blue-600 hover:underline flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Volver al chat
          </Link>
          <h1 className="text-2xl font-bold">Configuración</h1>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Conectar WhatsApp (Evolution API)</h2>
          <p className="text-sm text-foreground/60 mb-6">
            Paso 1: Crea la instancia. Paso 2: Genera y escanea el código QR.
          </p>
          
          <form onSubmit={handleCreateInstance} className="space-y-4">
            <div>
              <label htmlFor="instanceName" className="block text-sm font-medium mb-1">
                Nombre de la Instancia
              </label>
              <input
                id="instanceName"
                type="text"
                value={instanceName}
                onChange={(e) => {
                  setInstanceName(e.target.value);
                  setInstanceCreated(false);
                  setQrCode("");
                  setStatus("");
                  setError("");
                }}
                placeholder="Ej. mi_numero_ws"
                className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-white/10"
                disabled={loading}
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !instanceName || instanceCreated}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && !instanceCreated ? "Creando..." : "Crear Instancia"}
              </button>

              {instanceCreated && (
                <button
                  type="button"
                  onClick={handleGenerateQR}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && status.includes("QR") ? "Generando..." : "Generar QR"}
                </button>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg text-sm">
              {error}
            </div>
          )}

          {status && !error && !qrCode && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 rounded-lg text-sm">
              {status}
            </div>
          )}

          {qrCode && (
            <div className="mt-6 flex flex-col items-center border border-black/10 dark:border-white/10 rounded-xl p-8 bg-zinc-50 dark:bg-zinc-950">
              <p className="text-sm text-center mb-6 font-medium text-foreground">
                {status}
              </p>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-black/5 mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 object-contain" />
              </div>
              <button
                type="button"
                onClick={async () => {
                  setQrCode("");
                  setStatus("Actualizando estado...");
                  try {
                    await fetch("/api/evolution/scanned", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ instanceName })
                    });
                    setStatus("Listo, conexión configurada y guardada.");
                    setHasScanned(true);
                  } catch (err) {
                    setStatus("Listo, conexión configurada.");
                    setHasScanned(true);
                  }
                }}
                className="px-6 py-2 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
              >
                Ya escaneé el código
              </button>
            </div>
          )}
        </div>

        {hasScanned && (
          <div className="bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm mt-8">
            <h2 className="text-lg font-semibold mb-1">Configurar Webhook de IA</h2>
            <p className="text-sm text-foreground/60 mb-6">
              Inicia la conexión de Webhooks para que la IA escuche y responda automáticamente a los mensajes de WhatsApp.
            </p>
            <button
              onClick={handleConnectWebhook}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Iniciar conexión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
