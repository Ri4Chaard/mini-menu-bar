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

/**
 * SC-007: every colour, radius and spacing value resolves to a token declared
 * once in theme.css. A hex literal inside a section or component is the exact
 * drift this rule exists to catch, and catching it at lint time is what makes
 * the criterion mechanical rather than a review convention.
 *
 * Scoped to sections/ and components/ — theme.css owns the literals, and
 * host/, motion/ and main/ have no colour in them to begin with.
 */
const NO_COLOUR_LITERALS = [
  {
    selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
    message:
      'No colour literals here (SC-007). Reference a token from theme.css, e.g. var(--color-accent). New colours are added to contracts/design-tokens.md and theme.css together.'
  },
  {
    selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
    message:
      'No colour literals here (SC-007). Reference a token from theme.css, e.g. var(--color-accent).'
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
    files: ['src/renderer/sections/**/*.{ts,tsx}', 'src/renderer/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...HOST_GLOBALS_BANNED,
        ...LUCIDE_NAMED_ONLY,
        ...NO_COLOUR_LITERALS
      ]
    }
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.mjs', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
)
