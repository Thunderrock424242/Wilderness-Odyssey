type PQueueInstance = {
  add<T>(task: () => Promise<T>): Promise<T>;
};

type PQueueConstructor = new (options: { concurrency: number; intervalCap?: number; interval?: number }) => PQueueInstance;

const nativeImport = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>;

let crashQueuePromise: Promise<PQueueInstance> | null = null;

export async function enqueueCrashTask<T>(task: () => Promise<T>): Promise<T> {
  const queue = await getCrashQueue();
  return queue.add(task);
}

async function getCrashQueue(): Promise<PQueueInstance> {
  crashQueuePromise ??= nativeImport<{ default: PQueueConstructor }>('p-queue')
    .then(({ default: PQueue }) => new PQueue({
      concurrency: 2,
      intervalCap: 8,
      interval: 60_000
    }));

  return crashQueuePromise;
}
