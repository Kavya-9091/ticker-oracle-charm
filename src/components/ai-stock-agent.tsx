import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  Clock,
  Eraser,
  Maximize2,
  Mic,
  Minimize2,
  Pencil,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";

import { hasRemoteApi, isStaticFrontend, missingBackendMessage, remoteApi } from "@/lib/frontend-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message = { role: "user" | "assistant"; content: string; meta?: string };
type AskVariables = { message: string; baseMessages: Message[] };
type SuggestionItem = readonly [label: string, value: string];

type RecentConversation = { title: string; messages: Message[] };

type Props = {
  selectedSymbol: string;
  selectedName?: string;
  onSelectStock?: (symbol: string) => void;
  /** Prompt pushed in from elsewhere in the app (watchlist, portfolio, market overview). */
  externalPrompt?: { text: string; id: number } | null;
};

const STORAGE_KEY = "stock-insight-ai-chat";
const RECENTS_KEY = "stock-insight-ai-recents";
const PREF_KEY = "stock-insight-ai-preferences";

const loadingLines = [
  "Analyzing your question...",
  "Checking current market data...",
  "Reviewing fundamentals...",
  "Analyzing recent news...",
  "Preparing answer...",
];

const rotatingPlaceholders = [
  "Ask about AAPL...",
  "Compare two stocks...",
  "Find growth stocks...",
  "Why is the market falling?",
  "Analyze my portfolio...",
];

const quickSuggestions: readonly SuggestionItem[] = [
  ["Analyze a stock", "Analyze AAPL"],
  ["Find stocks", "Find profitable technology companies with revenue growth above 15% and low debt"],
  ["Compare stocks", "Compare AAPL vs MSFT"],
  ["Market news", "What happened in the market today?"],
  ["Market overview", "Give me today's market summary"],
  ["Analyze my portfolio", "Analyze my portfolio"],
];

const investmentSuggestions: readonly SuggestionItem[] = [
  ["Rs 1 lakh", "I have Rs 1 lakh to invest. What stocks should I research?"],
  ["5+ years", "What stocks should I research for 5+ years?"],
  ["Lower risk", "Find lower-risk stock opportunities"],
  ["Growth stocks", "Find growth stocks with strong fundamentals"],
  ["Dividend stocks", "Which stocks have good dividend history?"],
  ["Indian stocks", "Find Indian stocks with strong fundamentals"],
  ["US stocks", "Find US stocks with strong fundamentals"],
];

const learnSuggestions: readonly SuggestionItem[] = [
  ["P/E ratio", "Explain P/E ratio"],
  ["RSI", "Explain RSI"],
  ["Good stock", "What makes a good stock?"],
  ["Investing basics", "Teach me stock investing"],
];

function initialMessage() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "Good morning! Want a quick market briefing?"
      : hour >= 16
        ? "Markets may be closed. Want today's market summary?"
        : "Markets are active. Want to see today's biggest movers?";

  return `### Hi, I'm Stock Insight AI

${greeting}

I can help you understand stocks, analyze companies, compare investments, find stocks based on your criteria, explain market movements, analyze your portfolio, and summarize market news.

What would you like to explore?`;
}

