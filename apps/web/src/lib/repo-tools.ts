/**
 * Third-party sites that explain a repository when you swap `github.com` in
 * its address for their own domain. They are independent services: the site
 * only links to them. To add or drop one, edit this list.
 */
export interface RepoTool {
  id: string;
  label: string;
  /** What you get, in a few words. */
  description: string;
  host: string;
}

export const REPO_TOOLS: readonly RepoTool[] = [
  {
    id: 'explain',
    label: 'Explain',
    description: 'A plain-language walkthrough of what the project is and does',
    host: 'explaingithub.com',
  },
  {
    id: 'diagram',
    label: 'Diagram',
    description: 'An interactive architecture diagram of the codebase',
    host: 'gitdiagram.com',
  },
  {
    id: 'ingest',
    label: 'Ingest for AI',
    description: 'The whole repository as one text digest to paste into an AI assistant',
    host: 'gitingest.com',
  },
  {
    id: 'reverse',
    label: 'Reverse prompt',
    description: 'A prompt describing how to rebuild the project',
    host: 'gitreverse.com',
  },
];

export interface RepoToolLink extends RepoTool {
  url: string;
}

/** Links for one repository, given its `owner/name`. */
export function repoToolLinks(name: string): RepoToolLink[] {
  return REPO_TOOLS.map((tool) => ({ ...tool, url: `https://${tool.host}/${name}` }));
}
