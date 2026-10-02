import { DEFAULT_LIST_ID, isSaved, toggleRepo } from '../../lib/shortlists';
import { MAX_COMPARE, useCompare, useShortlists } from '../../lib/storage';
import { BookmarkIcon, CompareIcon } from '../ui/icons';

interface Props {
  repoId: number;
  /** Shown in the accessible name: "Save owner/name". */
  name: string;
  /** Show a text label next to the icon. */
  labelled?: boolean;
}

/** Saves the repository to the visitor's default list, or removes it. */
export function SaveButton({ repoId, name, labelled = false }: Props) {
  const [lists, setLists] = useShortlists();
  const saved = isSaved(lists, DEFAULT_LIST_ID, repoId);
  return (
    <button
      type="button"
      class={`icon-button ${saved ? 'is-on' : ''} ${labelled ? 'is-labelled' : ''}`}
      aria-pressed={saved}
      aria-label={labelled ? undefined : `${saved ? 'Remove' : 'Save'} ${name}`}
      title={saved ? 'Saved. Click to remove.' : 'Save to your list'}
      onClick={() => setLists(toggleRepo(lists, DEFAULT_LIST_ID, repoId))}
    >
      <BookmarkIcon filled={saved} />
      {labelled && (saved ? 'Saved' : 'Save')}
    </button>
  );
}

/** Adds the repository to, or removes it from, the comparison set. */
export function CompareButton({ repoId, name, labelled = false }: Props) {
  const [ids, setIds] = useCompare();
  const selected = ids.includes(repoId);
  const full = !selected && ids.length >= MAX_COMPARE;
  return (
    <button
      type="button"
      class={`icon-button ${selected ? 'is-on' : ''} ${labelled ? 'is-labelled' : ''}`}
      aria-pressed={selected}
      aria-label={
        labelled
          ? undefined
          : `${selected ? 'Remove' : 'Add'} ${name} ${selected ? 'from' : 'to'} comparison`
      }
      title={
        full
          ? `You can compare up to ${MAX_COMPARE} repositories`
          : selected
            ? 'Remove from comparison'
            : 'Add to comparison'
      }
      disabled={full}
      onClick={() => setIds(selected ? ids.filter((id) => id !== repoId) : [...ids, repoId])}
    >
      <CompareIcon />
      {labelled && (selected ? 'In comparison' : 'Compare')}
    </button>
  );
}
