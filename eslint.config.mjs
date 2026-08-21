import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * The two custom rules below are not style preferences — they are the
 * mechanical enforcement the constitution requires:
 *   - Principle I: no host globals outside src/renderer/host/
 *   - research.md R-009: named lucide-react imports only (payload budget)
 */
const HOST_GLOBALS_BANNED = [
  {
    // Matches the identifier wherever it appears, including through a cast such
    // as `(window as unknown as {...}).__hostBridge`. An `object.name='window'`
    // selector would miss exactly that shape - which is the shape real code uses.
    selector: "Identifier[name='__hostBridge']",
    message:
      'The host global is confined to src/renderer/host/ (constitution Principle I). Reach the host through the HostBridge interface instead.'
  },
  {
    selector: "Identifier[name='ipcRenderer']",
    message: 'ipcRenderer is confined to src/preload/. Use the HostBridge interface.'
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: 'require() is not available in the renderer. Use the HostBridge interface.'
  },
  {
    selector: "MemberExpression[object.name='process']",
    message: 'process is not available in the renderer. Use the HostBridge interface.'
  }
]

const LUCIDE_NAMED_ONLY = [
  {
    selector: "ImportDeclaration[source.value='lucide-react'] > ImportNamespaceSpecifier",
    message: 'Import icons by name from lucide-react. Namespace imports defeat tree-shaking (R-009).'
  },
  {
    selector: "ImportDeclaration[source.value='lucide-react'] > ImportDefaultSpecifier",
    message: 'Import icons by name from lucide-react. Default imports defeat tree-shaking (R-009).'
  }
]

export default tseslint.config(
  { ignores: ['out/', 'dist/', 'release/', 'node_modules/', 'coverage/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-syntax': ['error', ...HOST_GLOBALS_BANNED, ...LUCIDE_NAMED_ONLY]
    }
  },
  {
    // The single doorway to the host. This is the only place the ban is lifted.
    files: ['src/renderer/host/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...LUCIDE_NAMED_ONLY]
    }
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
)
