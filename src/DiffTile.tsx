import {
  parsePatchFiles,
  type CodeViewDiffItem,
  type CodeViewLineSelection,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type SelectedLineRange,
  type ThemeTypes,
} from "@pierre/diffs";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { getCurrentWorkspaceGitPatch } from "./diffClient";
import { darkThemeId, type ThemeId } from "./themeRegistry";
import type { DiffColorPolarity } from "./settings";
import type {
  CurrentWorkspaceGitPatchResponse,
  DiffAnnotation,
  DiffAnnotationSendTarget,
} from "./types";

interface DiffTileProps {
  workspaceId: string | null;
  refreshToken: number;
  themeId: ThemeId;
  diffColorPolarity: DiffColorPolarity;
  annotations: DiffAnnotation[];
  sendTargets: DiffAnnotationSendTarget[];
  onAnnotationsChange: (annotations: DiffAnnotation[]) => void;
  onInsertAnnotationPayload: (targetId: string, payload: string) => Promise<boolean>;
}

type DiffTileStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
type AnnotationMetadata =
  | { kind: "annotation"; annotationId: string }
  | { kind: "draft"; selection: NormalizedSelection };

interface NormalizedSelection {
  itemId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  selectedDiff: string;
}

interface DiffLineForRange {
  hunkIndex: number;
  lineNumber: number;
  marker: "+" | " ";
  text: string;
}

const LazyCodeView = lazy(() =>
  import("@pierre/diffs/react").then((module) => ({ default: module.CodeView })),
);

