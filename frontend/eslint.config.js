import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Principle III: pages and components depend on service interfaces only.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/createServiceRegistry.ts', 'src/services/mock/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)services/mock(/|$)',
              message:
                'Use useServiceRegistry() instead; only src/services/createServiceRegistry.ts may import mock implementations.',
            },
          ],
        },
      ],
    },
  },
);
