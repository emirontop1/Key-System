import { useEffect } from 'react';
import { useRouter } from 'next/router';

// No login screen anymore - there are no accounts. The first visit to
// /dashboard mints an owner cookie automatically (see /api/apps). This
// page just forwards there so old links to "/" still work.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return null;
}
