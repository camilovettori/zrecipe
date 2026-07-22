export function formatTicketNumber(
  n: number,
  createdAt: string | Date,
  kind: 'ticket' | 'announcement' = 'ticket'
): string {
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const seq = String(n).padStart(4, '0')
  const prefix = kind === 'announcement' ? 'A' : '#'
  return `${prefix}${year}${month}${seq}`
}
