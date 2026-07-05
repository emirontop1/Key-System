import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/dashboard');
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }

  if (checking) return null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div className="mono text-dim" style={{ fontSize: 13, letterSpacing: 1, marginBottom: 10 }}>
          KEY-SYSTEM
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
          Task-gated license keys,<br />built for your GUI.
        </h1>
        <p className="text-dim" style={{ marginTop: 14, fontSize: 15, maxWidth: 420, lineHeight: 1.6 }}>
          Create an app, define the steps a player completes, and issue
          single-use keys your Roblox script verifies in one request.
        </p>
      </div>

      <button className="btn btn-primary" onClick={signInWithGoogle} style={{ padding: '12px 24px' }}>
        Continue with Google
      </button>
    </main>
  );
}
