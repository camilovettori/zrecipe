export type ChannelSource = 'contact' | 'support' | 'internal'

export interface ChannelSourceBadge {
  label: string
  icon: 'mail' | 'chat'
  className: string
}

/** Old rows (pre-migration) have no channel_source — fall back to the
 *  existing channel value so nothing looks broken. */
export function resolveChannelSource(
  channel: string,
  channelSource: string | null | undefined
): ChannelSource {
  if (channelSource === 'contact' || channelSource === 'support' || channelSource === 'internal') {
    return channelSource
  }
  return channel === 'internal' ? 'internal' : 'support'
}

export function getChannelSourceBadge(
  channel: string,
  channelSource: string | null | undefined
): ChannelSourceBadge {
  const source = resolveChannelSource(channel, channelSource)
  switch (source) {
    case 'contact':
      return { label: 'Contact', icon: 'mail', className: 'bg-blue-50 text-blue-600' }
    case 'internal':
      return { label: 'In-app', icon: 'chat', className: 'bg-amber-50 text-amber-700' }
    case 'support':
    default:
      return { label: 'Support', icon: 'mail', className: 'bg-emerald-50 text-emerald-700' }
  }
}
