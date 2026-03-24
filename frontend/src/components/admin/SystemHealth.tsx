export default function SystemHealth({ health }: { health: any }) {
  return (
    <div className="panel p-4 space-y-2 text-sm font-mono">
      <h3 className="font-semibold font-sans">System Health</h3>
      <div>WS Connections: {health?.wsConnections ?? '-'}</div>
      <div>Redis Ping: {health?.redisLatencyMs ?? '-'} ms</div>
      <div>Algo Queue Depth: {health?.algoQueueDepth ?? '-'}</div>
      <div>DB Pool: {health?.dbPoolStatus ?? '-'}</div>
    </div>
  );
}
