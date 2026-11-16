import type { ProxyOptions } from 'vite';
/** LAN mode: proxies every non-Vite path to the local WordPress site at `target`. */
export declare const wpProxy: ( target: string ) => Record<string, ProxyOptions>;
