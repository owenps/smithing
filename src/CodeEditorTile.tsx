import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import type Token from "markdown-it/lib/token.mjs";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/css/css.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution.js";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution.js";
import "monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/html/html.contribution.js";
import "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js";
import "monaco-editor/esm/vs/language/json/monaco.contribution.js";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/min/vs/editor/editor.main.css";
import { VimMode, initVimMode, type VimAdapterInstance } from "monaco-vim";
import { registerGoTokenization } from "./goTokenization";
import { registerCodeEditorThemes, type ThemeId } from "./themeRegistry";
import { readCodeFile, statCodeFile, writeCodeFile } from "./codeFileClient";
import { getCurrentWorkspaceGitPatch } from "./diffClient";
import type { DiffColorPolarity } from "./settings";
import { fileIconForPath } from "./fileIcons";
import { markdownTaskListPlugin } from "./markdownTaskLists";
import type { ToastSeverity } from "./ToastStack";
import type { CodeEditorSettings, CodeEditorTileState, CodeEditorViewState } from "./types";

globalThis.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

const vimWriteEventName = "fluidity://code-editor-write";
const previewShortcutLabel = "⌘⇧V";
let vimWriteCommandRegistered = false;

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
});

const defaultLinkOpenRenderer =
  markdownRenderer.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
markdownRenderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noreferrer");
  return defaultLinkOpenRenderer(tokens, index, options, env, self);
};

const markdownAlertLabels = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
} as const;

type MarkdownAlertKind = keyof typeof markdownAlertLabels;

function matchingBlockquoteCloseIndex(tokens: Token[], openIndex: number) {
  let nesting = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].type === "blockquote_open") nesting += 1;
    if (tokens[index].type === "blockquote_close") nesting -= 1;
    if (nesting === 0) return index;
  }
  return -1;
}

function firstInlineIndexInRange(tokens: Token[], startIndex: number, endIndex: number) {
  for (let index = startIndex; index < endIndex; index += 1) {
    if (tokens[index].type === "inline") return index;
  }
  return -1;
}

function createMarkdownAlertTitleTokens(state: StateCore, kind: MarkdownAlertKind, level: number) {
  const titleOpen = new state.Token("paragraph_open", "p", 1);
  titleOpen.level = level;
  titleOpen.attrJoin("class", "markdown-alert-title");

  const titleInline = new state.Token("inline", "", 0);
  titleInline.level = level + 1;
  titleInline.content = markdownAlertLabels[kind];
  titleInline.children = [];

  const titleClose = new state.Token("paragraph_close", "p", -1);
  titleClose.level = level;

  return [titleOpen, titleInline, titleClose];
}

function markdownAlertPlugin(md: MarkdownIt) {
  md.core.ruler.after("block", "github_alerts", (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "blockquote_open") continue;

      const closeIndex = matchingBlockquoteCloseIndex(state.tokens, index);
      if (closeIndex < 0) continue;

      const inlineIndex = firstInlineIndexInRange(state.tokens, index + 1, closeIndex);
      if (inlineIndex < 0) continue;

      const inlineToken = state.tokens[inlineIndex];
      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/i.exec(
        inlineToken.content,
      );
      if (!match) continue;

      const kind = match[1].toLowerCase() as MarkdownAlertKind;
      token.attrJoin("class", `markdown-alert markdown-alert-${kind}`);
      inlineToken.content = inlineToken.content.slice(match[0].length);
      inlineToken.children = [];

      if (!inlineToken.content.trim()) {
        inlineToken.hidden = true;
        state.tokens[inlineIndex - 1].hidden =
          state.tokens[inlineIndex - 1].type === "paragraph_open";
        state.tokens[inlineIndex + 1].hidden =
          state.tokens[inlineIndex + 1].type === "paragraph_close";
      }

      state.tokens.splice(
        index + 1,
        0,
        ...createMarkdownAlertTitleTokens(state, kind, token.level + 1),
      );
      index += 3;
    }
  });
}

markdownRenderer.use(markdownAlertPlugin);
markdownRenderer.use(markdownTaskListPlugin);

type DirtyDisposition = "save" | "discard" | "cancel";
type FileConflict = "external" | "deleted" | null;
type GitLineChangeKind = "added" | "modified" | "deleted";
type GitLineChangeMap = Map<string, Map<number, GitLineChangeKind>>;

