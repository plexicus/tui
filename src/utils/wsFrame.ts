// Frames come in two shapes: flat (workflow_status notifications) and `{ request_type, data: {...} }`
// (trigger-*/status-* events, fastapi/routes/socket.py). Read fields from both.
export function frameFields(msg: Record<string, unknown>): Record<string, unknown> {
  const inner = msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data)
    ? (msg.data as Record<string, unknown>)
    : {}
  return { ...inner, ...msg }
}
