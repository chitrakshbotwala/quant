export default function BookAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-amber text-amber px-4 py-2 hover:bg-amber/10">
      Book All
    </button>
  );
}
