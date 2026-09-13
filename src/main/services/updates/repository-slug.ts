/**
 * `owner/repo` out of whatever git URL form package.json carries.
 *
 * Its own module, with no imports, so it can be unit-tested without pulling in
 * Electron - endpoints.ts needs `app` to locate package.json at runtime, and
 * that would make this untestable if the two lived together.
 */
export function repositorySlug(repositoryUrl: string): string {
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(repositoryUrl)
  if (!match) throw new Error(`Not a GitHub repository URL: ${repositoryUrl}`)
  return match[1]!
}
