export function connect(sessionId, onEvent) {
  let retry = 500;
  let closed = false;
  let socket;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws?session=${sessionId}`);
    socket.onopen = () => { retry = 500; };
    socket.onmessage = (e) => onEvent(JSON.parse(e.data));
    socket.onclose = () => {
      if (closed) return;
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 8000);
    };
  };
  open();
  return () => { closed = true; socket.close(); };
}
