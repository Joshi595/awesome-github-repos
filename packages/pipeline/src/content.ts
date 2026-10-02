import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CollectionSchema, TaxonomySchema, type Collection, type Taxonomy } from '@agr/schema';
import { parse as parseYaml } from 'yaml';
import { readJson } from './io';

/** Loads and validates the editorial domain taxonomy. */
export function loadTaxonomy(file: string): Taxonomy {
  return TaxonomySchema.parse(readJson(file));
}

/** Loads every `*.yaml` collection in a directory, ordered by file name. */
export function loadCollections(dir: string): Collection[] {
  const files = readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  const collections = files.map((name) => {
    const result = CollectionSchema.safeParse(
      parseYaml(readFileSync(path.join(dir, name), 'utf8')),
    );
    if (!result.success) throw new Error(`Invalid collection ${name}: ${result.error.message}`);
    return result.data;
  });

  const ids = new Set(collections.map((collection) => collection.id));
  if (ids.size !== collections.length) throw new Error('Collection ids must be unique.');
  return collections;
}
