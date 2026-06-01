import type { CSSProperties } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  disabled = false,
  ariaLabel,
}: SliderProps) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <span className={["slider", disabled ? "slider-disabled" : ""].join(" ")}>
      <input
        className="slider-input"
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ "--slider-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
      />
    </span>
  );
}
