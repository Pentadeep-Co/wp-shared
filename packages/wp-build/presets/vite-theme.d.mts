import type { UserConfigFnObject } from 'vite';
/** The base Vite config for every theme: `defineConfig( getBaseConfig( import.meta.dirname ) )`. */
export declare const getBaseConfig: ( themeDir: string ) => UserConfigFnObject;
