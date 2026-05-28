import { TableSkeleton } from '@/components/shared/Skeletons'

export default function Loading() {
  return <TableSkeleton rows={5} columns={6} />
}
