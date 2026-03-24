import ivm from 'isolated-vm';
import { AlgoSignal } from '../types';

export async function runAlgo(code: string, marketState: object): Promise<AlgoSignal> {
  const isolate = new ivm.Isolate({ memoryLimit: 64 });
  const context = await isolate.createContext();
  await context.global.set('marketState', new ivm.ExternalCopy(marketState).copyInto());
  const script = await isolate.compileScript(`
${code}
JSON.stringify(evaluate(marketState));
`);
  const result = await script.run(context, { timeout: 5000 });
  isolate.dispose();
  return JSON.parse(String(result));
}
