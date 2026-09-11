"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import ChatMessage from "./ChatMessage";
import Sidebar, { type Conversation } from "./Sidebar";

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
}

const SUGGESTIONS = [
  "¿Cuáles son las políticas de vacaciones y días libres?",
  "¿En qué consiste el onboarding durante la primera semana?",
  "¿Qué equipamiento y estipendio remoto provee la empresa?",
  "¿Cuáles son los canales y horarios de soporte técnico?",
];

const INITIAL_CONVERSATION: Conversation = {
  id: "conv-1",
  title: "Nueva conversación",
  createdAt: 0,
  messages: [],
};

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([INITIAL_CONVERSATION]);
  const [activeId, setActiveId] = useState<string>("conv-1");
  const [isLoaded, setIsLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cargar de localStorage tras el montaje inicial para evitar errores de hidratación SSR
  useEffect(() => {
    try {
      const saved = localStorage.getItem("chatia_conversations");
      if (saved) {
        const parsed = JSON.parse(saved) as Conversation[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setConversations(parsed);
          setActiveId(parsed[0].id);
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar conversaciones desde localStorage:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Guardar en localStorage solo después de haber cargado el estado inicial del cliente
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem("chatia_conversations", JSON.stringify(conversations));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage:", e);
    }
  }, [conversations, isLoaded]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) || conversations[0] || INITIAL_CONVERSATION;
  const messages = activeConversation.messages;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  // Crear nuevo chat
  const handleNewChat = useCallback(() => {
    if (isStreaming) return;
    const newChat: Conversation = {
      id: crypto.randomUUID(),
      title: "Nueva conversación",
      createdAt: Date.now(),
      messages: [],
    };
    setConversations((prev) => [newChat, ...prev]);
    setActiveId(newChat.id);
    setInput("");
  }, [isStreaming]);

  // Eliminar un chat
  const handleDeleteChat = useCallback(
    (idToDelete: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isStreaming) return;

      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== idToDelete);
        if (remaining.length === 0) {
          const fresh = {
            id: crypto.randomUUID(),
            title: "Nueva conversación",
            createdAt: Date.now(),
            messages: [],
          };
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === idToDelete) {
          setActiveId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeId, isStreaming]
  );

  // Enviar mensaje al chat activo
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      };
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
      };

      const isFirstMessage = messages.length === 0;
      const computedTitle = isFirstMessage
        ? trimmed.length > 30
          ? `${trimmed.slice(0, 30)}…`
          : trimmed
        : activeConversation.title;

      const updatedHistory = [...messages, userMessage];

      // Actualizar estado de la conversación con el mensaje del usuario
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === activeId) {
            return {
              ...conv,
              title: conv.title === "Nueva conversación" ? computedTitle : conv.title,
              messages: [...updatedHistory, assistantMessage],
            };
          }
          return conv;
        })
      );

      setInput("");
      setIsStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensaje: trimmed,
            stream: true,
            messages: updatedHistory.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => null);
          const errorMsg =
            errData?.details || errData?.error || `La petición falló (${res.status})`;
          throw new Error(errorMsg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id === activeId) {
                return {
                  ...conv,
                  messages: conv.messages.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: m.content + chunk }
                      : m
                  ),
                };
              }
              return conv;
            })
          );
        }
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Error desconocido";
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id === activeId) {
              return {
                ...conv,
                messages: conv.messages.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: `⚠️ No pude obtener respuesta: ${detail}` }
                    : m
                ),
              };
            }
            return conv;
          })
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeConversation.title, activeId, isStreaming, messages]
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
    requestAnimationFrame(autoResize);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
      requestAnimationFrame(autoResize);
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Barra lateral con los diversos chats disponibles */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={isSidebarOpen}
        onSelect={(id) => {
          if (!isStreaming) setActiveId(id);
        }}
        onNewChat={handleNewChat}
        onDelete={handleDeleteChat}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Área principal del chat */}
      <div className="flex flex-1 flex-col h-full overflow-hidden">
        {/* Barra superior */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/5 px-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            {!isSidebarOpen ? (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="rounded-lg p-2 text-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                title="Mostrar historial de chats"
                aria-label="Mostrar historial de chats"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                </svg>
              </button>
            ) : null}

            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <h1 className="text-sm font-semibold truncate max-w-[200px] sm:max-w-md">
                {activeConversation.title}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            disabled={isStreaming}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/10"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">Nuevo chat</span>
          </button>
        </header>

        {/* Zona de mensajes */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-8 px-4 text-center">
              <div className="space-y-2">
                <span className="inline-block rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  RAG: Supabase + Gemini
                </span>
                <h2 className="text-2xl font-semibold sm:text-3xl">
                  ¿En qué puedo ayudarte hoy?
                </h2>
                <p className="text-sm text-foreground/60">
                  Pregúntame sobre políticas laborales, onboarding y soporte técnico de la empresa.
                </p>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="rounded-xl border border-black/10 p-3 text-left text-sm text-foreground/80 transition-colors hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  isStreaming={isStreaming && m.role === "assistant"}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Barra de entrada de texto */}
        <div className="border-t border-black/5 px-4 py-4 dark:border-white/10">
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-black/10 bg-background px-3 py-2 shadow-xs focus-within:border-black/25 dark:border-white/15 dark:focus-within:border-white/30">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Haz una pregunta sobre los documentos…"
                className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-foreground/40"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                aria-label="Enviar mensaje"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-foreground/40">
              Enter para enviar · Shift + Enter para salto de línea
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
