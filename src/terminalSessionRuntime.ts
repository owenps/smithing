import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { APP_NAME } from "./appConstants";
import {
  closeTerminalSession,
  createTerminalSession,
  onTerminalExit,
  onTerminalOutput,
  resizeTerminalSession,
  writeTerminalInput,
} from "./terminalClient";
import type { TerminalLaunch, TileResumeMetadata } from "./types";

interface TerminalSessionRuntimeOptions {
  host: HTMLElement;
  workspaceId: string;
  tileId: string;
  cwd: string;
  launch: TerminalLaunch;
  terminalFontSize: number;
  onResumeAssigned: (resume: TileResumeMetadata) => void;
}

export interface TerminalSessionRuntime {
  setActive(active: boolean): void;
  setTerminalFontSize(fontSize: number): void;
  setOnResumeAssigned(onResumeAssigned: (resume: TileResumeMetadata) => void): void;
  detach(host: HTMLElement): void;
}

const terminalSessionRuntimes = new Map<string, BrowserTerminalSessionRuntime>();

export function createTerminalSessionRuntime(
  options: TerminalSessionRuntimeOptions,
): TerminalSessionRuntime {
  const key = terminalSessionRuntimeKey(options.workspaceId, options.tileId);
  const existingRuntime = terminalSessionRuntimes.get(key);
  if (existingRuntime && !existingRuntime.isDisposed()) {
    existingRuntime.attach(options.host);
    existingRuntime.setTerminalFontSize(options.terminalFontSize);
    existingRuntime.setOnResumeAssigned(options.onResumeAssigned);
    return existingRuntime;
  }

  const runtime = new BrowserTerminalSessionRuntime(options);
  terminalSessionRuntimes.set(key, runtime);
  return runtime;
}

export function closeTerminalSessionRuntime(workspaceId: string, tileId: string) {
  const key = terminalSessionRuntimeKey(workspaceId, tileId);
  const runtime = terminalSessionRuntimes.get(key);
  if (!runtime) return;

  terminalSessionRuntimes.delete(key);
  runtime.dispose();
}

export function closeTerminalSessionRuntimesForWorkspace(workspaceId: string) {
  for (const [key, runtime] of terminalSessionRuntimes) {
    if (runtime.workspaceId !== workspaceId) continue;

    terminalSessionRuntimes.delete(key);
    runtime.dispose();
  }
}

export function closeTerminalSessionRuntimesExceptWorkspaceIds(workspaceIds: Set<string>) {
  for (const [key, runtime] of terminalSessionRuntimes) {
    if (workspaceIds.has(runtime.workspaceId)) continue;

    terminalSessionRuntimes.delete(key);
    runtime.dispose();
  }
}

export function closeAllTerminalSessionRuntimes() {
  for (const [key, runtime] of terminalSessionRuntimes) {
    terminalSessionRuntimes.delete(key);
    runtime.dispose();
  }
}

function terminalSessionRuntimeKey(workspaceId: string, tileId: string): string {
  return `${workspaceId}:${tileId}`;
}

class BrowserTerminalSessionRuntime implements TerminalSessionRuntime {
  readonly workspaceId: string;
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly unlistenFns: (() => void)[] = [];
  private host: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private sessionId: string | null = null;
  private disposed = false;
  private resizeTimer: number | null = null;
  private fontRefreshFrame: number | null = null;
  private onResumeAssigned: (resume: TileResumeMetadata) => void;

  constructor(options: TerminalSessionRuntimeOptions) {
    this.workspaceId = options.workspaceId;
    this.onResumeAssigned = options.onResumeAssigned;
    this.terminal = createXterm(options.terminalFontSize);
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.attach(options.host);

    this.terminal.onData((data) => {
      if (!this.sessionId) return;
      void writeTerminalInput({ sessionId: this.sessionId, data });
    });

    void onTerminalOutput((event) => {
      if (event.sessionId === this.sessionId) {
        this.terminal.write(event.data);
      }
    }).then((disposeListener) => this.retainOrDisposeListener(disposeListener));

    void onTerminalExit((event) => {
      if (event.sessionId !== this.sessionId) return;

      this.sessionId = null;
      const exitCode = event.exitCode === null ? "unknown" : String(event.exitCode);
      this.terminal.writeln("");
      this.terminal.writeln(`${APP_NAME} terminal exited with code ${exitCode}.`);
    }).then((disposeListener) => this.retainOrDisposeListener(disposeListener));

    const dimensions = this.fitAddon.proposeDimensions();
    void createTerminalSession({
      workspaceId: options.workspaceId,
      tileId: options.tileId,
      cwd: options.cwd,
      cols: dimensions?.cols ?? 80,
      rows: dimensions?.rows ?? 24,
      launch: options.launch,
    })
      .then(({ sessionId, assignedResume }) => {
        if (this.disposed) {
          void closeTerminalSession({ sessionId }).catch(() => {});
          return;
        }

        this.sessionId = sessionId;
        this.fitAndResize();
        if (assignedResume) {
          this.onResumeAssigned(assignedResume);
        }
      })
      .catch((error) => {
        if (this.disposed) return;
        this.terminal.writeln(`${APP_NAME} could not start the terminal session.`);
        this.terminal.writeln(String(error));
      });
  }

