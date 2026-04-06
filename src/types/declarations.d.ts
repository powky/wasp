/**
 * Type declarations for optional dependencies and modules without types
 * These modules are dynamically imported and may not be installed
 */

declare module 'qrcode-terminal' {
  export function generate(text: string, options?: { small?: boolean }): void;
  export function setMaxListeners(n: number): void;
}

declare module 'socks-proxy-agent' {
  export class SocksProxyAgent {
    constructor(url: string);
  }
}

declare module 'pg' {
  export class Pool {
    constructor(config: any);
    connect(): Promise<any>;
    query(sql: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
  }
}

declare module 'ioredis' {
  export default class Redis {
    constructor(options?: any);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    quit(): Promise<string>;
  }
}