interface RuntimeTab {
  path: string;
  version: string | null;
  model: monaco.editor.ITextModel;
  dirty: boolean;
  conflict: FileConflict;
  viewState?: CodeEditorViewState | null;
}

export interface CodeEditorOpenFileRequest {
  path: string;
  token: number;
}

export interface CodeEditorController {
  hasDirty: () => boolean;
  saveAll: () => Promise<boolean>;
  discardAll: () => void;
  closeActiveTab: () => Promise<boolean>;
}

function registerVimWriteCommand() {
  if (vimWriteCommandRegistered) return;
  const vimApi = (
    VimMode as unknown as {
      Vim?: { defineEx?: (name: string, prefix: string, run: () => void) => void };
    }
  ).Vim;
  vimApi?.defineEx?.("write", "w", () => {
    window.dispatchEvent(new Event(vimWriteEventName));
  });
  vimWriteCommandRegistered = true;
}

function tabTitleForPath(path: string, mode: CodeEditorSettings["tabTitleMode"]) {
  if (mode === "path") return path;
  return path.split(/[\\/]/).pop() ?? path;
}

function modelUriForPath(path: string, scope: string) {
  return monaco.Uri.from({
    scheme: "fluidity-code",
    path: `/${scope}/${path.replace(/^\/+/, "")}`,
  });
}

function isMarkdownPath(path: string | undefined) {
  return Boolean(path && /\.(?:md|markdown)$/i.test(path));
}

function isHtmlPath(path: string | undefined) {
  return Boolean(path && /\.(?:html|htm)$/i.test(path));
}

function isPreviewablePath(path: string | undefined) {
  return isMarkdownPath(path) || isHtmlPath(path);
}

function previewToggleTooltip(previewOpen: boolean, showShortcut: boolean) {
  const label = previewOpen ? "Show source" : "Show preview";
  return showShortcut ? `${label} · ${previewShortcutLabel}` : label;
}

function parseGitPatchPath(path: string, prefix: "a/" | "b/") {
  const trimmed = path.trimEnd();
  if (trimmed === "/dev/null") return null;

  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed
          .slice(1, -1)
          .replaceAll('\\"', '"')
          .replaceAll("\\t", "\t")
          .replaceAll("\\n", "\n")
          .replaceAll("\\\\", "\\")
      : trimmed;

  return unquoted.startsWith(prefix) ? unquoted.slice(prefix.length) : unquoted;
}

function setGitLineChange(
  changes: GitLineChangeMap,
  path: string,
  lineNumber: number,
  kind: GitLineChangeKind,
) {
  const fileChanges = changes.get(path) ?? new Map<number, GitLineChangeKind>();
  if (!changes.has(path)) changes.set(path, fileChanges);

  const previous = fileChanges.get(lineNumber);
  if (previous === "deleted" || (previous === "modified" && kind === "added")) return;
  fileChanges.set(lineNumber, kind);
}

function parseGitLineChanges(patch: string): GitLineChangeMap {
  const changes: GitLineChangeMap = new Map();
  const lines = patch.split(/\r?\n/);
  let path: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("+++ ")) {
      path = parseGitPatchPath(line.slice(4), "b/");
      index += 1;
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (!path || !hunk) {
      index += 1;
      continue;
    }

    let newLine = Number(hunk[1]);
    let addedLines: number[] = [];
    let deletedLineCount = 0;

    const flushChangeGroup = () => {
      if (!path || (!addedLines.length && !deletedLineCount)) return;
      if (addedLines.length && deletedLineCount) {
        addedLines.forEach((lineNumber) =>
          setGitLineChange(changes, path!, lineNumber, "modified"),
        );
      } else if (addedLines.length) {
        addedLines.forEach((lineNumber) => setGitLineChange(changes, path!, lineNumber, "added"));
      } else {
        setGitLineChange(changes, path, Math.max(1, newLine), "deleted");
      }
      addedLines = [];
      deletedLineCount = 0;
    };

    index += 1;
    while (index < lines.length) {
      const hunkLine = lines[index];
      if (hunkLine.startsWith("diff --git ") || hunkLine.startsWith("@@ ")) break;
      if (hunkLine.startsWith("\\ No newline")) {
        index += 1;
        continue;
      }

      const marker = hunkLine[0];
      if (marker === "+" && !hunkLine.startsWith("+++")) {
        addedLines.push(newLine);
        newLine += 1;
      } else if (marker === "-" && !hunkLine.startsWith("---")) {
        deletedLineCount += 1;
      } else {
        flushChangeGroup();
        if (marker === " ") newLine += 1;
      }
      index += 1;
    }
    flushChangeGroup();
  }

  return changes;
}