  isDisposed() {
    return this.disposed;
  }

  attach(host: HTMLElement) {
    if (this.disposed) return;

    this.host = host;
    if (this.terminal.element) {
      host.appendChild(this.terminal.element);
    } else {
      this.terminal.open(host);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.scheduleFitAndResize());
    this.resizeObserver.observe(host);
    this.fitAndResize();
  }

  detach(host: HTMLElement) {
    if (this.host !== host) return;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.host = null;
  }

  setActive(active: boolean) {
    if (active && !this.disposed && this.host) {
      this.terminal.focus();
    }
  }

  setTerminalFontSize(fontSize: number) {
    if (this.disposed || this.terminal.options.fontSize === fontSize) return;

    this.terminal.options.fontSize = fontSize;
    this.terminal.refresh(0, this.terminal.rows - 1);
    this.fitAndResize();

    if (this.fontRefreshFrame !== null) {
      window.cancelAnimationFrame(this.fontRefreshFrame);
    }

    this.fontRefreshFrame = window.requestAnimationFrame(() => {
      this.fontRefreshFrame = null;
      if (this.disposed) return;
      this.terminal.refresh(0, this.terminal.rows - 1);
      this.fitAndResize();
    });
  }

  setOnResumeAssigned(onResumeAssigned: (resume: TileResumeMetadata) => void) {
    this.onResumeAssigned = onResumeAssigned;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (this.fontRefreshFrame !== null) {
      window.cancelAnimationFrame(this.fontRefreshFrame);
      this.fontRefreshFrame = null;
    }

    this.unlistenFns.forEach((unlisten) => unlisten());
    this.unlistenFns.length = 0;

    const sessionId = this.sessionId;
    this.sessionId = null;
    if (sessionId) {
      void closeTerminalSession({ sessionId }).catch(() => {});
    }

    this.terminal.dispose();
  }

  private retainOrDisposeListener(disposeListener: () => void) {
    if (this.disposed) {
      disposeListener();
    } else {
      this.unlistenFns.push(disposeListener);
    }
  }

  private scheduleFitAndResize() {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.fitAndResize();
    }, 50);
  }

  private fitAndResize() {
    if (!this.host) return;

    this.fitAddon.fit();
    const nextDimensions = this.fitAddon.proposeDimensions();
    if (!this.sessionId || !nextDimensions) return;

    void resizeTerminalSession({
      sessionId: this.sessionId,
      cols: nextDimensions.cols,
      rows: nextDimensions.rows,
    });
  }
}

function createXterm(terminalFontSize: number): Terminal {
  return new Terminal({
    cursorBlink: true,
    convertEol: false,
    scrollback: 10000,
    fontFamily: cssVariable("--font-mono"),
    fontSize: terminalFontSize,
    lineHeight: 1.15,
    allowProposedApi: true,
    theme: {
      background: cssVariable("--background"),
      foreground: cssVariable("--foreground"),
      cursor: cssVariable("--primary"),
      selectionBackground: cssVariable("--accent"),
      black: "#0a0a0a",
      red: "#ff6467",
      green: "#a3e635",
      yellow: "#facc15",
      blue: "#93c5fd",
      magenta: "#ffc0cb",
      cyan: "#67e8f9",
      white: "#fafafa",
      brightBlack: "#737373",
      brightRed: "#ff6467",
      brightGreen: "#bef264",
      brightYellow: "#fde047",
      brightBlue: "#bfdbfe",
      brightMagenta: "#ffc0cb",
      brightCyan: "#a5f3fc",
      brightWhite: "#ffffff",
    },
  });
}

function cssVariable(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).replace(/\s+/g, " ").trim();
}
