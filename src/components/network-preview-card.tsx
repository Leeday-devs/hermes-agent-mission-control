"use client";

/* ───────────────────────────────────────────────────────────
   Hermy HQ · Network preview card
   A small, factual summary for the dashboard — NOT the 3D globe.
   Self-contained: loads /api/network once (no polling, matching
   the Network page's manual-refresh-only rule).
   ─────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { ChevronRight, Share2 } from "lucide-react";
import { Eyebrow } from "@/components/ui/kit";

interface NetworkSummary {
  totalNodes: number;
  totalEdges: number;
  orphanedNodes: number;
}

export function NetworkPreviewCard() {
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/network")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.health) setSummary(d.health); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <a href="/network" className="panel panel-interactive flex flex-col p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
        <span className="eyebrow">Network</span>
        {summary && (
          <span className="num ml-auto text-[13px] text-[var(--hq-text-ghost)]">{summary.totalNodes}</span>
        )}
      </div>

      {loading ? (
        <p className="text-[var(--hq-text-ghost)] text-[13px] py-6 text-center">Loading…</p>
      ) : !summary ? (
        <p className="text-[var(--hq-text-ghost)] text-[13px] py-6 text-center">Network unavailable.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 py-2">
          <div>
            <Eyebrow className="!text-[9.5px]">Nodes</Eyebrow>
            <div className="num text-[22px] font-semibold text-[var(--hq-text)] mt-1">{summary.totalNodes}</div>
          </div>
          <div>
            <Eyebrow className="!text-[9.5px]">Links</Eyebrow>
            <div className="num text-[22px] font-semibold text-[var(--hq-text)] mt-1">{summary.totalEdges}</div>
          </div>
          <div>
            <Eyebrow className="!text-[9.5px]">Orphaned</Eyebrow>
            <div className="num text-[22px] font-semibold text-[var(--hq-text)] mt-1">{summary.orphanedNodes}</div>
          </div>
        </div>
      )}

      <span className="mt-auto pt-4 flex items-center gap-1 text-[var(--hq-text-faint)] text-[11px] font-medium group-hover:text-[var(--hq-text-dim)] transition-colors">
        Open Network <ChevronRight className="w-3 h-3" />
      </span>
    </a>
  );
}
