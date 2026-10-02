import { repoToolLinks } from '../../lib/repo-tools';
import { ExternalIcon } from '../ui/icons';

/** One-click links to third-party tools that explain, diagram or digest the repository. */
export function RepoTools({ name }: { name: string }) {
  return (
    <div class="repo-tools">
      <ul>
        {repoToolLinks(name).map((tool) => (
          <li key={tool.id}>
            <a href={tool.url} target="_blank" rel="noreferrer">
              <strong>
                {tool.label} <ExternalIcon />
              </strong>
              <span>{tool.description}</span>
            </a>
          </li>
        ))}
      </ul>
      <p class="hint">
        These open independent third-party sites, which may be slow or unavailable for very large
        repositories.
      </p>
    </div>
  );
}
