import { useEffect, useState } from "react";

const brailleSpinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function BrailleSpinner() {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setFrameIndex((previous) => (previous + 1) % brailleSpinnerFrames.length),
      80,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <span className="braille-spinner" aria-hidden="true">
      {brailleSpinnerFrames[frameIndex]}
    </span>
  );
}
