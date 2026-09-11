import type { Message } from "./Chat";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[85%] gap-3 sm:max-w-[75%] ${
          isUser ? "flex-row-reverse" : "flex-row"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-black/5 text-foreground dark:bg-white/10"
          }`}
          aria-hidden
        >
          {isUser ? "Tú" : "IA"}
        </div>

        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white"
              : "bg-black/5 text-foreground dark:bg-white/10"
          }`}
        >
          {message.content}
          {isStreaming && message.content === "" ? (
            <span className="inline-flex gap-1 align-middle">
              <Dot />
              <Dot style={{ animationDelay: "150ms" }} />
              <Dot style={{ animationDelay: "300ms" }} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Dot({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
      style={style}
    />
  );
}
