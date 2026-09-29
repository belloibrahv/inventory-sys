import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// The setup from Next.js's own ESLint guide (flat config, as ESLint 9 needs).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler advice, kept visible as warnings rather than errors.
      // The till and the lists reset state from effects on purpose (a shop
      // switch clears the filter, a new sale clears the reasons); rewriting
      // those two dozen places would risk the counter for no change in what
      // the shop sees. New code should still prefer deriving state.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built by Serwist from src/app/sw.ts at build time.
    "public/sw.js",
    "public/swe-worker-*.js",
  ]),
])

export default eslintConfig
