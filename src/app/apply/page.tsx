'use client';

import React, { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import styles from './page.module.css';

export default function ApplyPage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      const token = await user?.getIdToken();
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to submit application.');
      setMessage('Application submitted. Admin review can now move it into onboarding.');
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Camp Lawton Staff Application</h1>
        <p>Start your journey as a part of the Camp Lawton team. Please fill out the initial application below. Once approved, you will be granted access to the full Staff Portal to complete onboarding.</p>
        {!user && <p className={styles.signInHint}>Sign in with Google from the header first if you want this application linked to your portal account.</p>}
      </header>

      {message && (
        <div className={styles.successMessage}>
          {message} <Link href="/onboarding">View onboarding</Link>
        </div>
      )}
      {error && <div className={styles.errorMessage}>{error}</div>}

      <form className={styles.applicationForm} onSubmit={handleSubmit}>
        <section className={styles.formSection}>
          <h2>Personal Information</h2>
          <div className={styles.inputGroup}>
            <label htmlFor="firstName">First Name</label>
            <input type="text" id="firstName" name="firstName" required />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="lastName">Last Name</label>
            <input type="text" id="lastName" name="lastName" required />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email Address</label>
            <input type="email" id="email" name="email" required />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="phone">Phone Number</label>
            <input type="tel" id="phone" name="phone" required />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="dob">Date of Birth</label>
            <input type="date" id="dob" name="dob" required />
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Scouting Experience</h2>
          <div className={styles.inputGroup}>
            <label htmlFor="bsaId">BSA ID (if currently registered)</label>
            <input type="text" id="bsaId" name="bsaId" />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="council">Current Council</label>
            <input type="text" id="council" name="council" defaultValue="Catalina Council" />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="scoutingExperience">Relevant Experience</label>
            <textarea id="scoutingExperience" name="scoutingExperience" rows={4} placeholder="Training, camp staff history, program area experience, or anything reviewers should know." />
          </div>
        </section>

        <section className={styles.formSection}>
          <h2>Role Interest</h2>
          <div className={styles.inputGroup}>
            <label htmlFor="roleType">Are you applying for a Paid or Volunteer role?</label>
            <select id="roleType" name="roleType" required>
              <option value="">Select an option</option>
              <option value="paid">Paid Staff (Must be 16+ for most roles)</option>
              <option value="volunteer">Volunteer (CIT / Adult Scouter)</option>
            </select>
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor="areaOfInterest">Preferred Area of Work</label>
            <select id="areaOfInterest" name="areaOfInterest" required>
              <option value="">Select an area</option>
              <option value="aquatics">Aquatics</option>
              <option value="scoutcraft">Scoutcraft</option>
              <option value="nature">Nature</option>
              <option value="handicraft">Handicraft</option>
              <option value="shootingSports">Shooting Sports</option>
              <option value="tradingPost">Trading Post</option>
              <option value="kitchen">Kitchen / Dining</option>
              <option value="maintenance">Ranger / Maintenance</option>
              <option value="admin">Administration / HQ</option>
            </select>
          </div>
        </section>

        <div className={styles.submitSection}>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
          <p className={styles.disclaimer}>
            By submitting this form, you acknowledge that further official documentation 
            (including Medical Records, Background Checks, and I-9/W-4 if paid) will be 
            required via official Catalina Council channels before employment or volunteering begins.
          </p>
        </div>
      </form>
    </div>
  );
}
