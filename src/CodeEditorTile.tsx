import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/min/vs/editor/editor.main.css";
import { VimMode, initVimMode, type VimAdapterInstance } from "monaco-vim";
import { registerCodeEditorThemes, type ThemeId } from "./themeRegistry";
import { readCodeFile, writeCodeFile } from "./codeFileClient";

globalThis.MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

const vimWriteEventName = "fluidity://code-editor-write";
let vimWriteCommandRegistered = false;

interface OpenFileState {
  path: string;
  version: string;
}

export interface CodeEditorOpenFileRequest {
  path: string;
  token: number;
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

export function CodeEditorTile({
  active,
  workspaceId,
  themeId,
  openFileRequest,
}: {
  active: boolean;
  workspaceId: string;
  themeId: ThemeId;
  openFileRequest?: CodeEditorOpenFileRequest;
}) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeRef = useRef(active);
  const openFileRef = useRef<OpenFileState | null>(null);
  const ignoreContentChangeRef = useRef(false);
  const handledOpenFileRequestTokenRef = useRef<number | null>(null);
  const [openFile, setOpenFile] = useState<OpenFileState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });

  const setCurrentOpenFile = (file: OpenFileState | null) => {
    openFileRef.current = file;
    setOpenFile(file);
  };

  const saveCurrentFile = async () => {
    const file = openFileRef.current;
    const editor = editorRef.current;
    if (!file || !editor) {
      window.alert("Select a file with Cmd+P before saving.");
      return;
    }

    try {
      const response = await writeCodeFile({
        workspaceId,
        path: file.path,
        contents: editor.getValue(),
        expectedVersion: file.version,
      });
      setCurrentOpenFile(response);
      setDirty(false);
    } catch (error) {
      window.alert(`Save failed: ${String(error)}`);
    }
  };

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!editorHostRef.current) return;

    registerCodeEditorThemes(monaco.editor);
    registerVimWriteCommand();

    const saveActiveEditor = () => {
      if (activeRef.current) void saveCurrentFile();
    };
    window.addEventListener(vimWriteEventName, saveActiveEditor);

    const editor = monaco.editor.create(editorHostRef.current, {
      value: "",
      automaticLayout: true,
      cursorBlinking: "smooth",
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      lineNumbersMinChars: 3,
      minimap: { enabled: false },
      padding: { top: 10, bottom: 10 },
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: themeId,
      wordWrap: "on",
    });
    editorRef.current = editor;

    const vimMode: VimAdapterInstance = initVimMode(editor, statusRef.current);
    const contentDisposable = editor.onDidChangeModelContent(() => {
      if (ignoreContentChangeRef.current) return;
      setDirty(true);
    });
    const cursorDisposable = editor.onDidChangeCursorPosition((event) => {
      setCursorPosition(event.position);
    });
    const saveDisposable = editor.addAction({
      id: "fluidity.editorSave",
      label: "Save",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveCurrentFile(),
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
      saveDisposable.dispose();
      window.removeEventListener(vimWriteEventName, saveActiveEditor);
      const model = editor.getModel();
      vimMode.dispose();
      editor.dispose();
      model?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    monaco.editor.setTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    if (active) editorRef.current?.focus();
  }, [active]);

  useEffect(() => {
    if (!openFileRequest || !workspaceId) return;
    if (handledOpenFileRequestTokenRef.current === openFileRequest.token) return;
    if (dirty && !window.confirm("Discard unsaved editor changes and open another file?")) return;
    handledOpenFileRequestTokenRef.current = openFileRequest.token;

    let cancelled = false;
    const openFile = async () => {
      try {
        const response = await readCodeFile({ workspaceId, path: openFileRequest.path });
        if (cancelled) return;
        const editor = editorRef.current;
        if (!editor) return;
        ignoreContentChangeRef.current = true;
        editor.setValue(response.contents);
        ignoreContentChangeRef.current = false;
        setCurrentOpenFile(response);
        setDirty(false);
        editor.focus();
      } catch (error) {
        if (!cancelled) window.alert(`Open failed: ${String(error)}`);
      }
    };

    void openFile();
    return () => {
      cancelled = true;
    };
  }, [dirty, openFileRequest, workspaceId]);

  return (
    <div className="code-editor-tile">
      <div className="code-editor-tabstrip" aria-label="Editor tabs">
        <button className="code-editor-tab code-editor-tab-active" type="button">
          {openFile?.path ?? "untitled"}
          {dirty ? " ●" : ""}
        </button>
      </div>
      <div ref={editorHostRef} className="code-editor-host" />
      <div className="code-editor-statusline">
        <div ref={statusRef} className="code-editor-vim-status" />
        <span className="code-editor-cursor-position">
          {cursorPosition.lineNumber}:{cursorPosition.column}
        </span>
      </div>
    </div>
  );
}