export function DiffTile({
  workspaceId,
  refreshToken,
  themeId,
  diffColorPolarity,
  annotations,
  sendTargets,
  onAnnotationsChange,
  onInsertAnnotationPayload,
}: DiffTileProps) {
  const [status, setStatus] = useState<DiffTileStatus>("idle");
  const [patchResponse, setPatchResponse] = useState<CurrentWorkspaceGitPatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<CodeViewLineSelection | null>(null);
  const [draftSelection, setDraftSelection] = useState<NormalizedSelection | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [editingAnnotation, setEditingAnnotation] = useState<{
    id: string;
    comment: string;
  } | null>(null);
  const [sendPickerAnnotationId, setSendPickerAnnotationId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");

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
  const files = useMemo(() => parsePatchFiles(patch).flatMap((parsed) => parsed.files), [patch]);
  const fileById = useMemo(() => new Map(files.map((file) => [diffItemId(file), file])), [files]);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.name, file])), [files]);
  const themeType: ThemeTypes = themeId === darkThemeId ? "dark" : "light";
  const diffOptions = useMemo(
    () => ({
      diffStyle: "unified" as const,
      overflow: "wrap" as const,
      stickyHeaders: true,
      stickyHeader: true,
      themeType,
      enableLineSelection: true,
      controlledSelection: true,
    }),
    [themeType],
  );

  useEffect(() => {
    if (!annotations.length || !files.length) return;

    let changed = false;
    const nextAnnotations = annotations.map((annotation) => {
      const file = fileByPath.get(annotation.filePath);
      const selectedDiff = file
        ? selectedDiffForRange(file, annotation.startLine, annotation.endLine)
        : null;
      if (!selectedDiff) return annotation;

      const stale = selectedDiff !== annotation.selectedDiff;
      if (stale === annotation.stale) return annotation;
      changed = true;
      return { ...annotation, stale };
    });

    if (changed) onAnnotationsChange(nextAnnotations);
  }, [annotations, fileByPath, files.length, onAnnotationsChange]);

  const items = useMemo<CodeViewDiffItem<AnnotationMetadata>[]>(() => {
    return files.map((file) => ({
      id: diffItemId(file),
      type: "diff" as const,
      fileDiff: file,
      annotations: annotationsForFile(file, annotations, draftSelection),
      version: annotationsVersionForFile(file.name, annotations, draftSelection),
    }));
  }, [annotations, draftSelection, files]);

  const handleSelectedLinesChange = (selection: CodeViewLineSelection | null) => {
    setSelectedLines(selection);
    setDraftComment("");
    if (!selection) {
      setDraftSelection(null);
      return;
    }

    const file = fileById.get(selection.id);
    const normalized = file ? normalizeSelection(selection, file) : null;
    setDraftSelection(normalized);
  };

  const cancelDraftAnnotation = () => {
    setDraftSelection(null);
    setDraftComment("");
    setSelectedLines(null);
  };

  const saveDraftAnnotation = () => {
    const selection = draftSelection;
    const comment = draftComment.trim();
    if (!selection || !comment) return;

    const now = new Date().toISOString();
    onAnnotationsChange(
      annotations.concat({
        id: crypto.randomUUID(),
        source: "local",
        filePath: selection.filePath,
        startLine: selection.startLine,
        endLine: selection.endLine,
        comment,
        selectedDiff: selection.selectedDiff,
        stale: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
    cancelDraftAnnotation();
  };

  const saveEditingAnnotation = () => {
    if (!editingAnnotation) return;
    const comment = editingAnnotation.comment.trim();
    if (!comment) return;

    onAnnotationsChange(
      annotations.map((annotation) =>
        annotation.id === editingAnnotation.id
          ? { ...annotation, comment, updatedAt: new Date().toISOString() }
          : annotation,
      ),
    );
    setEditingAnnotation(null);
  };

  const deleteAnnotation = (annotationId: string) => {
    onAnnotationsChange(annotations.filter((annotation) => annotation.id !== annotationId));
    if (editingAnnotation?.id === annotationId) setEditingAnnotation(null);
    if (sendPickerAnnotationId === annotationId) setSendPickerAnnotationId(null);
  };

  const sendAnnotation = async (annotation: DiffAnnotation, targetId?: string) => {
    const nextTargetId = targetId ?? selectedTargetId ?? sendTargets[0]?.id;
    if (!nextTargetId) return;
    const inserted = await onInsertAnnotationPayload(
      nextTargetId,
      formatAnnotationPayload(annotation),
    );
    if (inserted) setSendPickerAnnotationId(null);
  };

  const handleDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelDraftAnnotation();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveDraftAnnotation();
    }
  };

  const handleEditKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingAnnotation(null);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEditingAnnotation();
    }
  };

  const handleSendTargetKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;

    event.preventDefault();
    setSendPickerAnnotationId(null);
  };

  const renderAnnotation = (
    lineAnnotation: DiffLineAnnotation<AnnotationMetadata>,
    item: CodeViewDiffItem<AnnotationMetadata>,
  ) => {
    const metadata = lineAnnotation.metadata;
    if (metadata.kind === "draft") {
      if (metadata.selection.itemId !== item.id) return null;
      return (
        <div
          className="diff-annotation diff-annotation-popover"
          role="group"
          aria-label="New diff comment"
        >
          <div className="diff-annotation-range">
            {metadata.selection.filePath} ·{" "}
            {formatRange(metadata.selection.startLine, metadata.selection.endLine)}
          </div>
          <textarea
            autoFocus
            className="diff-annotation-textarea"
            value={draftComment}
            placeholder="Comment…"
            aria-label="Comment"
            onChange={(event) => setDraftComment(event.currentTarget.value)}
            onKeyDown={handleDraftKeyDown}
          />
          <div className="diff-annotation-actions">
            <button type="button" onClick={saveDraftAnnotation} disabled={!draftComment.trim()}>
              Save
            </button>
            <button type="button" onClick={cancelDraftAnnotation}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    const annotation = annotations.find((candidate) => candidate.id === metadata.annotationId);
    if (!annotation) return null;
    const editing = editingAnnotation?.id === annotation.id;
    const pickerOpen = sendPickerAnnotationId === annotation.id;

    return (
      <div
        className={["diff-annotation", annotation.stale ? "diff-annotation-stale" : ""].join(" ")}
        role="group"
        aria-label={`Diff comment ${formatRange(annotation.startLine, annotation.endLine)}`}
      >
        <div className="diff-annotation-heading">
          <span>{formatRange(annotation.startLine, annotation.endLine)}</span>
          {annotation.stale ? <strong>Stale</strong> : null}
        </div>
        {editing ? (
          <textarea
            autoFocus
            className="diff-annotation-textarea"
            value={editingAnnotation.comment}
            aria-label="Edit comment"
            onChange={(event) =>
              setEditingAnnotation({ id: annotation.id, comment: event.currentTarget.value })
            }
            onKeyDown={handleEditKeyDown}
          />
        ) : (
          <p className="diff-annotation-comment">{annotation.comment}</p>
        )}
        <div className="diff-annotation-actions">
          {editing ? (
            <>
              <button
                type="button"
                onClick={saveEditingAnnotation}
                disabled={!editingAnnotation.comment.trim()}
              >
                Save
              </button>
              <button type="button" onClick={() => setEditingAnnotation(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  setEditingAnnotation({ id: annotation.id, comment: annotation.comment })
                }
              >
                Edit
              </button>
              <button type="button" onClick={() => deleteAnnotation(annotation.id)}>
                Delete
              </button>
              <button
                type="button"
                disabled={!sendTargets.length}
                onClick={() => {
                  if (sendTargets.length === 1) void sendAnnotation(annotation, sendTargets[0].id);
                  else {
                    setSelectedTargetId(sendTargets[0]?.id ?? "");
                    setSendPickerAnnotationId(pickerOpen ? null : annotation.id);
                  }
                }}
              >
                Send comment…
              </button>
            </>
          )}
        </div>
        {pickerOpen ? (
          <div className="diff-annotation-send-row" onKeyDown={handleSendTargetKeyDown}>
            <select
              autoFocus
              value={selectedTargetId}
              aria-label="Send comment target"
              onChange={(event) => setSelectedTargetId(event.currentTarget.value)}
            >
              {sendTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void sendAnnotation(annotation)}
              disabled={!selectedTargetId}
            >
              Insert
            </button>
          </div>
        ) : null}
      </div>
    );
  };

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
            <LazyCodeView
              items={items}
              options={diffOptions}
              selectedLines={selectedLines}
              onSelectedLinesChange={handleSelectedLinesChange}
              renderAnnotation={renderAnnotation}
              disableWorkerPool
            />
          </Suspense>
        ) : (
          <DiffTileMessage title="No working-tree changes" detail="Workspace matches HEAD." />
        )}
      </div>
    </section>
  );
}

