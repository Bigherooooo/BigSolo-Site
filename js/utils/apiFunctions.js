export function json(json, init) {
    return new Response(JSON.stringify(json), {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
}
