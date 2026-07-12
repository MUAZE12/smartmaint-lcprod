import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['e2e/**', 'node_modules/**', '.next/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/lib/**/*.ts'],
            exclude: ['**/*.test.ts', 'src/lib/data.ts', 'src/lib/types.ts'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
