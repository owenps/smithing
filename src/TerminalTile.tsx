import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
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

interface TerminalTileProps {
  tileId: string;
  cwd: string;
  active: boolean;
  terminalFontSize: number;
  launch: TerminalLaunch;
  onResumeAssigned: (resume: TileResumeMetadata) => void;
}

export function TerminalTile({
  tileId,
  cwd,
  active,
  terminalFontSize,
  launch,
  onResumeAssigned,
}: TerminalTileProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onResumeAssignedRef = useRef(onResumeAssigned);

  useEffect(() => {
    onResumeAssignedRef.current = onResumeAssigned;
  }, [onResumeAssigned]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let resizeTimer: number | null = null;
    const unlistenFns: (() => void)[] = [];

    const terminal = new Terminal({
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
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      void writeTerminalInput({ sessionId, data });
    });

    void onTerminalOutput((event) => {
      if (event.sessionId === sessionIdRef.current) {
        terminal.write(event.data);
      }
    }).then((disposeListener) => {
      if (disposed) {
        disposeListener();
      } else {
        unlistenFns.push(disposeListener);
      }
    });

    void onTerminalExit((event) => {
      if (event.sessionId !== sessionIdRef.current) return;

      sessionIdRef.current = null;
      const exitCode = event.exitCode === null ? "unknown" : String(event.exitCode);
      terminal.writeln("");
      terminal.writeln(`${APP_NAME} terminal exited with code ${exitCode}.`);
    }).then((disposeListener) => {
      if (disposed) {
        disposeListener();
      } else {
        unlistenFns.push(disposeListener);
      }
    });

    const dimensions = fitAddon.proposeDimensions();
    void createTerminalSession({
      tileId,
      cwd,
      cols: dimensions?.cols ?? 80,
      rows: dimensions?.rows ?? 24,
      launch,
    })
      .then(({ sessionId, assignedResume }) => {
        if (disposed) {
          void closeTerminalSession({ sessionId });
          return;
        }
        sessionIdRef.current = sessionId;
        if (assignedResume) {
          onResumeAssignedRef.current(assignedResume);
        }
      })
      .catch((error) => {
        terminal.writeln(`${APP_NAME} could not start the terminal session.`);
        terminal.writeln(String(error));
      });

    const scheduleFitAndResize = () => {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }

      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        fitAndResizeTerminal(fitAddon, sessionIdRef.current);
      }, 50);
    };

    const resizeObserver = new ResizeObserver(scheduleFitAndResize);
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      unlistenFns.forEach((unlisten) => unlisten());
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) {
        void closeTerminalSession({ sessionId });
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [
    cwd,
    launch.kind,
    launch.kind === "tool" ? launch.integrationId : undefined,
    launch.kind === "tool" ? launch.integrationTileId : undefined,
    tileId,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || terminal.options.fontSize === terminalFontSize) return;

    terminal.options.fontSize = terminalFontSize;
    terminal.refresh(0, terminal.rows - 1);
    fitAndResizeTerminal(fitAddonRef.current, sessionIdRef.current);

    const frame = requestAnimationFrame(() => {
      terminal.refresh(0, terminal.rows - 1);
      fitAndResizeTerminal(fitAddonRef.current, sessionIdRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [terminalFontSize]);

  useEffect(() => {
    if (!active) return;
    terminalRef.current?.focus();
  }, [active]);

  return <div ref={hostRef} className="terminal-host" />;
}

function fitAndResizeTerminal(fitAddon: FitAddon | null, sessionId: string | null) {
  if (!fitAddon) return;

  fitAddon.fit();
  const nextDimensions = fitAddon.proposeDimensions();
  if (!sessionId || !nextDimensions) return;

  void resizeTerminalSession({
    sessionId,
    cols: nextDimensions.cols,
    rows: nextDimensions.rows,
  });
}

function cssVariable(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).replace(/\s+/g, " ").trim();
}
