import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import {
  createTerminalSessionRuntime,
  type TerminalSessionRuntime,
} from "./terminalSessionRuntime";
import type { TerminalLaunch, TileResumeMetadata } from "./types";

interface TerminalTileProps {
  workspaceId: string;
  tileId: string;
  cwd: string;
  active: boolean;
  terminalFontSize: number;
  launch: TerminalLaunch;
  onResumeAssigned: (resume: TileResumeMetadata) => void;
}

export function TerminalTile({
  workspaceId,
  tileId,
  cwd,
  active,
  terminalFontSize,
  launch,
  onResumeAssigned,
}: TerminalTileProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<TerminalSessionRuntime | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const runtime = createTerminalSessionRuntime({
      host,
      workspaceId,
      tileId,
      cwd,
      launch,
      terminalFontSize,
      onResumeAssigned,
    });
    runtimeRef.current = runtime;
    runtime.setActive(active);

    return () => {
      runtime.dispose();
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
    };
  }, [
    cwd,
    workspaceId,
    launch.kind,
    launch.kind === "tool" ? launch.integrationId : undefined,
    launch.kind === "tool" ? launch.integrationTileId : undefined,
    tileId,
  ]);

  useEffect(() => {
    runtimeRef.current?.setOnResumeAssigned(onResumeAssigned);
  }, [onResumeAssigned]);

  useEffect(() => {
    runtimeRef.current?.setTerminalFontSize(terminalFontSize);
  }, [terminalFontSize]);

  useEffect(() => {
    runtimeRef.current?.setActive(active);
  }, [active]);

  return <div ref={hostRef} className="terminal-host" />;
}
