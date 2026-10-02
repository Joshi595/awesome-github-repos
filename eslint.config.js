import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      'data/**',
      'venv_github/**',
      'legacy-src/**',
      '**/*.astro',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Tool configuration runs in Node.
    files: ['**/*.config.{js,mjs,ts}'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
);
