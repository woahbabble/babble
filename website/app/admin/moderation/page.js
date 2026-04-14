import AdminModerationClient from '../../../components/AdminModerationClient'

export const dynamic = 'force-dynamic'

export default async function ModerationPage({ searchParams }) {
  const resolved = await searchParams
  const status = ['open', 'resolved', 'dismissed'].includes(resolved.status)
    ? resolved.status
    : 'open'

  return <AdminModerationClient initialStatus={status} />
}
