import path from 'path';
import { loadEnv } from 'vite';
import liveReload from 'vite-plugin-live-reload';
import { wpProxy } from './wp-proxy.mjs';

/**
 * The base Vite config for every theme: `vite.config.ts` is
 * `export default defineConfig( getBaseConfig( import.meta.dirname ) )`.
 *
 * Builds `src/ts/main.ts` and `src/css/main.css` into `wp/dist/` with a
 * manifest (the theme's PHP enqueues through it), live-reloads on `wp/` and
 * `src/` changes, and serves assets to localhost:5173.
 *
 * `vite --mode lan` (a theme's `pnpm dev:lan`) fronts the local WordPress site
 * named by WP_PROXY_TARGET in the theme's `.env.lan`, on the network — see
 * wp-proxy.mjs.
 *
 * Plain JavaScript: Vite hands a config imported from node_modules to Node to
 * run as-is, and Node does not run TypeScript from node_modules.
 *
 * @param {string} themeDir The theme repo's root.
 * @returns {import('vite').UserConfigFnObject}
 */
export const getBaseConfig = ( themeDir ) => ( { mode } ) => {
  const proxyTarget = mode === 'lan'
    ? loadEnv( mode, themeDir, 'WP_' ).WP_PROXY_TARGET
    : undefined;

  if ( mode === 'lan' && ! proxyTarget ) {
    throw new Error( `--mode lan needs WP_PROXY_TARGET in ${ path.join( themeDir, '.env.lan' ) }` );
  }

  return {
    base: '',
    server: {
      /* In LAN mode the page and its assets share the dev server's origin,
         whatever host the browser used, so asset URLs stay relative. */
      origin: proxyTarget ? undefined : 'http://localhost:5173',
      host: proxyTarget ? true : undefined,
      cors: true,
      strictPort: true,
      proxy: proxyTarget ? wpProxy( proxyTarget ) : undefined,
    },
    build: {
      outDir: 'wp/dist',
      manifest: true,
      cssMinify: 'lightningcss',
      rollupOptions: {
        input: {
          main: path.resolve( themeDir, 'src/ts/main.ts' ),
          style: path.resolve( themeDir, 'src/css/main.css' ),
        },
      },
    },
    plugins: [
      liveReload( [
        `${ themeDir }/wp/**/*`,
        `${ themeDir }/wp/**/**/*`,
        `${ themeDir }/src/**/*`,
      ] ),
    ],
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        drafts: {
          customMedia: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve( themeDir, 'src' ),
        '@css': path.resolve( themeDir, 'src/css' ),
        '@ts': path.resolve( themeDir, 'src/ts' ),
      },
    },
  };
};
