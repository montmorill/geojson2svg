import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['test/**'],
    rules: {
      // tests intentionally exercise the built output in dist/
      'antfu/no-import-dist': 'off',
    },
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
      },
    },
  },
)
