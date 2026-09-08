export async function request<T>(
  query: string,
  variables: Record<string, unknown> = {},
  role = 'OWNER',
): Promise<T> {
  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': role },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors)
    throw new Error(result.errors?.[0]?.message || result.error || 'Request failed');
  return result.data as T;
}
