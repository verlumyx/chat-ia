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

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
}

const SUGGESTIONS = [
  "Explícame un concepto complejo de forma sencilla",
  "Ayúdame a escribir un correo profesional",
  "Dame ideas para un proyecto personal",
  "Resume un texto que te pegue",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

      const history = [...messages, userMessage];
      setMessages([...history, assistantMessage]);
      setInput("");
      setIsStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`La petición falló (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: m.content + chunk }
                : m,
            ),
          );
        }
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Error desconocido";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `⚠️ No pude obtener respuesta: ${detail}` }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages],
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
    <div className="flex h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <h1 className="text-sm font-semibold">chatIA</h1>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => !isStreaming && setMessages([])}
            className="rounded-md px-2.5 py-1 text-xs text-foreground/60 transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-40 dark:hover:bg-white/10"
            disabled={isStreaming}
          >
            Nuevo chat
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-8 px-4 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold sm:text-3xl">
                ¿En qué puedo ayudarte?
              </h2>
              <p className="text-sm text-foreground/60">
                Escribe un mensaje para empezar la conversación.
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

      <div className="border-t border-black/5 px-4 py-4 dark:border-white/10">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-black/10 bg-background px-3 py-2 shadow-sm focus-within:border-black/25 dark:border-white/15 dark:focus-within:border-white/30">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Escribe tu mensaje…"
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
  );
}
