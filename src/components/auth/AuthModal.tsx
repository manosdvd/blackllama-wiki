'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, LogIn, Mail, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuth } from './AuthContext';
import styles from './AuthModal.module.css';

export default function AuthModal() {
  const { user, closeAuthModal, loginWithEmail, registerWithEmail, login: loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Auto-close when user becomes logged in
  useEffect(() => {
    if (user) {
      closeAuthModal();
    }
  }, [user, closeAuthModal]);

  // Focus trap & keyboard interactions
  useEffect(() => {
    emailInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAuthModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeAuthModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
    } catch (err) {
      console.error(err);
      let friendlyMessage = 'Authentication failed. Please check your credentials.';
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
          friendlyMessage = 'Invalid email or password.';
        } else if (code === 'auth/email-already-in-use') {
          friendlyMessage = 'This email is already registered.';
        } else if (code === 'auth/weak-password') {
          friendlyMessage = 'Password must be at least 6 characters.';
        } else if (code === 'auth/invalid-email') {
          friendlyMessage = 'Invalid email format.';
        } else if (code === 'auth/operation-not-allowed') {
          friendlyMessage = 'Email/Password sign-in is not enabled in Firebase Console.';
        } else {
          const message = 'message' in err ? String((err as { message: string }).message) : '';
          friendlyMessage = `Error (${code}): ${message || 'Authentication error'}`;
        }
      } else if (err) {
        friendlyMessage = String(err);
      }
      setErrorMsg(friendlyMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
      setErrorMsg('Google Sign-In failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation">
      <div 
        ref={modalRef} 
        className={styles.modal} 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="modal-title"
      >
        <button 
          onClick={closeAuthModal} 
          className={styles.closeBtn} 
          aria-label="Close authentication modal"
        >
          <X size={20} />
        </button>

        <header className={styles.header}>
          <div className={styles.iconRing}>
            <Sparkles size={24} className={styles.sparkleIcon} />
          </div>
          <h2 id="modal-title" className={styles.title}>
            {mode === 'signin' ? 'STAFF LOGIN' : 'CREATE STAFF ACCOUNT'}
          </h2>
          <p className={styles.subtitle}>
            {mode === 'signin' 
              ? 'Enter credentials to establish secure ranger session.' 
              : 'Register your email to initialize ranger command profile.'
            }
          </p>
        </header>

        {errorMsg && (
          <div className={styles.errorBanner} role="alert">
            <ShieldAlert size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="auth-email">EMAIL ADDRESS</label>
            <div className={styles.inputWrapper}>
              <Mail size={16} className={styles.inputIcon} />
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                required
                placeholder="ranger@camplawton.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="auth-password">PASSWORD</label>
            <div className={styles.inputWrapper}>
              <Lock size={16} className={styles.inputIcon} />
              <input
                id="auth-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn} 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className={styles.spinner} />
            ) : (
              <>
                <LogIn size={18} />
                <span>{mode === 'signin' ? 'AUTHENTICATE SESSION' : 'INITIALIZE ACCOUNT'}</span>
              </>
            )}
          </button>
        </form>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>OR SECURE IDENTITY PROVIDER</span>
          <span className={styles.dividerLine} />
        </div>

        <button 
          onClick={handleGoogleSignIn} 
          className={styles.googleBtn} 
          disabled={isSubmitting}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24" width="18" height="18">
            <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.65l3.15-3.15C17.45 1.74 14.93 1 12 1 7.37 1 3.42 3.66 1.5 7.57l3.77 2.92C6.18 7.33 8.87 5.04 12 5.04z"/>
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.28 1.47-1.11 2.72-2.36 3.56l3.66 2.84c2.14-1.97 3.39-4.87 3.39-8.55z"/>
            <path fill="#FBBC05" d="M5.27 14.51c-.25-.75-.39-1.56-.39-2.51s.14-1.76.39-2.51L1.5 6.57C.54 8.5.01 10.69.01 13s.53 4.5 1.49 6.43l3.77-2.92z"/>
            <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.66-2.84c-1.01.68-2.3 1.08-4.3 1.08-3.13 0-5.82-2.29-6.77-5.45L1.46 15.8C3.38 19.7 7.34 22.32 12 22.32z"/>
          </svg>
          <span>SIGN IN WITH GOOGLE</span>
        </button>

        <footer className={styles.footer}>
          {mode === 'signin' ? (
            <p>
              New user?{' '}
              <button 
                type="button" 
                onClick={() => setMode('signup')} 
                className={styles.switchLink}
              >
                Create Staff Account
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button 
                type="button" 
                onClick={() => setMode('signin')} 
                className={styles.switchLink}
              >
                Log In Here
              </button>
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
