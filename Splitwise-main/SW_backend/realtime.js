export function createRealtimeHub() {
  const channels = new Map();

  function subscribe(channel, response) {
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(response);
    return () => {
      const listeners = channels.get(channel);
      listeners?.delete(response);
      if (!listeners?.size) channels.delete(channel);
    };
  }

  function publish(channel, event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const response of channels.get(channel) || []) response.write(payload);
  }

  return { subscribe, publish };
}
