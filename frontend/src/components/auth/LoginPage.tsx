import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../../lib/firebase';
import { apiPost } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const onLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const signIn = await signInWithGoogle();
      const resp = await apiPost<{ token: string; user: { id: string; email: string; name?: string; role: string; teamId?: string | null }; isAdmin: boolean }>('/auth/verify', { idToken: signIn.idToken });

      setSession(resp.token, {
        id: resp.user.id,
        email: resp.user.email,
        name: resp.user.name,
        teamId: resp.user.teamId,
        role: resp.user.role,
        isAdmin: resp.isAdmin,
        photoURL: signIn.photoURL || null
      });

      navigate('/dashboard');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="panel w-full max-w-md p-8 space-y-6">
        <div>
          <h1 className="text-4xl tracking-widest font-mono text-cyan">KRONOSPHERE</h1>
          <p className="text-sm text-zinc-400 mt-2">KIIT Quant Championship Trading Arena</p>
        </div>
        <button
          onClick={onLogin}
          disabled={loading}
          className="w-full rounded-lg bg-cyan/20 hover:bg-cyan/30 border border-cyan px-4 py-3 font-medium"
        >
          {loading ? 'Signing In...' : 'Sign in with Google'}
        </button>
        {error && <p className="text-red text-xs break-all">{error}</p>}
      </div>
    </div>
  );
}
