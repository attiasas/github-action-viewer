import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { globalIgnores } from 'eslint/config'

export default [
  globalIgnores(['dist']),
  js.configs.recommended,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  // Node.js globals for backend and tests
  {
    files: ['server/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
  },
  // Test globals for test files
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.node, ...globals.jest },
    },
  },
  // Exclude TypeScript/TSX files from linting
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.ts', '**/*.tsx'],
  },
  // Browser globals for frontend JS/JSX
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
]
