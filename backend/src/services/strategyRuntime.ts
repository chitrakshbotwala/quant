import vm from 'node:vm';
import { z } from 'zod';

type IsolatedVmModule = {
  Isolate: new (options?: { memoryLimit?: number }) => {
    createContext: () => Promise<{
      global: {
        set: (name: string, value: unknown) => Promise<void>;
      };
    }>;
    compileScript: (code: string) => Promise<{
      run: (context: unknown, options?: { timeout?: number }) => Promise<unknown>;
    }>;
    dispose: () => void;
  };
  ExternalCopy: new (value: unknown) => { copyInto: () => unknown };
};

let cachedIvm: IsolatedVmModule | null | undefined;

function getIsolatedVm(): IsolatedVmModule | null {
  if (cachedIvm !== undefined) return cachedIvm;
  try {
    cachedIvm = require('isolated-vm') as IsolatedVmModule;
  } catch {
    cachedIvm = null;
  }
  return cachedIvm;
}

export const ParameterSchema = z
  .object({
    fastMaPeriod: z.number().int().min(2).max(50),
    slowMaPeriod: z.number().int().min(10).max(200),
    rsiPeriod: z.number().int().min(2).max(30),
    rsiOverbought: z.number().min(55).max(90),
    rsiOversold: z.number().min(10).max(45),
    positionSizePct: z.number().min(0.01).max(0.5),
    maxOpenPositions: z.number().int().min(1).max(10),
    stopLossPct: z.number().min(0.001).max(0.2),
    takeProfitPct: z.number().min(0.001).max(0.5),
    cooldownCandles: z.number().int().min(0).max(10)
  })
  .superRefine((val, ctx) => {
    if (val.fastMaPeriod >= val.slowMaPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fastMaPeriod must be less than slowMaPeriod',
        path: ['fastMaPeriod']
      });
    }
  });

export type StrategyParameters = z.infer<typeof ParameterSchema>;

export type ValidationResult =
  | { ok: true; parameters: StrategyParameters }
  | { ok: false; message: string; line?: number; column?: number; fields?: Array<{ field: string; message: string }> };

export type StrategySignal = {
  action: 'BUY' | 'SELL' | 'HOLD';
};

type Submission = {
  userId: string;
  roundId: number;
  code: string;
  parameters: StrategyParameters;
  updatedAt: number;
};

const submissions = new Map<string, Submission>();

function key(userId: string, roundId: number) {
  return `${userId}:${roundId}`;
}

function parseIvmError(err: unknown): { message: string; line?: number; column?: number } {
  const message = String(err);
  const match = message.match(/<isolated-vm>:(\d+):(\d+)/);
  if (match) {
    return { message, line: Number(match[1]), column: Number(match[2]) };
  }

  const vmMatch = message.match(/strategy-runtime\.js:(\d+):(\d+)/);
  if (vmMatch) {
    return { message, line: Number(vmMatch[1]), column: Number(vmMatch[2]) };
  }

  return { message };
}

function runWithNodeVm(scriptSource: string, sandboxValues: Record<string, unknown>): unknown {
  const sandbox = { ...sandboxValues };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(scriptSource, { filename: 'strategy-runtime.js' });
  return script.runInContext(context, { timeout: 2000 });
}

export async function validateStrategyCode(code: string): Promise<ValidationResult> {
  const source = `
${code}
JSON.stringify({
  hasStrategy: typeof strategy === 'function',
  parameters: typeof PARAMETERS === 'object' && PARAMETERS ? PARAMETERS : null
});
`;

  const validateParsed = (parsed: { hasStrategy: boolean; parameters: unknown }): ValidationResult => {
    if (!parsed.hasStrategy) {
      return { ok: false, message: 'strategy() function is missing' };
    }
    if (!parsed.parameters) {
      return { ok: false, message: 'PARAMETERS object is missing' };
    }

    const params = ParameterSchema.safeParse(parsed.parameters);
    if (!params.success) {
      return {
        ok: false,
        message: 'Invalid PARAMETERS',
        fields: params.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
      };
    }

    return { ok: true, parameters: params.data };
  };

  const ivm = getIsolatedVm();
  if (ivm) {
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    try {
      const context = await isolate.createContext();
      const script = await isolate.compileScript(source);
      const result = await script.run(context, { timeout: 2000 });
      const parsed = JSON.parse(String(result)) as { hasStrategy: boolean; parameters: unknown };
      return validateParsed(parsed);
    } catch (err) {
      const parsed = parseIvmError(err);
      return { ok: false, message: parsed.message, line: parsed.line, column: parsed.column };
    } finally {
      isolate.dispose();
    }
  }

  try {
    const result = runWithNodeVm(source, {});
    const parsed = JSON.parse(String(result)) as { hasStrategy: boolean; parameters: unknown };
    return validateParsed(parsed);
  } catch (err) {
    const parsed = parseIvmError(err);
    return { ok: false, message: parsed.message, line: parsed.line, column: parsed.column };
  }
}

export function setStrategySubmission(userId: string, roundId: number, code: string, parameters: StrategyParameters) {
  submissions.set(key(userId, roundId), {
    userId,
    roundId,
    code,
    parameters,
    updatedAt: Date.now()
  });
}

export function getStrategySubmission(userId: string, roundId: number): Submission | null {
  return submissions.get(key(userId, roundId)) || null;
}

export async function executeStrategy(code: string, marketState: object): Promise<StrategySignal> {
  const source = `
${code}
JSON.stringify(strategy(marketState));
`;

  const normalizeAction = (parsed: { action?: string }): StrategySignal => {
    const action = (parsed?.action || 'HOLD').toUpperCase();
    if (action !== 'BUY' && action !== 'SELL' && action !== 'HOLD') {
      return { action: 'HOLD' };
    }
    return { action: action as StrategySignal['action'] };
  };

  const ivm = getIsolatedVm();
  if (ivm) {
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    try {
      const context = await isolate.createContext();
      await context.global.set('marketState', new ivm.ExternalCopy(marketState).copyInto());
      const script = await isolate.compileScript(source);
      const result = await script.run(context, { timeout: 2000 });
      const parsed = JSON.parse(String(result)) as { action?: string };
      return normalizeAction(parsed);
    } finally {
      isolate.dispose();
    }
  }

  const result = runWithNodeVm(source, { marketState });
  const parsed = JSON.parse(String(result)) as { action?: string };
  return normalizeAction(parsed);
}
