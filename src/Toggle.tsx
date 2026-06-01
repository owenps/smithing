interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Toggle({ checked, onCheckedChange, disabled = false, ariaLabel }: ToggleProps) {
  return (
    <span className={["toggle", disabled ? "toggle-disabled" : ""].join(" ")}>
      <input
        className="toggle-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </span>
  );
}
