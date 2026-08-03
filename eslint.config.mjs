// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'

export default withNuxt(
  // Your custom configs here
  eslintConfigPrettier,
  {
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    rules: {
      'import-x/extensions': [
        'error',
        'always',
        { ignorePackages: true, checkTypeImports: true },
      ],
    },
  },
)