export function AiStockAgent({ selectedSymbol, selectedName, onSelectStock }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [recents, setRecents] = useState<RecentConversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setMessages(
      stored
        ? JSON.parse(stored)
        : [{ role: "assistant", content: initialMessage(), meta: "Online" }],
    );
    setRecents(JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]"));
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ selectedStock: selectedSymbol }));
  }, []);

  useEffect(() => {
    if (messages.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, mutationSafeScrollKey(messages)]);

  useEffect(() => {
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ selectedStock: selectedSymbol }));
  }, [selectedSymbol]);

  useEffect(() => {
    const id = window.setInterval(
      () => setPlaceholderIndex((v) => (v + 1) % rotatingPlaceholders.length),
      2400,
    );
    return () => window.clearInterval(id);
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ message, baseMessages }: AskVariables) => {
      const id = window.setInterval(() => setLoadingIndex((v) => (v + 1) % loadingLines.length), 900);
      const data = {
        message,
        selectedSymbol,
        history: baseMessages
          .slice(0, -1)
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content })),
      };
      try {
        if (hasRemoteApi) return await remoteApi.askStockAgent(data);
        if (isStaticFrontend) throw new Error(missingBackendMessage());
        const { askStockAgent } = await import("@/lib/ai-agent.functions");
        return await askStockAgent({ data });
      } finally {
        window.clearInterval(id);
      }
    },
    onSuccess: (data, variables) => {
      const nextMessages: Message[] = [
        ...variables.baseMessages,
        {
          role: "assistant",
          content: data.answer,
          meta: `${data.intent} - tools: ${data.toolsUsed.join(", ") || "none"} - data as of ${new Date(
            data.dataAsOf,
          ).toLocaleString()}`,
        },
      ];
      setMessages(nextMessages);
      setRecents((prev) => {
        const title = variables.message || "Market research";
        const next = [{ title: title.slice(0, 42), messages: nextMessages }, ...prev].slice(0, 5);
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
        return next;
      });
    },
    onError: (error, variables) => {
      setMessages([
        ...variables.baseMessages,
        {
          role: "assistant",
          content:
            (error as Error).message ||
            "Chat service is currently unavailable. Please try again later.",
          meta: "Error",
        },
      ]);
    },
  });

  const canSend = input.trim().length > 0 && !mutation.isPending;

  const contextSuggestions = useMemo<readonly SuggestionItem[]>(
    () => [
      [`Analyze ${selectedSymbol}`, `Analyze ${selectedSymbol}`],
      [`Why is ${selectedSymbol} moving?`, `Why is ${selectedSymbol} moving today?`],
      [`${selectedSymbol} fundamentals`, `Give me a fundamental analysis of ${selectedSymbol}`],
      [`${selectedSymbol} technicals`, `Give me technical analysis for ${selectedSymbol}`],
      [`Compare ${selectedSymbol}`, `Compare ${selectedSymbol} with Microsoft`],
      [`${selectedSymbol} risks`, `What are the risks of investing in ${selectedSymbol}?`],
    ],
    [selectedSymbol],
  );

  const progress = useMemo(() => {
    if (!mutation.isPending) return [];
    const steps = [...loadingLines];
    return steps.map((label, index) => ({
      label,
      state: index < loadingIndex ? "done" : index === loadingIndex ? "active" : "idle",
    }));
  }, [loadingIndex, mutation.isPending]);

  const submit = (value?: string) => {
    const text = (value ?? input).trim();
    if (!text || mutation.isPending) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    mutation.mutate({ message: text, baseMessages: nextMessages });
  };

  const beginEdit = (index: number, content: string) => {
    if (mutation.isPending) return;
    setEditingIndex(index);
    setEditingText(content);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingText("");
  };

  const saveEdit = () => {
    if (editingIndex === null || mutation.isPending) return;
    const text = editingText.trim();
    if (!text) return;
    const nextMessages: Message[] = [
      ...messages.slice(0, editingIndex),
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setEditingIndex(null);
    setEditingText("");
    mutation.mutate({ message: text, baseMessages: nextMessages });
  };

  const clearChat = () => {
    const next = [{ role: "assistant" as const, content: initialMessage(), meta: "Online" }];
    setMessages(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const startVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text) submit(text);
    };
    recognition.start();
  };

  const supportsVoice =
    typeof window !== "undefined" &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <>
      {open && !minimized && (
        <section className="fixed right-4 bottom-24 z-50 flex h-[min(650px,calc(100vh-7rem))] w-[min(460px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-4 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl sm:right-6">
          <header className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-primary">
                  <BrainCircuit className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Stock Insight AI</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    Your AI-powered market research assistant
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-primary">
                    <span className="size-2 rounded-full bg-primary" /> Online
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setMinimized(true)} aria-label="Minimize chat">
                  <Minimize2 className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={clearChat} aria-label="Clear chat">
                  <Eraser className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label="Close chat">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
            <section className="rounded-lg border border-border bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">Current context</p>
                  <p className="tabular text-sm font-semibold">{selectedSymbol}</p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => onSelectStock?.(selectedSymbol)} className="h-8 rounded-lg text-xs">
                  View Stock
                </Button>
              </div>
              {selectedName && <p className="mt-1 truncate text-xs text-muted-foreground">{selectedName}</p>}
            </section>

            {recents.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Recent</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recents.map((recent, index) => (
                    <button
                      key={`${recent.title}-${index}`}
                      type="button"
                      onClick={() => setMessages(recent.messages)}
                      className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs"
                    >
                      {recent.title}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <SuggestionGroup title="For this stock" items={contextSuggestions} onPick={submit} />
            <SuggestionGroup title="Quick actions" items={quickSuggestions} onPick={submit} />
            <SuggestionGroup title="Investment research" items={investmentSuggestions} onPick={submit} />
            <SuggestionGroup title="Learn" items={learnSuggestions} onPick={submit} />

            {messages.map((message, index) => (
              <article key={index} className={`flex gap-2 ${message.role === "user" ? "justify-end" : ""}`}>
                {message.role === "assistant" && (
                  <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Bot className="size-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                    message.role === "user"
                      ? "border-primary/30 bg-primary/15"
                      : "border-border bg-card/70"
                  }`}
                >
                  {editingIndex === index ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="min-h-20 resize-none text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={saveEdit}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-invert max-w-none text-xs prose-headings:mb-2 prose-headings:mt-0 prose-headings:text-foreground prose-a:text-primary prose-table:text-[11px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                      {message.role === "user" && (
                        <button
                          type="button"
                          onClick={() => beginEdit(index, message.content)}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-primary"
                        >
                          <Pencil className="size-3" />
                          Edit request
                        </button>
                      )}
                    </>
                  )}
                  {message.meta && (
                    <p className="mt-2 flex items-center gap-1.5 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
                      <Clock className="size-3" />
                      {message.meta}
                    </p>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <User className="size-3.5" />
                  </div>
                )}
              </article>
            ))}

            {mutation.isPending && (
              <div className="rounded-lg border border-border bg-card/70 p-3 text-xs">
                <div className="mb-2 flex items-center gap-2 font-medium text-primary">
                  <Sparkles className="size-4 animate-pulse" />
                  Stock Insight AI
                </div>
                <div className="space-y-1.5 text-muted-foreground">
                  {progress.map((step) => (
                    <div key={step.label} className="flex items-center gap-2">
                      <span className={step.state === "active" ? "text-primary" : ""}>
                        {step.state === "done" ? "OK" : step.state === "active" ? "..." : "--"}
                      </span>
                      {step.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="shrink-0 border-t border-border p-3"
          >
            <div className="flex items-end gap-2 rounded-lg border border-border bg-background/70 p-2">
              {supportsVoice && (
                <Button type="button" variant="ghost" size="icon" onClick={startVoice} className="size-9 shrink-0" aria-label="Voice input">
                  <Mic className="size-4" />
                </Button>
              )}
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={rotatingPlaceholders[placeholderIndex]}
                className="max-h-28 min-h-9 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <Button type="submit" disabled={!canSend} className="size-9 shrink-0 rounded-lg p-0" aria-label="Send">
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Educational research only. Market data may be delayed and is never a guarantee.
            </p>
          </form>
        </section>
      )}

      {open && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed right-4 bottom-24 z-[80] flex items-center gap-2 rounded-xl border border-primary/30 bg-background/95 px-4 py-2 text-sm font-semibold shadow-2xl backdrop-blur-xl sm:right-6"
        >
          <Sparkles className="size-4 text-primary" />
          AI
          <span className="size-2 rounded-full bg-primary" />
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        title="Ask Stock Insight AI"
        className="fixed right-4 bottom-5 z-[80] flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-[0_0_28px_oklch(0.72_0.2_148/0.35)] transition-transform hover:scale-105 sm:right-6"
        aria-label="Ask Stock Insight AI"
      >
        {open ? <Maximize2 className="size-5" /> : <BarChart3 className="size-5" />}
      </button>
    </>
  );
}

function SuggestionGroup({
  title,
  items,
  onPick,
}: {
  title: string;
  items: readonly SuggestionItem[];
  onPick: (value: string) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(value)}
            className="shrink-0 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:text-primary"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function mutationSafeScrollKey(messages: Message[]) {
  return messages.map((m) => `${m.role}:${m.content.length}`).join("|");
}
