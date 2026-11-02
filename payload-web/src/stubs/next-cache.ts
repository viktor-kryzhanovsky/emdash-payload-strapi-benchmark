// payload/src/lib/{data,revalidate}.ts import next/cache. There is no Next here, so this module
// stands in for it: with CMS_CACHE=data, data.ts wraps its Local API calls in unstable_cache, and
// this is a plain in-process cache with tags. Writes happen in the Payload (Next) process, whose
// hooks call POST /api/revalidate here (src/pages/api/revalidate.ts) -> revalidateTag.
type Entry = { value: Promise<unknown>; tags: string[] };

const store = new Map<string, Entry>();

export function unstable_cache<A extends unknown[], R>(
	fn: (...args: A) => Promise<R>,
	keyParts: string[] = [],
	options: { tags?: string[] } = {},
) {
	return (...args: A): Promise<R> => {
		const key = JSON.stringify([keyParts, args]);
		const hit = store.get(key);
		if (hit) return hit.value as Promise<R>;
		// The promise is stored, so concurrent misses share one query.
		const value = fn(...args);
		store.set(key, { value, tags: options.tags ?? [] });
		value.catch(() => store.delete(key));
		return value;
	};
}

export function revalidateTag(tag: string, ..._profile: unknown[]) {
	for (const [key, entry] of store) if (entry.tags.includes(tag)) store.delete(key);
}

export const revalidatePath = (..._args: unknown[]) => {};
