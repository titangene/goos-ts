// @ts-check
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';

import withNuxt from './.nuxt/eslint.config.mjs';

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
      'import-x/extensions': ['error', 'always', { ignorePackages: true, checkTypeImports: true }],
      'import-x/order': [
        'error',
        {
          groups: [
            ['builtin', 'external'],
            ['internal', 'parent', 'sibling', 'index', 'object']
          ],
          pathGroups: [
            { pattern: '@server/**', group: 'internal' },
            { pattern: '@app/**', group: 'internal' },
            { pattern: '@shared/**', group: 'internal' },
            { pattern: '@test/**', group: 'internal' }
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true }
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message:
                "禁止使用 '../' 相對路徑往上層目錄匯入，請改用對應的別名（@server / @app / @shared / @test）。"
            }
          ]
        }
      ]
    }
  },
  {
    // tools/ 不是 Nuxt app 的一部分，是用 `tsx` 直接執行的。
    // `#server` 是 Nitro/Nuxt bundler 內建的虛擬別名，只有經過
    // Nuxt/Nitro 或 Playwright 自己的 transform pipeline
    // 才會認得；Node 原生 ESM resolver 不認得 `#server`，
    // 所以 tools/ 底下改用 `../server/*` 相對路徑匯入
    files: ['tools/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  }
);
