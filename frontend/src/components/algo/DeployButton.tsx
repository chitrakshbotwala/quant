export default function DeployButton({ onClick, disabled, label = 'Deploy Algorithm' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-lg bg-cyan/20 border border-cyan px-4 py-2 disabled:opacity-50">
      {label}
    </button>
  );
}
