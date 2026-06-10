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
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { getCurrentWorkspaceGitPatch } from "./diffClient";
import { darkThemeId, type ThemeId } from "./themeRegistry";
import { ScrollArea } from "./ScrollArea";
import type { DiffColorPolarity } from "./settings";
import type {
  CurrentWorkspaceGitPatchResponse,
  DiffAnnotation,
  DiffAnnotationSendTarget,
  DiffViewedFile,
} from "./types";

interface DiffTileProps {
  active: boolean;
  workspaceId: string | null;
  refreshToken: number;
  themeId: ThemeId;
  diffColorPolarity: DiffColorPolarity;
  reviewProgressVisible: boolean;
  annotations: DiffAnnotation[];
  viewedFiles: DiffViewedFile[];
  sendTargets: DiffAnnotationSendTarget[];
  onAnnotationsChange: (annotations: DiffAnnotation[]) => void;
  onViewedFilesChange: (viewedFiles: DiffViewedFile[]) => void;
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
  active,
  workspaceId,
  refreshToken,
  themeId,
  diffColorPolarity,
  reviewProgressVisible,
  annotations,
  viewedFiles,
  sendTargets,
  onAnnotationsChange,
  onViewedFilesChange,
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
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(() => new Set());
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [hideWhitespaceChanges, setHideWhitespaceChanges] = useState(false);
  const codeViewRef = useRef<CodeViewHandle<unknown>>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    void getCurrentWorkspaceGitPatch({ ignoreWhitespace: hideWhitespaceChanges })
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
  }, [workspaceId, refreshToken, hideWhitespaceChanges]);

  const patch = patchResponse?.patch ?? "";
  const files = useMemo(() => parsePatchFiles(patch).flatMap((parsed) => parsed.files), [patch]);
  const fileById = useMemo(() => new Map(files.map((file) => [diffItemId(file), file])), [files]);
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.name, file])), [files]);
  const fileSignatureById = useMemo(
    () => new Map(files.map((file) => [diffItemId(file), diffFileSignature(file)])),
    [files],
  );
  const viewedFileIds = useMemo(
    () =>
      new Set(
        viewedFiles
          .filter((viewedFile) => fileSignatureById.get(viewedFile.fileId) === viewedFile.signature)
          .map((viewedFile) => viewedFile.fileId),
      ),
    [fileSignatureById, viewedFiles],
  );
  const reviewedFileCount = viewedFileIds.size;
  const reviewFileCount = files.length;
  const reviewProgressPercent = reviewFileCount
    ? Math.round((reviewedFileCount / reviewFileCount) * 100)
    : 0;
  const orderedFiles = useMemo(() => {
    const unviewed: FileDiffMetadata[] = [];
    const viewed: FileDiffMetadata[] = [];
    files.forEach((file) => (viewedFileIds.has(diffItemId(file)) ? viewed : unviewed).push(file));
    return unviewed.concat(viewed);
  }, [files, viewedFileIds]);
  const orderedFileIds = useMemo(() => orderedFiles.map(diffItemId), [orderedFiles]);
  const themeType: ThemeTypes = themeId === darkThemeId ? "dark" : "light";
  const diffOptions = useMemo(
    () => ({
      diffStyle,
      overflow: "wrap" as const,
      stickyHeaders: true,
      stickyHeader: true,
      themeType,
      enableLineSelection: true,
      controlledSelection: true,
      hunkSeparators: "simple" as const,
      collapsedContextThreshold: 24,
      expansionLineCount: 20,
      itemMetrics: {
        diffHeaderHeight: 32,
        lineHeight: 20,
        spacing: 0,
      },
      layout: {
        paddingTop: 0,
        paddingBottom: 8,
        gap: 0,
      },
    }),
    [diffStyle, themeType],
  );

  useEffect(() => {
    const validViewedFiles = viewedFiles.filter(
      (viewedFile) => fileSignatureById.get(viewedFile.fileId) === viewedFile.signature,
    );
    if (JSON.stringify(validViewedFiles) !== JSON.stringify(viewedFiles)) {
      onViewedFilesChange(validViewedFiles);
    }
  }, [fileSignatureById, onViewedFilesChange, viewedFiles]);

  useEffect(() => {
    if (!orderedFileIds.length) {
      if (activeFileId) setActiveFileId(null);
      return;
    }
    if (!activeFileId || !orderedFileIds.includes(activeFileId)) {
      setActiveFileId(orderedFileIds[0]);
    }
  }, [activeFileId, orderedFileIds]);

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
    return orderedFiles.map((file) => {
      const id = diffItemId(file);
      const viewed = viewedFileIds.has(id);
      const collapsed = viewed || collapsedFileIds.has(id);
      return {
        id,
        type: "diff" as const,
        fileDiff: file,
        annotations: annotationsForFile(file, annotations, draftSelection),
        version: diffItemVersion(file, annotations, draftSelection, collapsed, viewed),
        collapsed,
      };
    });
  }, [annotations, collapsedFileIds, draftSelection, orderedFiles, viewedFileIds]);

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

  const scrollToFile = (fileId: string, behavior: "instant" | "smooth-auto" = "smooth-auto") => {
    setActiveFileId(fileId);
    codeViewRef.current?.scrollTo({
      type: "item",
      id: fileId,
      align: "start",
      offset: 4,
      behavior,
    });
  };

  const moveActiveFile = (direction: 1 | -1) => {
    if (!orderedFileIds.length) return;
    const currentIndex = activeFileId ? orderedFileIds.indexOf(activeFileId) : -1;
    const nextIndex = Math.max(
      0,
      Math.min(orderedFileIds.length - 1, (currentIndex === -1 ? 0 : currentIndex) + direction),
    );
    scrollToFile(orderedFileIds[nextIndex]);
  };

  const toggleCollapsed = (fileId: string) => {
    if (viewedFileIds.has(fileId)) return;
    setCollapsedFileIds((previous) => {
      const next = new Set(previous);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const toggleViewed = (fileId: string) => {
    const signature = fileSignatureById.get(fileId);
    if (!signature) return;
    const nextViewedFiles = viewedFileIds.has(fileId)
      ? viewedFiles.filter((viewedFile) => viewedFile.fileId !== fileId)
      : viewedFiles.concat({ fileId, signature });
    onViewedFilesChange(nextViewedFiles);
    const nextActiveId = orderedFileIds.find((id) => id !== fileId && !viewedFileIds.has(id));
    if (!viewedFileIds.has(fileId) && nextActiveId) scrollToFile(nextActiveId, "instant");
  };

  const handleTileKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (isKeyboardEventFromEditable(event)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      moveActiveFile(1);
      return;
    }
    if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveFile(-1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && activeFileId) {
      event.preventDefault();
      toggleCollapsed(activeFileId);
      return;
    }
    if (event.key.toLowerCase() === "v" && activeFileId) {
      event.preventDefault();
      toggleViewed(activeFileId);
      return;
    }
    if (event.key === "c") {
      event.preventDefault();
      document.querySelector<HTMLTextAreaElement>(".diff-annotation-popover textarea")?.focus();
      return;
    }
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      setDiffStyle((style) => (style === "unified" ? "split" : "unified"));
      return;
    }
    if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      setHideWhitespaceChanges((hidden) => !hidden);
    }
  };

  const renderCustomHeader = (item: CodeViewDiffItem<AnnotationMetadata>) => {
    const viewed = viewedFileIds.has(item.id);
    const collapsed = viewed || collapsedFileIds.has(item.id);
    const additions = item.fileDiff.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0);
    const deletions = item.fileDiff.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0);
    return (
      <div
        className="diff-file-header"
        onClick={() => {
          scrollToFile(item.id);
          if (!viewed) toggleCollapsed(item.id);
        }}
      >
        <div className="diff-file-header-main">
          <button
            type="button"
            className="diff-file-collapse-button"
            aria-label={collapsed ? "Open file" : "Collapse file"}
            aria-pressed={!collapsed}
            disabled={viewed}
            title={shortcutTooltip("Open/collapse file", "Enter", active)}
            onClick={(event) => {
              event.stopPropagation();
              scrollToFile(item.id);
              toggleCollapsed(item.id);
            }}
          >
            <span
              className={[
                "diff-file-collapse-icon",
                collapsed ? "diff-file-collapse-icon-closed" : "diff-file-collapse-icon-open",
              ].join(" ")}
              aria-hidden="true"
            />
          </button>
          <span className="diff-file-title" title={item.fileDiff.name}>
            {item.fileDiff.prevName
              ? `${item.fileDiff.prevName} → ${item.fileDiff.name}`
              : item.fileDiff.name}
          </span>
        </div>
        <div className="diff-file-header-meta">
          <span className="diff-file-stat diff-file-stat-additions">+{additions}</span>
          <span className="diff-file-stat diff-file-stat-deletions">-{deletions}</span>
          <label
            className="diff-file-viewed-checkbox"
            title={shortcutTooltip("Mark as viewed", "V", active)}
          >
            <input
              type="checkbox"
              checked={viewed}
              aria-label="Mark as viewed"
              onClick={(event) => event.stopPropagation()}
              onChange={() => toggleViewed(item.id)}
            />
          </label>
        </div>
      </div>
    );
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
      tabIndex={0}
      aria-label="Diff viewer. j/k next previous file, Enter collapse, v viewed, c comment, s split unified, w whitespace."
      onKeyDown={handleTileKeyDown}
    >
      <div className="diff-tile-toolbar" aria-label="Diff options">
        {reviewProgressVisible && reviewFileCount ? (
          <div
            className="diff-review-progress"
            title={`${reviewedFileCount} of ${reviewFileCount} files viewed`}
          >
            <span className="diff-review-progress-label">
              {reviewedFileCount}/{reviewFileCount} viewed
            </span>
            <span
              className="diff-review-progress-track"
              role="progressbar"
              aria-label="Review progress"
              aria-valuemin={0}
              aria-valuemax={reviewFileCount}
              aria-valuenow={reviewedFileCount}
            >
              <span
                className="diff-review-progress-fill"
                style={{ width: `${reviewProgressPercent}%` }}
              />
            </span>
          </div>
        ) : null}
        <button
          type="button"
          className={[
            "diff-toolbar-icon-button",
            diffStyle === "unified" ? "diff-toolbar-icon-button-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Unified view"
          aria-pressed={diffStyle === "unified"}
          title={shortcutTooltip("Unified view", "S", active)}
          onClick={() => setDiffStyle("unified")}
        >
          <span className="diff-toolbar-icon diff-toolbar-icon-unified" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={[
            "diff-toolbar-icon-button",
            diffStyle === "split" ? "diff-toolbar-icon-button-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Split view"
          aria-pressed={diffStyle === "split"}
          title={shortcutTooltip("Split view", "S", active)}
          onClick={() => setDiffStyle("split")}
        >
          <span className="diff-toolbar-icon diff-toolbar-icon-split" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={[
            "diff-toolbar-icon-button",
            hideWhitespaceChanges ? "diff-toolbar-icon-button-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={hideWhitespaceChanges ? "Show whitespace changes" : "Hide whitespace changes"}
          aria-pressed={hideWhitespaceChanges}
          title={shortcutTooltip(
            `${hideWhitespaceChanges ? "Show" : "Hide"} whitespace changes`,
            "W",
            active,
          )}
          onClick={() => setHideWhitespaceChanges((hidden) => !hidden)}
        >
          <span className="diff-toolbar-icon diff-toolbar-icon-whitespace" aria-hidden="true" />
        </button>
      </div>
      <ScrollArea className="diff-tile-content">
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
              ref={codeViewRef}
              items={items}
              options={diffOptions}
              selectedLines={selectedLines}
              onSelectedLinesChange={handleSelectedLinesChange}
              renderCustomHeader={renderCustomHeader}
              renderAnnotation={renderAnnotation}
              disableWorkerPool
            />
          </Suspense>
        ) : (
          <DiffTileMessage title="No working-tree changes" detail="Workspace matches HEAD." />
        )}
      </ScrollArea>
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

function diffItemVersion(
  file: FileDiffMetadata,
  annotations: DiffAnnotation[],
  draftSelection: NormalizedSelection | null,
  collapsed: boolean,
  viewed: boolean,
): number {
  return hashString(
    JSON.stringify({
      annotations: annotations.filter((annotation) => annotation.filePath === file.name),
      draft: draftSelection?.filePath === file.name ? draftSelection : null,
      collapsed,
      viewed,
    }),
  );
}

function diffFileSignature(file: FileDiffMetadata): string {
  return String(
    hashString(
      JSON.stringify({
        name: file.name,
        prevName: file.prevName,
        type: file.type,
        hunks: file.hunks.map((hunk) => ({
          additionStart: hunk.additionStart,
          additionCount: hunk.additionCount,
          additionLines: hunk.additionLines,
          deletionStart: hunk.deletionStart,
          deletionCount: hunk.deletionCount,
          deletionLines: hunk.deletionLines,
          hunkContent: hunk.hunkContent,
        })),
        additionLines: file.additionLines,
        deletionLines: file.deletionLines,
      }),
    ),
  );
}

function hashString(value: string): number {
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

function isKeyboardEventFromEditable(event: ReactKeyboardEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button,input,select,textarea,[contenteditable='true']"));
}

function shortcutTooltip(label: string, shortcut: string, showShortcut: boolean): string {
  return showShortcut ? `${label} · ${shortcut}` : label;
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
