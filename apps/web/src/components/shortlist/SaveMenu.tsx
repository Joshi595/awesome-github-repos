import { useState } from 'preact/hooks';
import { createList, isSaved, toggleRepo } from '../../lib/shortlists';
import { useShortlists } from '../../lib/storage';

/** Checkboxes for every list the repository can be saved to, plus a field to start a new list. */
export function SaveMenu({ repoId }: { repoId: number }) {
  const [lists, setLists] = useShortlists();
  const [name, setName] = useState('');

  const addList = (event: Event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setLists(createList(lists, name, [repoId]));
    setName('');
  };

  return (
    <div class="save-menu">
      {lists.map((list) => (
        <label class="check" key={list.id}>
          <input
            type="checkbox"
            checked={isSaved(lists, list.id, repoId)}
            onChange={() => setLists(toggleRepo(lists, list.id, repoId))}
          />
          <span>{list.name}</span>
          <span class="count">{list.repoIds.length}</span>
        </label>
      ))}
      <form class="inline-form" onSubmit={addList}>
        <input
          type="text"
          value={name}
          placeholder="New list name"
          aria-label="New list name"
          maxLength={60}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <button type="submit" class="button" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
