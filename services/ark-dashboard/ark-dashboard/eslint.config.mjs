import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';
import { globalIgnores } from 'eslint/config';

const eslintConfig = [
  globalIgnores(['**/generated/']),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-shadow': ['error'],
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'variableLike',
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
          prefix: ['T'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          custom: {
            regex: '^[IT][A-Z]',
            match: false,
          },
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^[IT][A-Z]',
            match: false,
          },
        },
      ],
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'no-shadow': 'off',
      'no-undef': 'off',
      'import/no-self-import': ['error'],
      'import/no-cycle': [
        'warn',
        {
          ignoreExternal: true,
        },
      ],
      'import/no-absolute-path': ['error'],
      'import/newline-after-import': ['warn'],
      'import/first': ['warn'],
      eqeqeq: 'error',
      curly: 'error',
    },
  },
  eslintPluginPrettierRecommended,
];

export default eslintConfig;