const gitLineChangeColors: Record<GitLineChangeKind, string> = {
  added: "rgba(26, 127, 55, 0.65)",
  modified: "rgba(210, 153, 34, 0.75)",
  deleted: "rgba(207, 34, 46, 0.75)",
};

function gitLineChangeDisplayKind(kind: GitLineChangeKind, polarity: DiffColorPolarity) {
  if (polarity !== "reversed") return kind;
  if (kind === "added") return "deleted";
  if (kind === "deleted") return "added";
  return kind;
}

function gitLineChangeDecorations(
  model: monaco.editor.ITextModel,
  changes: Map<number, GitLineChangeKind> | undefined,
  polarity: DiffColorPolarity,
): monaco.editor.IModelDeltaDecoration[] {
  if (!changes?.size) return [];
  const lineCount = Math.max(1, model.getLineCount());

  return [...changes.entries()].map(([lineNumber, kind]) => {
    const clampedLineNumber = Math.min(Math.max(1, lineNumber), lineCount);
    const displayKind = gitLineChangeDisplayKind(kind, polarity);
    return {
      range: new monaco.Range(clampedLineNumber, 1, clampedLineNumber, 1),
      options: {
        isWholeLine: true,
        marginClassName: `code-editor-git-margin code-editor-git-margin-${kind} code-editor-git-color-${displayKind}`,
        overviewRuler: {
          color: gitLineChangeColors[displayKind],
          position: monaco.editor.OverviewRulerLane.Left,
        },
        minimap: {
          color: gitLineChangeColors[displayKind],
          position: monaco.editor.MinimapPosition.Gutter,
        },
      },
    };
  });
}

function languageIdForPath(path: string) {
  const normalizedPath = path.toLowerCase();
  const basename = normalizedPath.split(/[\\/]/).pop() ?? normalizedPath;
  const extension = basename.includes(".") ? `.${basename.split(".").pop()}` : "";
  return (
    monaco.languages
      .getLanguages()
      .find(
        (language) =>
          language.filenames?.some((filename) => filename.toLowerCase() === basename) ||
          (extension && language.extensions?.includes(extension)),
      )?.id ?? "plaintext"
  );
}

function viewStateFromEditor(editor: monaco.editor.IStandaloneCodeEditor): CodeEditorViewState {
  const position = editor.getPosition() ?? { lineNumber: 1, column: 1 };
  return {
    cursor: { lineNumber: position.lineNumber, column: position.column },
    scrollTop: editor.getScrollTop(),
    scrollLeft: editor.getScrollLeft(),
  };
}

function restoreViewState(
  editor: monaco.editor.IStandaloneCodeEditor,
  viewState: CodeEditorViewState | null | undefined,
) {
  if (!viewState) return;
  if (viewState.cursor) editor.setPosition(viewState.cursor);
  if (typeof viewState.scrollTop === "number") editor.setScrollTop(viewState.scrollTop);
  if (typeof viewState.scrollLeft === "number") editor.setScrollLeft(viewState.scrollLeft);
}

function sanitizedMarkdownHtml(markdown: string) {
  const html = markdownRenderer.render(markdown);
  if (typeof DOMPurify.sanitize === "function") return DOMPurify.sanitize(html);

  const purifier = DOMPurify(window);
  if (typeof purifier.sanitize === "function") return purifier.sanitize(html);

  return html;
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    try {
      return sanitizedMarkdownHtml(markdown);
    } catch (error) {
      return `<pre>Preview failed: ${markdownRenderer.utils.escapeHtml(String(error))}</pre>`;
    }
  }, [markdown]);
  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

function HtmlPreview({ html }: { html: string }) {
  return <iframe className="html-preview" title="HTML preview" sandbox="" srcDoc={html} />;
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode },
  { errorMessage: string | null }
> {
  state = { errorMessage: null };

  static getDerivedStateFromError(error: unknown) {
    return { errorMessage: String(error) };
  }

  render() {
    if (this.state.errorMessage) {
      return <div className="preview-error">Preview failed: {this.state.errorMessage}</div>;
    }

    return this.props.children;
  }
}