function annotationsForFile(
  file: FileDiffMetadata,
  annotations: DiffAnnotation[],
  draftSelection: NormalizedSelection | null,
): DiffLineAnnotation<AnnotationMetadata>[] {
  const lineAnnotations: DiffLineAnnotation<AnnotationMetadata>[] = annotations
    .filter((annotation) => annotation.filePath === file.name)
    .filter(
      (annotation) => selectedDiffForRange(file, annotation.startLine, annotation.endLine) !== null,
    )
    .map((annotation) => ({
      side: "additions" as const,
      lineNumber: annotation.endLine,
      metadata: { kind: "annotation" as const, annotationId: annotation.id },
    }));

  if (draftSelection?.itemId === diffItemId(file)) {
    lineAnnotations.push({
      side: "additions",
      lineNumber: draftSelection.endLine,
      metadata: { kind: "draft", selection: draftSelection },
    });
  }

  return lineAnnotations;
}

function annotationsVersionForFile(
  filePath: string,
  annotations: DiffAnnotation[],
  draftSelection: NormalizedSelection | null,
): number {
  const value = JSON.stringify({
    annotations: annotations.filter((annotation) => annotation.filePath === filePath),
    draft: draftSelection?.filePath === filePath ? draftSelection : null,
  });
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function normalizeSelection(
  selection: CodeViewLineSelection,
  file: FileDiffMetadata,
): NormalizedSelection | null {
  const range = normalizeRange(selection.range);
  if (!range) return null;

  const selectedDiff = selectedDiffForRange(file, range.startLine, range.endLine);
  if (!selectedDiff) return null;

  return {
    itemId: selection.id,
    filePath: file.name,
    startLine: range.startLine,
    endLine: range.endLine,
    selectedDiff,
  };
}

function normalizeRange(range: SelectedLineRange): { startLine: number; endLine: number } | null {
  const side = range.side ?? "additions";
  const endSide = range.endSide ?? side;
  if (side !== "additions" || endSide !== "additions") return null;

  return {
    startLine: Math.min(range.start, range.end),
    endLine: Math.max(range.start, range.end),
  };
}

function selectedDiffForRange(
  file: FileDiffMetadata,
  startLine: number,
  endLine: number,
): string | null {
  const lines = diffLinesForRange(file, startLine, endLine);
  if (!lines.length) return null;
  if (lines.some((line) => line.hunkIndex !== lines[0].hunkIndex)) return null;
  if (lines[0].lineNumber !== startLine || lines[lines.length - 1].lineNumber !== endLine)
    return null;
  return lines.map((line) => `${line.marker}${line.text}`).join("");
}

function diffLinesForRange(
  file: FileDiffMetadata,
  startLine: number,
  endLine: number,
): DiffLineForRange[] {
  const result: DiffLineForRange[] = [];

  file.hunks.forEach((hunk, hunkIndex) => {
    let additionLineNumber = hunk.additionStart;
    let deletionLineNumber = hunk.deletionStart;

    hunk.hunkContent.forEach((content) => {
      if (content.type === "context") {
        for (let index = 0; index < content.lines; index++) {
          if (additionLineNumber >= startLine && additionLineNumber <= endLine) {
            result.push({
              hunkIndex,
              lineNumber: additionLineNumber,
              marker: " ",
              text: file.additionLines[content.additionLineIndex + index] ?? "",
            });
          }
          additionLineNumber++;
          deletionLineNumber++;
        }
        return;
      }

      deletionLineNumber += content.deletions;
      for (let index = 0; index < content.additions; index++) {
        if (additionLineNumber >= startLine && additionLineNumber <= endLine) {
          result.push({
            hunkIndex,
            lineNumber: additionLineNumber,
            marker: "+",
            text: file.additionLines[content.additionLineIndex + index] ?? "",
          });
        }
        additionLineNumber++;
      }
    });

    void deletionLineNumber;
  });

  return result;
}

function diffItemId(file: FileDiffMetadata): string {
  return `${file.prevName ?? ""}->${file.name}`;
}

function formatRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `+${startLine}` : `+${startLine}-${endLine}`;
}

function formatAnnotationPayload(annotation: DiffAnnotation): string {
  const fence = annotation.selectedDiff.includes("```") ? "````" : "```";
  return `<fluidity_diff_comment>\nSource: ${annotation.source}\nFile: ${annotation.filePath}\nRange: ${formatRange(
    annotation.startLine,
    annotation.endLine,
  )}\n\nComment:\n${annotation.comment}\n\nSelected diff:\n${fence}diff\n${annotation.selectedDiff}${annotation.selectedDiff.endsWith("\n") ? "" : "\n"}${fence}\n</fluidity_diff_comment>`;
}

function DiffTileMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="diff-tile-message" role="status">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}
