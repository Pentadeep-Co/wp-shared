/**
 * The base Vite config for every plugin: settings that hold whether a plugin
 * builds blocks, a React SPA, plain JS, or nothing. Entry points, output
 * formats, externals and plugins belong in the plugin's own vite.config.ts,
 * merged over this (`mergeConfig( createBaseConfig(), { … } )`).
 *
 * Plain JavaScript: Vite hands a config imported from node_modules to Node to
 * run as-is, and Node does not run TypeScript from node_modules.
 *
 * @returns {import('vite').UserConfig}
 */
export function createBaseConfig() {
  return {
    css: {
      transformer: 'lightningcss',
    },
    build: {
      cssMinify: 'lightningcss',
      sourcemap: false,
    },
  };
}
