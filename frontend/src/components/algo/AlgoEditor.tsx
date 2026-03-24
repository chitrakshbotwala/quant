import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

const TEMPLATE = `// KRONOSPHERE — OPTIMIZATION SPRINT
const PARAMETERS = {
  fastMaPeriod: 10,
  slowMaPeriod: 30,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  positionSizePct: 0.1,
  maxOpenPositions: 3,
  stopLossPct: 0.02,
  takeProfitPct: 0.05,
  cooldownCandles: 2,
};

function strategy(state) {
  const { emaFast, emaSlow, rsi } = state.indicators;
  if (emaFast > emaSlow && rsi < PARAMETERS.rsiOverbought) return { action: 'BUY' };
  if (emaFast < emaSlow && rsi > PARAMETERS.rsiOversold) return { action: 'SELL' };
  return { action: 'HOLD' };
}
`;

export default function AlgoEditor({
  value,
  onChange,
  readOnly,
  marker
}: {
  value: string;
  onChange: (s: string) => void;
  readOnly?: boolean;
  marker?: { line: number; column?: number; message: string } | null;
}) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (!marker) {
      monacoRef.current.editor.setModelMarkers(model, 'algo-validation', []);
      return;
    }

    monacoRef.current.editor.setModelMarkers(model, 'algo-validation', [
      {
        startLineNumber: marker.line,
        startColumn: marker.column || 1,
        endLineNumber: marker.line,
        endColumn: (marker.column || 1) + 1,
        message: marker.message,
        severity: monacoRef.current.MarkerSeverity.Error
      }
    ]);
  }, [marker, value]);

  return (
    <div className="panel overflow-hidden">
      <Editor
        height="360px"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={value || TEMPLATE}
        options={{ minimap: { enabled: false }, fontSize: 13, readOnly }}
        onChange={(v) => onChange(v || TEMPLATE)}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
        }}
      />
    </div>
  );
}

export { TEMPLATE };
