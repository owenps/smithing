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
  dispose(): void;
}

export function createTerminalSessionRuntime(
  options: TerminalSessionRuntimeOptions,
): TerminalSessionRuntime {
  return new BrowserTerminalSessionRuntime(options);
}

class BrowserTerminalSessionRuntime implements TerminalSessionRuntime {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly resizeObserver: ResizeObserver;
  private readonly unlistenFns: (() => void)[] = [];
  private sessionId: string | null = null;
  private disposed = false;
  private resizeTimer: number | null = null;
  private fontRefreshFrame: number | null = null;
  private onResumeAssigned: (resume: TileResumeMetadata) => void;

  constructor(options: TerminalSessionRuntimeOptions) {
    this.onResumeAssigned = options.onResumeAssigned;
    this.terminal = createXterm(options.terminalFontSize);
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(options.host);
    this.fitAddon.fit();

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
          void closeTerminalSession({ sessionId });
          return;
        }

        this.sessionId = sessionId;
        if (assignedResume) {
          this.onResumeAssigned(assignedResume);
        }
      })
      .catch((error) => {
        if (this.disposed) return;
        this.terminal.writeln(`${APP_NAME} could not start the terminal session.`);
        this.terminal.writeln(String(error));
      });

    this.resizeObserver = new ResizeObserver(() => this.scheduleFitAndResize());
    this.resizeObserver.observe(options.host);
  }

  setActive(active: boolean) {
    if (active && !this.disposed) {
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

    this.resizeObserver.disconnect();
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
      void closeTerminalSession({ sessionId });
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
