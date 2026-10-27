import { vi } from "vitest";
import type { DbClient } from "../db/supabase";

export interface QueryCall {
  method: string;
  args: unknown[];
}

export interface QueryOutcome {
  data: unknown;
  error: unknown;
}

export class FakeQuery {
  readonly calls: QueryCall[] = [];

  constructor(private readonly outcome: QueryOutcome) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select(...args: unknown[]): this {
    return this.record("select", args);
  }

  insert(...args: unknown[]): this {
    return this.record("insert", args);
  }

  upsert(...args: unknown[]): this {
    return this.record("upsert", args);
  }

  update(...args: unknown[]): this {
    return this.record("update", args);
  }

  delete(...args: unknown[]): this {
    return this.record("delete", args);
  }

  eq(...args: unknown[]): this {
    return this.record("eq", args);
  }

  neq(...args: unknown[]): this {
    return this.record("neq", args);
  }

  is(...args: unknown[]): this {
    return this.record("is", args);
  }

  not(...args: unknown[]): this {
    return this.record("not", args);
  }

  in(...args: unknown[]): this {
    return this.record("in", args);
  }

  or(...args: unknown[]): this {
    return this.record("or", args);
  }

  order(...args: unknown[]): this {
    return this.record("order", args);
  }

  range(...args: unknown[]): this {
    return this.record("range", args);
  }

  limit(...args: unknown[]): this {
    return this.record("limit", args);
  }

  textSearch(...args: unknown[]): this {
    return this.record("textSearch", args);
  }

  maybeSingle(): Promise<QueryOutcome> {
    this.calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(this.outcome);
  }

  single(): Promise<QueryOutcome> {
    this.calls.push({ method: "single", args: [] });
    return Promise.resolve(this.outcome);
  }

  then<TResult1 = QueryOutcome, TResult2 = never>(
    onfulfilled?: ((value: QueryOutcome) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.outcome).then(onfulfilled, onrejected);
  }
}

export class FakeStorageBucket {
  readonly calls: QueryCall[] = [];

  constructor(
    private readonly signedUrlOutcome: QueryOutcome,
    private readonly uploadOutcome: QueryOutcome,
    private readonly removeOutcome: QueryOutcome
  ) {}

  createSignedUrl(...args: unknown[]): Promise<QueryOutcome> {
    this.calls.push({ method: "createSignedUrl", args });
    return Promise.resolve(this.signedUrlOutcome);
  }

  upload(...args: unknown[]): Promise<QueryOutcome> {
    this.calls.push({ method: "upload", args });
    return Promise.resolve(this.uploadOutcome);
  }

  remove(...args: unknown[]): Promise<QueryOutcome> {
    this.calls.push({ method: "remove", args });
    return Promise.resolve(this.removeOutcome);
  }
}

interface Pending {
  tables: Map<string, FakeQuery[]>;
  rpcs: Map<string, FakeQuery[]>;
  buckets: Map<string, FakeStorageBucket[]>;
}

function dequeue<T>(queue: Map<string, T[]>, key: string, kind: string): T {
  const item = queue.get(key)?.shift();
  if (!item) {
    throw new Error(
      `Unexpected ${kind}("${key}") — queue a fake result for it in the test.`
    );
  }
  return item;
}

export function createFakeDb() {
  const pending: Pending = {
    tables: new Map(),
    rpcs: new Map(),
    buckets: new Map(),
  };

  const from = vi.fn((table: string) =>
    dequeue(pending.tables, table, "from")
  );
  const rpc = vi.fn((fn: string) => dequeue(pending.rpcs, fn, "rpc"));
  const storageFrom = vi.fn((bucket: string) =>
    dequeue(pending.buckets, bucket, "storage.from")
  );

  function push<T>(queue: Map<string, T[]>, key: string, item: T): T {
    const existing = queue.get(key) ?? [];
    existing.push(item);
    queue.set(key, existing);
    return item;
  }

  function queue(
    table: string,
    result: { data?: unknown; error?: unknown } = {}
  ): FakeQuery {
    const data = Object.prototype.hasOwnProperty.call(result, "data")
      ? result.data
      : [];
    return push(
      pending.tables,
      table,
      new FakeQuery({ data, error: result.error ?? null })
    );
  }

  function queueRpc(
    fn: string,
    result: { data?: unknown; error?: unknown } = {}
  ): FakeQuery {
    return push(
      pending.rpcs,
      fn,
      new FakeQuery({ data: result.data ?? null, error: result.error ?? null })
    );
  }

  function queueStorage(
    bucket: string,
    result: {
      signedUrl?: { data?: unknown; error?: unknown };
      upload?: { data?: unknown; error?: unknown };
      remove?: { data?: unknown; error?: unknown };
    } = {}
  ): FakeStorageBucket {
    const outcome = (value?: { data?: unknown; error?: unknown }) => ({
      data: value?.data ?? null,
      error: value?.error ?? null,
    });

    return push(
      pending.buckets,
      bucket,
      new FakeStorageBucket(
        outcome(result.signedUrl),
        outcome(result.upload),
        outcome(result.remove)
      )
    );
  }

  function pendingCalls(): string[] {
    const labels: string[] = [];
    for (const [table, queries] of pending.tables) {
      for (let i = 0; i < queries.length; i += 1) labels.push(`table:${table}`);
    }
    for (const [fn, calls] of pending.rpcs) {
      for (let i = 0; i < calls.length; i += 1) labels.push(`rpc:${fn}`);
    }
    for (const [bucket, calls] of pending.buckets) {
      for (let i = 0; i < calls.length; i += 1) labels.push(`storage:${bucket}`);
    }
    return labels;
  }

  const client = {
    from,
    rpc,
    storage: { from: storageFrom },
  } as unknown as DbClient;

  return {
    client,
    from,
    rpc,
    storageFrom,
    queue,
    queueRpc,
    queueStorage,
    pendingCalls,
  };
}

export type FakeDb = ReturnType<typeof createFakeDb>;

export function methodCalls(
  query: FakeQuery,
  method: string
): unknown[][] {
  return query.calls
    .filter((call) => call.method === method)
    .map((call) => call.args);
}

