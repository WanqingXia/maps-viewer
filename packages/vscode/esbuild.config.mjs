import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[esbuild] watching for changes...');
} else {
  await build(options);
}