export function CodeEditorTile({
  active,
  workspaceId,
  themeId,
  diffColorPolarity,
  settings,
  editorState,
  openFileRequest,
  onEditorStateChange,
  onFileVisited,
  onFileSaved,
  onDirtyStateChange,
  onRegisterController,
  confirmDirty,
  onToast,
}: {
  active: boolean;
  workspaceId: string;
  themeId: ThemeId;
  diffColorPolarity: DiffColorPolarity;
  settings: CodeEditorSettings;
  editorState?: CodeEditorTileState;
  openFileRequest?: CodeEditorOpenFileRequest;
  onEditorStateChange?: (state: CodeEditorTileState | undefined) => void;
  onFileVisited?: (path: string) => void;
  onFileSaved?: (path: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  onRegisterController?: (controller: CodeEditorController | null) => void;
  confirmDirty?: (options: {
    title: string;
    message: string;
    saveLabel?: string;
    discardLabel?: string;
    cancelLabel?: string;
  }) => Promise<DirtyDisposition>;
  onToast?: (toast: { severity: ToastSeverity; title: string; detail?: string }) => void;
}) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const gitDecorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const vimModeRef = useRef<VimAdapterInstance | null>(null);
  const activeRef = useRef(active);
  const workspaceIdRef = useRef(workspaceId);
  const settingsRef = useRef(settings);
  const autoSaveTimerRef = useRef<number | null>(null);
  const tabsRef = useRef<RuntimeTab[]>([]);
  const activePathRef = useRef<string | null>(null);
  const gitLineChangesRef = useRef<GitLineChangeMap>(new Map());
  const modelUriScopeRef = useRef(crypto.randomUUID());
  const ignoreContentChangeRef = useRef(false);
  const handledOpenFileRequestTokenRef = useRef<number | null>(null);
  const restoredStateKeyRef = useRef<string | null>(null);
  const onEditorStateChangeRef = useRef(onEditorStateChange);
  const onDirtyStateChangeRef = useRef(onDirtyStateChange);
  const onFileVisitedRef = useRef(onFileVisited);
  const onFileSavedRef = useRef(onFileSaved);
  const confirmDirtyRef = useRef(confirmDirty);
  const onToastRef = useRef(onToast);
  const [, setRevision] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);

  const rerender = () => setRevision((revision) => revision + 1);
  const toast = (severity: ToastSeverity, title: string, detail?: string) => {
    onToastRef.current?.({ severity, title, detail });
  };
  const activeTab = () => tabsRef.current.find((tab) => tab.path === activePathRef.current) ?? null;
  const dirtyTabs = () => tabsRef.current.filter((tab) => tab.dirty);
  const reportDirty = () => onDirtyStateChangeRef.current?.(dirtyTabs().length > 0);

  const applyGitDecorations = () => {
    const collection = gitDecorationsRef.current;
    if (!collection) return;

    const tab = activeTab();
    if (!tab) {
      collection.clear();
      return;
    }

    collection.set(
      gitLineChangeDecorations(
        tab.model,
        gitLineChangesRef.current.get(tab.path),
        diffColorPolarity,
      ),
    );
  };

  const refreshGitLineChanges = async () => {
    const targetWorkspaceId = workspaceIdRef.current;
    if (!targetWorkspaceId) return;

    try {
      const response = await getCurrentWorkspaceGitPatch();
      if (workspaceIdRef.current !== targetWorkspaceId) return;
      if (response.workspaceId && response.workspaceId !== targetWorkspaceId) return;
      gitLineChangesRef.current = response.available
        ? parseGitLineChanges(response.patch)
        : new Map();
      applyGitDecorations();
    } catch {
      gitLineChangesRef.current = new Map();
      applyGitDecorations();
    }
  };

  const saveActiveViewState = () => {
    const editor = editorRef.current;
    const tab = activeTab();
    if (editor && tab) tab.viewState = viewStateFromEditor(editor);
  };

  const serializeState = (): CodeEditorTileState | undefined => {
    saveActiveViewState();
    const tabs = tabsRef.current.map((tab) => ({
      path: tab.path,
      version: tab.version,
      viewState: tab.viewState ?? null,
    }));
    if (!tabs.length) return undefined;
    return { tabs, activePath: activePathRef.current ?? tabs[0]?.path ?? null };
  };

  const publishState = () => {
    onEditorStateChangeRef.current?.(serializeState());
    reportDirty();
  };

  const togglePreview = () => {
    if (!isPreviewablePath(activePathRef.current ?? undefined)) return false;
    setPreviewVisible((visible) => {
      const nextVisible = !visible;
      if (!nextVisible) window.requestAnimationFrame(() => editorRef.current?.focus());
      return nextVisible;
    });
    return true;
  };

  const setActivePath = (path: string | null) => {
    const editor = editorRef.current;
    saveActiveViewState();
    activePathRef.current = path;
    setPreviewVisible((visible) => (isPreviewablePath(path ?? undefined) ? visible : false));
    const tab = activeTab();
    if (editor) {
      ignoreContentChangeRef.current = true;
      editor.setModel(tab?.model ?? null);
      ignoreContentChangeRef.current = false;
      applyGitDecorations();
      if (tab) restoreViewState(editor, tab.viewState);
      editor.focus();
    }
    const position = editor?.getPosition();
    if (position) setCursorPosition(position);
    publishState();
    rerender();
  };

  const addOrUpdateTab = (
    path: string,
    contents: string,
    version: string | null,
    viewState?: CodeEditorViewState | null,
  ) => {
    let tab = tabsRef.current.find((candidate) => candidate.path === path);
    if (tab) {
      ignoreContentChangeRef.current = true;
      tab.model.setValue(contents);
      ignoreContentChangeRef.current = false;
      tab.version = version;
      tab.dirty = false;
      tab.conflict = null;
      tab.viewState = viewState ?? tab.viewState;
    } else {
      tab = {
        path,
        version,
        model: monaco.editor.createModel(
          contents,
          languageIdForPath(path),
          modelUriForPath(path, modelUriScopeRef.current),
        ),
        dirty: false,
        conflict: null,
        viewState,
      };
      tabsRef.current = tabsRef.current.concat(tab);
    }
    setActivePath(path);
    onFileVisitedRef.current?.(path);
  };

  const reloadTab = async (tab: RuntimeTab): Promise<boolean> => {
    try {
      const response = await readCodeFile({ workspaceId: workspaceIdRef.current, path: tab.path });
      ignoreContentChangeRef.current = true;
      tab.model.setValue(response.contents);
      ignoreContentChangeRef.current = false;
      tab.version = response.version;
      tab.dirty = false;
      tab.conflict = null;
      publishState();
      rerender();
      return true;
    } catch (error) {
      toast("error", "Reload failed", String(error));
      return false;
    }
  };

  const saveTab = async (tab: RuntimeTab, overwrite = false): Promise<boolean> => {
    if (tab.conflict && !overwrite) {
      const disposition = await (confirmDirtyRef.current?.({
        title: "File changed on disk",
        message: `${tab.path} changed outside Fluidity.`,
        saveLabel: "Overwrite",
        discardLabel: "Reload",
      }) ?? Promise.resolve("cancel"));
      if (disposition === "discard") return reloadTab(tab);
      if (disposition === "save") return saveTab(tab, true);
      return false;
    }

    try {
      const response = await writeCodeFile({
        workspaceId: workspaceIdRef.current,
        path: tab.path,
        contents: tab.model.getValue(),
        expectedVersion: overwrite ? null : tab.version,
      });
      tab.version = response.version;
      tab.dirty = false;
      tab.conflict = null;
      publishState();
      rerender();
      onFileSavedRef.current?.(tab.path);
      void refreshGitLineChanges();
      return true;
    } catch (error) {
      const message = String(error);
      if (message.includes("changed on disk")) {
        tab.conflict = "external";
        rerender();
        return saveTab(tab, false);
      }
      toast("error", "Save failed", message);
      return false;
    }
  };

  const saveCurrentFile = async () => {
    const tab = activeTab();
    if (!tab) {
      toast("info", "Open a file first", "Use Cmd+P to open a project file.");
      return false;
    }
    return saveTab(tab);
  };

  const saveAll = async () => {
    for (const tab of dirtyTabs()) {
      const saved = await saveTab(tab);
      if (!saved) return false;
    }
    return true;
  };

  const discardAll = () => {
    tabsRef.current.forEach((tab) => {
      tab.dirty = false;
      tab.conflict = null;
    });
    publishState();
    rerender();
  };

  const closeTab = async (path: string): Promise<boolean> => {
    const tab = tabsRef.current.find((candidate) => candidate.path === path);
    if (!tab) return false;
    if (tab.dirty) {
      const disposition = await (confirmDirtyRef.current?.({
        title: "Close dirty tab?",
        message: `${tab.path} has unsaved changes.`,
      }) ?? Promise.resolve("cancel"));
      if (disposition === "cancel") return false;
      if (disposition === "save" && !(await saveTab(tab))) return false;
    }

    const wasActive = activePathRef.current === path;
    tabsRef.current = tabsRef.current.filter((candidate) => candidate.path !== path);
    tab.model.dispose();
    if (wasActive) setActivePath(tabsRef.current[0]?.path ?? null);
    else publishState();
    rerender();
    return true;
  };

  const scheduleAutoSave = () => {
    if (!activeTab()) return;
    if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveCurrentFile();
    }, 1000);
  };

  useEffect(() => {
    activeRef.current = active;
    if (!active) setEditorFocused(false);
  }, [active]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    gitLineChangesRef.current = new Map();
    applyGitDecorations();
    if (!workspaceId) return;

    void refreshGitLineChanges();
    const interval = window.setInterval(() => {
      void refreshGitLineChanges();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [workspaceId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    applyGitDecorations();
  }, [diffColorPolarity]);

  useEffect(() => {
    onEditorStateChangeRef.current = onEditorStateChange;
    onDirtyStateChangeRef.current = onDirtyStateChange;
    onFileVisitedRef.current = onFileVisited;
    onFileSavedRef.current = onFileSaved;
    confirmDirtyRef.current = confirmDirty;
    onToastRef.current = onToast;
  }, [confirmDirty, onDirtyStateChange, onEditorStateChange, onFileSaved, onFileVisited, onToast]);

  useEffect(() => {
    onRegisterController?.({
      hasDirty: () => dirtyTabs().length > 0,
      saveAll,
      discardAll,
      closeActiveTab: async () => {
        const tab = activeTab();
        if (!tab) return false;
        return closeTab(tab.path);
      },
    });
    return () => onRegisterController?.(null);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (
        event.key.toLowerCase() !== "v" ||
        !event.metaKey ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (!togglePreview()) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (!editorHostRef.current) return;

    registerCodeEditorThemes(monaco.editor);
    registerGoTokenization(monaco.languages);
    registerVimWriteCommand();

    const saveActiveEditor = () => {
      if (activeRef.current) void saveCurrentFile();
    };
    window.addEventListener(vimWriteEventName, saveActiveEditor);

    const editor = monaco.editor.create(editorHostRef.current, {
      automaticLayout: true,
      cursorBlinking: "smooth",
      fontFamily: "var(--font-mono)",
      fontSize: settings.fontSize,
      folding: settings.lineNumbersVisible,
      glyphMargin: false,
      lineDecorationsWidth: settings.lineNumbersVisible ? 10 : "1ch",
      lineNumbers: settings.lineNumbersVisible ? "on" : "off",
      lineNumbersMinChars: settings.lineNumbersVisible ? 3 : 0,
      minimap: { enabled: settings.minimapVisible },
      padding: { top: 10, bottom: 10 },
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      tabSize: settings.tabSize,
      theme: themeId,
      wordWrap: settings.wordWrap ? "on" : "off",
      bracketPairColorization: { enabled: settings.bracketPairColorization },
      stickyScroll: { enabled: settings.stickyScroll },
    });
    editorRef.current = editor;
    gitDecorationsRef.current = editor.createDecorationsCollection();

    const contentDisposable = editor.onDidChangeModelContent(() => {
      if (ignoreContentChangeRef.current) return;
      const tab = activeTab();
      if (!tab) return;
      tab.dirty = true;
      reportDirty();
      rerender();
      if (settingsRef.current.autoSave === "afterDelay") scheduleAutoSave();
    });
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      setEditorFocused(true);
    });
    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      setEditorFocused(false);
      saveActiveViewState();
      publishState();
      if (settingsRef.current.autoSave === "onFocusChange" && activeTab()) {
        void saveCurrentFile();
      }
    });
    const cursorDisposable = editor.onDidChangeCursorPosition((event) => {
      setCursorPosition(event.position);
    });
    const saveDisposable = editor.addAction({
      id: "fluidity.editorSave",
      label: "Save",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {
        void saveCurrentFile();
      },
    });

    return () => {
      if (autoSaveTimerRef.current !== null) window.clearTimeout(autoSaveTimerRef.current);
      contentDisposable.dispose();
      focusDisposable.dispose();
      blurDisposable.dispose();
      cursorDisposable.dispose();
      saveDisposable.dispose();
      window.removeEventListener(vimWriteEventName, saveActiveEditor);
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
      gitDecorationsRef.current?.clear();
      gitDecorationsRef.current = null;
      editor.dispose();
      tabsRef.current.forEach((tab) => tab.model.dispose());
      tabsRef.current = [];
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (settings.vimMode && !vimModeRef.current) {
      vimModeRef.current = initVimMode(editor, statusRef.current);
      return;
    }
    if (!settings.vimMode && vimModeRef.current) {
      vimModeRef.current.dispose();
      vimModeRef.current = null;
      if (statusRef.current) statusRef.current.textContent = "";
    }
  }, [settings.vimMode]);

  useEffect(() => {
    monaco.editor.setTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    editorRef.current?.updateOptions({
      folding: settings.lineNumbersVisible,
      lineDecorationsWidth: settings.lineNumbersVisible ? 10 : "1ch",
      lineNumbers: settings.lineNumbersVisible ? "on" : "off",
      lineNumbersMinChars: settings.lineNumbersVisible ? 3 : 0,
      minimap: { enabled: settings.minimapVisible },
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      wordWrap: settings.wordWrap ? "on" : "off",
      bracketPairColorization: { enabled: settings.bracketPairColorization },
      stickyScroll: { enabled: settings.stickyScroll },
    });
  }, [settings]);

  useEffect(() => {
    if (active && !previewVisible) editorRef.current?.focus();
  }, [active, previewVisible]);

  useEffect(() => {
    if (!previewVisible) window.requestAnimationFrame(() => editorRef.current?.layout());
  }, [previewVisible]);

  useEffect(() => {
    if (!workspaceId || !editorRef.current) return;
    const key = `${workspaceId}:${(editorState?.tabs ?? []).map((tab) => tab.path).join("\0")}`;
    if (restoredStateKeyRef.current === key) return;
    restoredStateKeyRef.current = key;

    let cancelled = false;
    const restore = async () => {
      tabsRef.current.forEach((tab) => tab.model.dispose());
      tabsRef.current = [];
      activePathRef.current = null;
      const persistedTabs = editorState?.tabs ?? [];
      for (const persistedTab of persistedTabs) {
        try {
          const response = await readCodeFile({ workspaceId, path: persistedTab.path });
          if (cancelled) return;
          const tab: RuntimeTab = {
            path: response.path,
            version: response.version,
            model: monaco.editor.createModel(
              response.contents,
              languageIdForPath(response.path),
              modelUriForPath(response.path, modelUriScopeRef.current),
            ),
            dirty: false,
            conflict: null,
            viewState: persistedTab.viewState ?? null,
          };
          tabsRef.current = tabsRef.current.concat(tab);
        } catch (error) {
          toast("error", "Could not restore editor tab", `${persistedTab.path}: ${String(error)}`);
        }
      }
      const activePath =
        editorState?.activePath &&
        tabsRef.current.some((tab) => tab.path === editorState.activePath)
          ? editorState.activePath
          : (tabsRef.current[0]?.path ?? null);
      setActivePath(activePath);
      reportDirty();
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [editorState, workspaceId]);

  useEffect(() => {
    if (!openFileRequest || !workspaceId) return;
    if (handledOpenFileRequestTokenRef.current === openFileRequest.token) return;
    handledOpenFileRequestTokenRef.current = openFileRequest.token;

    const existing = tabsRef.current.find((tab) => tab.path === openFileRequest.path);
    if (existing) {
      setActivePath(existing.path);
      onFileVisitedRef.current?.(existing.path);
      return;
    }

    let cancelled = false;
    const openFile = async () => {
      try {
        const response = await readCodeFile({ workspaceId, path: openFileRequest.path });
        if (cancelled) return;
        addOrUpdateTab(response.path, response.contents, response.version, null);
      } catch (error) {
        if (!cancelled) toast("error", "Open failed", String(error));
      }
    };

    void openFile();
    return () => {
      cancelled = true;
    };
  }, [openFileRequest, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const interval = window.setInterval(() => {
      tabsRef.current.forEach((tab) => {
        void statCodeFile({ workspaceId, path: tab.path })
          .then(async (stat) => {
            if (!stat.exists) {
              if (tab.conflict !== "deleted") {
                tab.conflict = "deleted";
                toast("info", "File deleted outside Fluidity", tab.path);
                rerender();
              }
              return;
            }
            if (!stat.version || stat.version === tab.version) return;
            if (tab.dirty) {
              if (tab.conflict !== "external") {
                tab.conflict = "external";
                toast("info", "File changed outside Fluidity", tab.path);
                rerender();
              }
              return;
            }
            const response = await readCodeFile({ workspaceId, path: tab.path });
            ignoreContentChangeRef.current = true;
            tab.model.setValue(response.contents);
            ignoreContentChangeRef.current = false;
            tab.version = response.version;
            tab.conflict = null;
            publishState();
            rerender();
          })
          .catch(() => undefined);
      });
    }, 2000);

    return () => window.clearInterval(interval);
  }, [workspaceId]);

  const tabs = tabsRef.current;
  const currentTab = activeTab();
  const markdownTabActive = isMarkdownPath(currentTab?.path);
  const htmlTabActive = isHtmlPath(currentTab?.path);
  const previewableTabActive = markdownTabActive || htmlTabActive;
  const previewOpen = previewableTabActive && previewVisible;
  const showPreviewShortcut = active && editorFocused;

  const showTabs = settings.tabsVisible;

  return (
    <div className={["code-editor-tile", showTabs ? "" : "code-editor-tabs-hidden"].join(" ")}>
      {showTabs ? (
        <div className="code-editor-tabstrip" aria-label="Editor tabs">
          {tabs.length ? (
            tabs.map((tab) => (
              <button
                key={tab.path}
                className={[
                  "code-editor-tab",
                  tab.path === activePathRef.current ? "code-editor-tab-active" : "",
                  tab.conflict ? "code-editor-tab-conflict" : "",
                ].join(" ")}
                type="button"
                title={tab.path}
                onClick={() => setActivePath(tab.path)}
              >
                <span className="code-editor-tab-icon" aria-hidden="true">
                  {fileIconForPath(tab.path)}
                </span>
                <span className="code-editor-tab-title">
                  {tabTitleForPath(tab.path, settings.tabTitleMode)}
                  {tab.dirty ? " ●" : ""}
                  {tab.conflict ? " ⚠" : ""}
                </span>
                <span
                  className="code-editor-tab-close"
                  role="button"
                  tabIndex={-1}
                  aria-label={`Close ${tab.path}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTab(tab.path);
                  }}
                >
                  ×
                </span>
              </button>
            ))
          ) : (
            <button
              className="code-editor-tab code-editor-tab-active code-editor-tab-untitled"
              type="button"
              title="untitled"
              aria-disabled="true"
            >
              <span className="code-editor-tab-icon" aria-hidden="true">
                {fileIconForPath("untitled")}
              </span>
              <span className="code-editor-tab-title">untitled</span>
            </button>
          )}
          {previewableTabActive ? (
            <button
              className={[
                "code-editor-tab-action",
                "code-editor-preview-toggle",
                previewOpen ? "code-editor-preview-toggle-active" : "",
              ].join(" ")}
              type="button"
              aria-label={previewOpen ? "Show source" : "Show preview"}
              aria-pressed={previewOpen}
              data-tooltip={previewToggleTooltip(previewOpen, showPreviewShortcut)}
              onClick={togglePreview}
            >
              <span className="code-editor-preview-icon" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="code-editor-host-wrap">
        <div
          ref={editorHostRef}
          className={["code-editor-host", previewOpen ? "code-editor-host-hidden" : ""].join(" ")}
        />
        {previewOpen ? (
          <PreviewErrorBoundary key={`${currentTab?.path ?? ""}:${htmlTabActive ? "html" : "md"}`}>
            {markdownTabActive ? (
              <MarkdownPreview markdown={currentTab?.model.getValue() ?? ""} />
            ) : null}
            {htmlTabActive ? <HtmlPreview html={currentTab?.model.getValue() ?? ""} /> : null}
          </PreviewErrorBoundary>
        ) : null}
      </div>
      <div className="code-editor-statusline">
        <div ref={statusRef} className="code-editor-vim-status" />
        {currentTab?.conflict ? (
          <span className="code-editor-tab-note">
            {currentTab.conflict === "external" ? "changed on disk" : "deleted on disk"}
          </span>
        ) : null}
        <span className="code-editor-cursor-position">
          {cursorPosition.lineNumber}:{cursorPosition.column}
        </span>
      </div>
    </div>
  );
}
