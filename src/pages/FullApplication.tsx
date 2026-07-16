import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isConfigured, supabase } from '../lib/supabase'
import { getCurrentUserTag } from '../lib/userTags'

export default function FullApplication() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin', { replace: true })
      return
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate('/quotelogin', { replace: true })
        return
      }

      const userTag = await getCurrentUserTag(data.user.id).catch(() => null)
      if (userTag !== 'developer') {
        navigate('/deshazo-internal-dashboard', { replace: true })
      }
    })
  }, [navigate])

  return null
}
