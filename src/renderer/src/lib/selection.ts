import type { Account, AccountView } from '@/types';

/**
 * Forme unique d'une sélection de comptes : identifiants connus, dans l'ordre
 * des comptes, et tout cocher s'écrit liste vide. C'est la règle de
 * `normaliserSelection` dans le store — les deux côtés doivent comparer la même
 * forme, sinon une vue ne se reconnaîtrait plus une fois appliquée.
 */
export function normaliser(accounts: Account[], ids: string[]) {
  const voulus = new Set(ids);
  const retenus = accounts.filter((a) => voulus.has(a.id)).map((a) => a.id);
  return retenus.length === accounts.length ? [] : retenus;
}

export const memeSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** La vue enregistrée qui correspond à ce qui est affiché. « Tous » n'en est pas une. */
export function vueCourante(accounts: Account[], views: AccountView[], selection: string[]) {
  if (selection.length === 0) return null;
  return views.find((vue) => memeSelection(normaliser(accounts, vue.accountIds), selection)) ?? null;
}

/** « Valiuz et Avanteam », « Valiuz, Avanteam et 2 autres ». */
export function nomPropose(comptes: Account[]) {
  const noms = comptes.map((c) => c.name);
  if (noms.length <= 1) return noms[0] ?? '';
  if (noms.length > 3) return `${noms.slice(0, 2).join(', ')} et ${noms.length - 2} autres`;
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}
