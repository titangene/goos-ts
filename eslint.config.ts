// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';

export default withNuxt(
  // Your custom configs here
  eslintConfigPrettier,
  {
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        typescript: true
      }
    },
    rules: {
      'import-x/extensions': ['error', 'always', { ignorePackages: true, checkTypeImports: true }]
    }
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**/server/*'],
              message: "請改用 '@server/...' 匯入，不要使用相對路徑。"
            },
            {
              group: ['../**/app/*'],
              message: "請改用 '@app/...' 匯入，不要使用相對路徑。"
            },
            {
              group: ['../**/e2e/*'],
              message: "請改用 '@test/e2e/...' 匯入，不要使用相對路徑。"
            }
          ]
        }
      ]
    }
  }
);
