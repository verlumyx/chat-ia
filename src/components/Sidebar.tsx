"use client";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
}

export default function Sidebar({
  conversations,
  activeId,
  isOpen,
  onSelect,
  onNewChat,
  onDelete,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Backdrop móvil */}
      {isOpen ? (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          aria-hidden="true"
        />
      ) : null}

      {/* Panel lateral */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-black/10 bg-zinc-50 transition-transform duration-200 ease-in-out dark:border-white/10 dark:bg-zinc-950 md:static md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:hidden"
        }`}
      >
        {/* Cabecera del Sidebar */}
        <div className="flex items-center justify-between border-b border-black/5 p-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
              IA
            </div>
            <span className="font-semibold text-sm">chatIA · RAG</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-foreground/60 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 md:flex"
            title="Cerrar barra lateral"
            aria-label="Cerrar barra lateral"
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
        </div>

        {/* Botón Nuevo Chat */}
        <div className="p-3">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-foreground shadow-xs transition-all hover:bg-black/5 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-white/5"
          >
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo chat
          </button>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          <div className="px-2 py-1 text-xs font-medium text-foreground/50 uppercase tracking-wider">
            Conversaciones ({conversations.length})
          </div>

          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-foreground/40">
              No hay chats previos.
            </p>
          ) : (
            conversations.map((chat) => {
              const isActive = chat.id === activeId;
              return (
                <div
                  key={chat.id}
                  onClick={() => onSelect(chat.id)}
                  className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-600 font-medium dark:bg-blue-500/20 dark:text-blue-400"
                      : "text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 opacity-70"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate text-xs sm:text-sm">
                      {chat.title || "Nuevo chat"}
                    </span>
                  </div>

                  {/* Botón eliminar conversación */}
                  <button
                    type="button"
                    onClick={(e) => onDelete(chat.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-foreground/40 hover:text-red-600 hover:bg-red-500/10 transition-all"
                    title="Eliminar chat"
                    aria-label="Eliminar chat"
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
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Pie del Sidebar con info de RAG */}
        <div className="border-t border-black/5 p-3 dark:border-white/10 text-xs text-foreground/60 space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-foreground/80">Base de conocimiento</span>
          </div>
          <p className="text-[11px] leading-tight text-foreground/50">
            Documentos Markdown sincronizados con Supabase Vector y Gemini.
          </p>
        </div>
      </aside>
    </>
  );
}
