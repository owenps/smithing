import type { ReactNode } from "react";

type KeyCapSize = "default" | "compact";

interface KeyCapProps {
  children: ReactNode;
  size?: KeyCapSize;
}

interface KeyChordProps {
  keys: string[];
  size?: KeyCapSize;
}

export function KeyCap({ children, size = "default" }: KeyCapProps) {
  return (
    <kbd className={["keycap", size === "compact" ? "keycap-compact" : ""].join(" ")}>
      {children}
    </kbd>
  );
}

export function KeyChord({ keys, size = "default" }: KeyChordProps) {
  return (
    <span className="key-chord" aria-label={keys.join(" plus ")}>
      {keys.map((key) => (
        <KeyCap key={key} size={size}>
          {key}
        </KeyCap>
      ))}
    </span>
  );
}
