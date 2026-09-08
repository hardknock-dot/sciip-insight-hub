import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Send } from "lucide-react";
import { askCopilot } from "@/services/api";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { Tag } from "@/components/shared/Badges";
import { titleCase } from "@/lib/format";
import type { AIInsight } from "@/types";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "AI Copilot — SCIIP" },
      {
        name: "description",
        content:
          "Ask questions about demand, fulfillment and inventory and get answers with reasoning, evidence and the underlying figures.",
      },
      { property: "og:title", content: "AI Copilot — SCIIP" },
      { property: "og:description", content: "Answers grounded in reconstructed SAP transactions." },
    ],
  }),
  component: CopilotPage,
});

const SUGGESTIONS = [
  "Which parts carry the highest open-demand risk?",
  "Which customer holds the largest open position?",
  "How is overall fulfillment tracking this year?",
  "Where is demand growing fastest?",
];

type Turn = { question: string; insight: AIInsight };

function InsightView({ insight }: { insight: AIInsight }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{insight.answer}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="label-caps">Reasoning</p>
          <ol className="mt-1.5 space-y-1.5 text-xs text-muted-foreground">
            {insight.reasoning.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-info">{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="label-caps">Underlying data</p>
          <dl className="mt-1.5 space-y-1 text-xs">
            {insight.underlyingData.map((d) => (
              <div key={d.label} className="flex justify-between gap-3 border-b border-border/60 pb-1">
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="font-mono">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div>
        <p className="label-caps">Evidence</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {insight.evidence.map((e) => (
            <Tag key={`${e.entity}-${e.reference}`} variant="info">
              {titleCase(e.entity)} {e.reference}
            </Tag>
          ))}
        </div>
      </div>

      {insight.relatedTransactions.length > 0 && (
        <div>
          <p className="label-caps">Related transactions</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {insight.relatedTransactions.map((t) => (
              <li key={t.lineId}>
                <Link
                  to="/transactions/$lineId"
                  params={{ lineId: t.lineId }}
                  className="text-info hover:underline"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {insight.isDemo
          ? "Demo response assembled from reconstructed figures — the Python copilot will replace it."
          : `Confidence ${insight.confidence ?? "—"}%`}
      </p>
    </div>
  );
}

function CopilotPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ask = useMutation({
    mutationFn: (q: string) => askCopilot(q),
    onSuccess: (insight, q) => setTurns((t) => [{ question: q, insight }, ...t]),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuestion("");
    ask.mutate(trimmed);
  };

  return (
    <>
      <PageHeader
        eyebrow="AI layer"
        title="AI Copilot"
        description="Ask in plain language. Every answer shows its reasoning, the evidence it used and the transactions behind it."
      />

      <Panel bodyClassName="p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which customers have the largest open backlog?"
            className="h-10 flex-1 rounded-md border border-input bg-surface px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="submit"
            disabled={ask.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Send className="size-4" />
            {ask.isPending ? "Thinking…" : "Ask"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </Panel>

      {turns.length === 0 ? (
        <EmptyState message="Ask a question to see an answer with its reasoning and evidence." />
      ) : (
        turns.map((t, i) => (
          <Panel key={`${t.question}-${i}`} title={t.question} subtitle="Answer with reasoning and evidence">
            <InsightView insight={t.insight} />
          </Panel>
        ))
      )}

      <BackendNote>
        `askCopilot(question)` is the single boundary — point it at the Python RAG endpoint and the
        answer, reasoning, evidence and related-transaction links all populate from it.
      </BackendNote>
    </>
  );
}
