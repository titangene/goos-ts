export class Announcer<T extends object> {
  private readonly listeners: T[] = [];
  private readonly proxy: T;

  private constructor() {
    this.proxy = new Proxy({} as T, {
      get: (_target, prop) => {
        return (...args: unknown[]) => {
          this.listeners.forEach((listener) => {
            const method = listener[prop as keyof T];
            if (typeof method === 'function') {
              (method as (...methodArgs: unknown[]) => void).apply(listener, args);
            }
          });
        };
      },
    });
  }

  addListener(listener: T): void {
    this.listeners.push(listener);
  }

  removeListener(listener: T): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  announce(): T {
    return this.proxy;
  }

  static to<T extends object>(): Announcer<T> {
    return new Announcer<T>();
  }
}
