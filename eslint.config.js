// ESLint 9 flat config. Deviation from blueprint "airbnb-ts": airbnb has no
// maintained flat-config release — typescript-eslint recommended + explicit
// no-any (Appendix: "no `any` (CI-enforced)") covers the same intent.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // .claude/** = Claude Code worktrees nested in the repo — not our code
  { ignores: ['**/dist/**', '**/node_modules/**', 'design/**', 'coverage/**', '.claude/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
