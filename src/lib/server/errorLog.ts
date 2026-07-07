import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

type ErrorLogSeverity = 'warning' | 'error' | 'critical';

interface ServerErrorLogInput {
  context: string;
  message: string;
  error?: unknown;
  severity?: ErrorLogSeverity;
  request?: Request;
  metadata?: Record<string, unknown>;
}

const REDACTED = '[redacted]';
const MAX_STRING_LENGTH = 1_000;
const MAX_ERROR_STACK_LENGTH = 4_000;
const MAX_OBJECT_KEYS = 40;
const MAX_ARRAY_ITEMS = 25;
const MAX_DEPTH = 5;

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('password') ||
    normalized.includes('privatekey') ||
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('apikey') ||
    normalized.includes('credential')
  );
}

function truncate(value: string, maxLength = MAX_STRING_LENGTH) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeForLog(value: unknown, depth = 0, insideArray = false): unknown {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  if (depth >= MAX_DEPTH) return '[max-depth]';

  if (Array.isArray(value)) {
    const sanitized = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForLog(item, depth + 1, true));
    if (value.length > MAX_ARRAY_ITEMS) sanitized.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return insideArray ? { values: sanitized } : sanitized;
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [key, entryValue] of entries) {
      output[key] = isSensitiveKey(key) ? REDACTED : sanitizeForLog(entryValue, depth + 1, false);
    }
    const extraKeyCount = Object.keys(value as Record<string, unknown>).length - entries.length;
    if (extraKeyCount > 0) output._truncatedKeys = extraKeyCount;
    return output;
  }

  return String(value);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message),
      stack: error.stack ? truncate(error.stack, MAX_ERROR_STACK_LENGTH) : null,
      cause: error.cause ? sanitizeForLog(error.cause) : null,
    };
  }

  return {
    name: 'NonError',
    message: truncate(String(error)),
    value: sanitizeForLog(error),
  };
}

function requestSummary(request?: Request) {
  if (!request) return null;

  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname,
    search: truncate(url.search),
    referrer: request.headers.get('referer') ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
    requestId:
      request.headers.get('x-nf-request-id') ??
      request.headers.get('x-vercel-id') ??
      request.headers.get('x-request-id') ??
      null,
  };
}

export async function writeServerErrorLog(input: ServerErrorLogInput) {
  const severity = input.severity ?? 'error';
  const serializedError = serializeError(input.error ?? input.message);
  const request = requestSummary(input.request);

  if (severity === 'warning') {
    console.warn(`[${input.context}] ${input.message}`, serializedError);
  } else {
    console.error(`[${input.context}] ${input.message}`, serializedError);
  }

  try {
    await getAdminDb().collection('errorLogs').add({
      context: input.context,
      message: input.message,
      severity,
      error: serializedError,
      request,
      metadata: sanitizeForLog(input.metadata ?? {}),
      occurredAt: new Date().toISOString(),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (logError) {
    console.error('[errorLog.write] Failed to write server error log', serializeError(logError));
  }
}
