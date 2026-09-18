(() => {
  "use strict";

  // Real page: the two Stats Polygun API calls, answered by stats_polygun.py on the Mac. Error messages come from the server, ready to show.
  const SP = window.StatsPolygun;
  const UNREACHABLE = "Stats Polygun is not reachable. Is the script running on the Mac?";

  // The server answers with one JSON line per event: {waiting}, {done, total} after each TE query, then {result} or {error}.
  // onProgress gets every event before the last one.
  async function call(path, onProgress) {
    let response;
    try {
      response = await fetch(path, { cache: "no-store" });
    } catch (error) {
      throw new Error(UNREACHABLE);
    }
    // Bad input is refused with one JSON object before any line; a server not restarted since the loading bar came answers the same way.
    if (!response.ok || !(response.headers.get("Content-Type") || "").includes("ndjson")) {
      const payload = await response.json().catch(() => null);
      if (response.ok && payload) return payload;
      throw new Error((payload && payload.error) || `Stats Polygun answered HTTP ${response.status}. Try again.`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        throw new Error(UNREACHABLE);
      }
      // The answer ended without a result: the script stopped mid-search.
      if (chunk.done) throw new Error(UNREACHABLE);
      buffer += chunk.value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if ("result" in event) return event.result;
        if (onProgress) onProgress(event);
      }
    }
  }

  SP.source = {
    find: (name, onProgress) => call(`/api/find?name=${encodeURIComponent(name)}`, onProgress),
    allTime: (playfabId, onProgress) => call(`/api/player/${playfabId}`, onProgress),
    period: (playfabId, from, to, withMatches, onProgress) => call(`/api/player/${playfabId}/period?from=${from}&to=${to}&matches=${withMatches ? 1 : 0}`, onProgress),
  };
})();
