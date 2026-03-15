const SESSION_PREFIX = "session:";

export function saveSession(id: string, sessionToken: string): void {
  localStorage.setItem(`${SESSION_PREFIX}${id}`, sessionToken);
}

export function getSession(id: string): string | null {
  return localStorage.getItem(`${SESSION_PREFIX}${id}`);
}

export function removeSession(id: string): void {
  localStorage.removeItem(`${SESSION_PREFIX}${id}`);
}

export function getAllSessions(): Array<{ id: string; sessionToken: string }> {
  const sessions: Array<{ id: string; sessionToken: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SESSION_PREFIX)) {
      const id = key.slice(SESSION_PREFIX.length);
      const sessionToken = localStorage.getItem(key);
      if (sessionToken) {
        sessions.push({ id, sessionToken });
      }
    }
  }
  return sessions;
}
