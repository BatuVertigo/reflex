(() => {
  "use strict";

  // Real page: the two Stats Polygun API calls, answered by stats_polygun.py on the Mac. Error messages come from the server, ready to show.
  const SP = window.StatsPolygun;

  async function call(path) {
    let response;
    try {
      response = await fetch(path, { cache: "no-store" });
    } catch (error) {
      throw new Error("Stats Polygun is not reachable. Is the script running on the Mac?");
    }
    const payload = await response.json().catch(() => null);
    if (response.ok && payload) return payload;
    throw new Error((payload && payload.error) || `Stats Polygun answered HTTP ${response.status}. Try again.`);
  }

  SP.source = {
    allTime: playfabId => call(`/api/player/${playfabId}`),
    period: (playfabId, from, to, withMatches) => call(`/api/player/${playfabId}/period?from=${from}&to=${to}&matches=${withMatches ? 1 : 0}`),
  };
})();
