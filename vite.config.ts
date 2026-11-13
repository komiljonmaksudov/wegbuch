import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				experimental: { async: true },
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Remote functions (query, form, command) and Svelte's `await` in components. Both are experimental.
			experimental: { remoteFunctions: true },
			// The public origin, used for the CSRF check on form posts. adapter-node assumes https
			// when it cannot tell, so set it at build time for a plain-http run:
			//   ORIGIN=http://localhost:3000 bun run build
			paths: { origin: process.env.ORIGIN }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
