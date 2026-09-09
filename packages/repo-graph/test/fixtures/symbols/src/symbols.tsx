export interface User {}

/** Finds users in the local cache. */
export class UserService {
  find(): User | undefined {
    return cache[0];
  }
}

/**
 * Renders a compact user card for repository graph extraction while carrying a deliberately long documentation summary that verifies bounded persistence without retaining complete source text. This sentence continues with stable fixture prose so the extracted summary exceeds the storage boundary and must be truncated deterministically. The remaining words describe presentation, accessibility, identity, navigation, layout, ownership, verification, compiler evidence, repository evidence, declaration evidence, and source evidence without adding implementation behavior. This final fixture sentence pushes the summary beyond five hundred characters.
 */
export function UserCard({ user }: { user: User }) {
  return <article>{String(user)}</article>;
}

const cache: User[] = [];
