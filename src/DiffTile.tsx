import type { ThemeTypes } from "@pierre/diffs/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { getCurrentWorkspaceGitPatch } from "./diffClient";
import { darkThemeId, type ThemeId } from "./themeRegistry";
import type { DiffColorPolarity } from "./settings";
import type { CurrentWorkspaceGitPatchResponse } from "./types";

interface DiffTileProps {
  workspaceId: string | null;
  refreshToken: number;
  themeId: ThemeId;
  diffColorPolarity: DiffColorPolarity;
}

type DiffTileStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

const LazyPatchDiff = lazy(() =>
  import("@pierre/diffs/react").then((module) => ({ default: module.PatchDiff })),
);

export function DiffTile({ workspaceId, refreshToken, themeId, diffColorPolarity }: DiffTileProps) {
  const [status, setStatus] = useState<DiffTileStatus>("idle");
  const [patchResponse, setPatchResponse] = useState<CurrentWorkspaceGitPatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    void getCurrentWorkspaceGitPatch()
      .then((response) => {
        if (cancelled) return;
        setPatchResponse(response);
        setStatus(response.available ? "ready" : "unavailable");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setPatchResponse(null);
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshToken]);

  const patch = patchResponse?.patch ?? "";
  const themeType: ThemeTypes = themeId === darkThemeId ? "dark" : "light";
  const diffOptions = useMemo(
    () => ({
      diffStyle: "unified" as const,
      overflow: "wrap" as const,
      stickyHeader: true,
      themeType,
    }),
    [themeType],
  );

  return (
    <section
      className={["diff-tile", diffColorPolarity === "reversed" ? "diff-tile-colors-reversed" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="diff-tile-content">
        {status === "loading" ? (
          <DiffTileMessage title="Loading diff…" />
        ) : status === "unavailable" ? (
          <DiffTileMessage
            title="Diff unavailable"
            detail={patchResponse?.message ?? "Current Workspace is not git-backed."}
          />
        ) : status === "error" ? (
          <DiffTileMessage title="Could not load diff" detail={error ?? undefined} />
        ) : patch.trim() ? (
          <Suspense fallback={<DiffTileMessage title="Rendering diff…" />}>
            <LazyPatchDiff patch={patch} options={diffOptions} disableWorkerPool />
          </Suspense>
        ) : (
          <DiffTileMessage title="No working-tree changes" detail="Workspace matches HEAD." />
        )}
      </div>
    </section>
  );
}

function DiffTileMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="diff-tile-message" role="status">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}
