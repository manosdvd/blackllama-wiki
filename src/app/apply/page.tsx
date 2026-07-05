'use client';

import React, { FormEvent, useState, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { ArrowLeft, ArrowRight, Check, HelpCircle, FileText, Info } from 'lucide-react';
import styles from './page.module.css';

export default function ApplyPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBsaHelp, setShowBsaHelp] = useState(false);

  // Form Field State to support review step
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    bsaId: '',
    council: 'Catalina Council',
    scoutingExperience: '',
    roleType: '',
    areaOfInterest: '',
  });

  const formRef = useRef<HTMLFormElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = (stepNum: number): boolean => {
    if (!formRef.current) return false;
    const stepSection = formRef.current.querySelector(`#step-section-${stepNum}`);
    if (!stepSection) return true;

    const fields = stepSection.querySelectorAll('input, select, textarea');
    let isValid = true;
    
    // Validate each field in current step
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (!field.checkValidity()) {
        field.reportValidity();
        isValid = false;
        break;
      }
    }
    return isValid;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateStep(3)) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to submit application.');
      
      setMessage('Application successfully submitted! Reviewers will notify you once onboarding access is approved.');
      setCurrentStep(4); // success step
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const getAreaLabel = (area: string) => {
    const labels: Record<string, string> = {
      aquatics: 'Aquatics',
      scoutcraft: 'Scoutcraft',
      nature: 'Nature',
      handicraft: 'Handicraft',
      shootingSports: 'Shooting Sports',
      tradingPost: 'Trading Post',
      kitchen: 'Kitchen / Dining',
      maintenance: 'Ranger / Maintenance',
      admin: 'Administration / HQ',
    };
    return labels[area] || area;
  };

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Camp Lawton Staff Application</h1>
        <p>Start your journey as a part of the Camp Lawton team.</p>
        {!user && (
          <div className={styles.signInCard} role="note">
            <Info size={16} />
            <span>Sign in with Google from the header first if you want this application linked to your portal account.</span>
          </div>
        )}
      </header>

      {/* Pre-Form Instruction Card */}
      {currentStep === 1 && (
        <div className={styles.welcomeCard}>
          <h3>Welcome Applicants</h3>
          <p>This form takes approximately <strong>3 minutes</strong> to complete. Please provide accurate details. Fields marked with <span className={styles.requiredStar}>*</span> are required.</p>
          <div className={styles.reqNote}>
            <strong>Required documents:</strong> No file uploads are required now. After approval, you will complete youth protection training and onboarding paperwork on the secure council portals.
          </div>
        </div>
      )}

      {/* Progressive Step Progress Bar */}
      {currentStep <= 3 && (
        <div className={styles.progressContainer}>
          <div className={styles.progressHeader}>
            <span>Step {currentStep} of 3</span>
            <strong>
              {currentStep === 1 && 'Personal Information'}
              {currentStep === 2 && 'Scouting Experience'}
              {currentStep === 3 && 'Role Details & Review'}
            </strong>
          </div>
          <div className={styles.progressBarBg} role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={3}>
            <div 
              className={styles.progressBarFill} 
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && <div className={styles.errorMessage} role="alert">{error}</div>}

      <form ref={formRef} className={styles.applicationForm} onSubmit={handleSubmit} noValidate>
        
        {/* STEP 1: Personal Information */}
        {currentStep === 1 && (
          <section id="step-section-1" className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <h2>Personal Information</h2>
              <span className={styles.legend}>* Indicates required field</span>
            </div>
            
            <div className={styles.singleColumnLayout}>
              <div className={styles.inputGroup}>
                <label htmlFor="firstName">First Name <span className={styles.requiredStar}>*</span></label>
                <input 
                  type="text" 
                  id="firstName" 
                  name="firstName" 
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                  placeholder="e.g. Robert"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="lastName">Last Name <span className={styles.requiredStar}>*</span></label>
                <input 
                  type="text" 
                  id="lastName" 
                  name="lastName" 
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                  placeholder="e.g. Baden-Powell"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="email">Email Address <span className={styles.requiredStar}>*</span></label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  value={formData.email}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                  placeholder="e.g. bp@scouting.org"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="phone">Phone Number <span className={styles.requiredStar}>*</span></label>
                <input 
                  type="tel" 
                  id="phone" 
                  name="phone" 
                  value={formData.phone}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                  placeholder="e.g. 520-555-0110"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="dob">Date of Birth <span className={styles.requiredStar}>*</span></label>
                <input 
                  type="date" 
                  id="dob" 
                  name="dob" 
                  value={formData.dob}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                />
              </div>
            </div>

            <div className={styles.navRow}>
              <button type="button" onClick={handleNext} className={styles.nextBtn}>
                <span>Scouting Experience</span> <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: Scouting Experience */}
        {currentStep === 2 && (
          <section id="step-section-2" className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <h2>Scouting Experience</h2>
              <span className={styles.legend}>* Indicates required field</span>
            </div>

            <div className={styles.singleColumnLayout}>
              <div className={styles.inputGroup}>
                <div className={styles.labelWithHelp}>
                  <label htmlFor="bsaId">BSA ID (optional)</label>
                  <button 
                    type="button" 
                    onClick={() => setShowBsaHelp(!showBsaHelp)} 
                    className={styles.helpToggle}
                    title="What is a BSA ID?"
                    aria-expanded={showBsaHelp}
                  >
                    <HelpCircle size={15} />
                  </button>
                </div>
                
                {showBsaHelp && (
                  <div className={styles.helpPanel}>
                    <p>Your 9-digit member registration ID. You can find this on your registration card or inside your my.scouting.org profile. Leave blank if not registered.</p>
                  </div>
                )}

                <input 
                  type="text" 
                  id="bsaId" 
                  name="bsaId" 
                  value={formData.bsaId}
                  onChange={handleInputChange}
                  placeholder="e.g. 123456789"
                  pattern="[0-9]*"
                  inputMode="numeric"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="council">Current Council</label>
                <input 
                  type="text" 
                  id="council" 
                  name="council" 
                  value={formData.council}
                  onChange={handleInputChange}
                  placeholder="Catalina Council"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="scoutingExperience">Relevant Experience & skills</label>
                <textarea 
                  id="scoutingExperience" 
                  name="scoutingExperience" 
                  value={formData.scoutingExperience}
                  onChange={handleInputChange}
                  rows={4} 
                  placeholder="Tell reviewers about your camp staff background, scouting achievements (Eagle, OA), or program specialties." 
                />
              </div>
            </div>

            <div className={styles.navRow}>
              <button type="button" onClick={handleBack} className={styles.backBtn}>
                <ArrowLeft size={16} /> <span>Personal Info</span>
              </button>
              <button type="button" onClick={handleNext} className={styles.nextBtn}>
                <span>Role Details</span> <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: Role interest & review */}
        {currentStep === 3 && (
          <section id="step-section-3" className={styles.formSection}>
            <div className={styles.sectionTitle}>
              <h2>Role Interest</h2>
              <span className={styles.legend}>* Indicates required field</span>
            </div>

            <div className={styles.singleColumnLayout}>
              <div className={styles.inputGroup}>
                <label htmlFor="roleType">Role Type <span className={styles.requiredStar}>*</span></label>
                <select 
                  id="roleType" 
                  name="roleType" 
                  value={formData.roleType}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                >
                  <option value="">Select an option</option>
                  <option value="paid">Paid Staff (Must be 16+ for most roles)</option>
                  <option value="volunteer">Volunteer (CIT / Adult Scouter)</option>
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="areaOfInterest">Preferred Area of Work <span className={styles.requiredStar}>*</span></label>
                <select 
                  id="areaOfInterest" 
                  name="areaOfInterest" 
                  value={formData.areaOfInterest}
                  onChange={handleInputChange}
                  required 
                  aria-required="true"
                >
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
            </div>

            {/* Application Summary Review */}
            <div className={styles.reviewPanel}>
              <h3>Review Details</h3>
              <div className={styles.reviewGrid}>
                <div><strong>Name:</strong> {formData.firstName} {formData.lastName}</div>
                <div><strong>Email:</strong> {formData.email}</div>
                <div><strong>Phone:</strong> {formData.phone}</div>
                <div><strong>DOB:</strong> {formData.dob}</div>
                <div><strong>BSA ID:</strong> {formData.bsaId || 'None'}</div>
                <div><strong>Council:</strong> {formData.council}</div>
                <div><strong>Role:</strong> {formData.roleType === 'paid' ? 'Paid Staff' : 'Volunteer'}</div>
                <div><strong>Area:</strong> {getAreaLabel(formData.areaOfInterest)}</div>
              </div>
            </div>

            <div className={styles.disclaimerBox}>
              <p>
                By submitting this form, you acknowledge that further official documentation 
                (including Medical Records, Background Checks, and I-9/W-4 if paid) will be 
                required via official Catalina Council channels before employment or volunteering begins.
              </p>
            </div>

            <div className={styles.navRow}>
              <button type="button" onClick={handleBack} className={styles.backBtn} disabled={submitting}>
                <ArrowLeft size={16} /> <span>Scouting Experience</span>
              </button>
              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </section>
        )}

        {/* STEP 4: Success Screen */}
        {currentStep === 4 && (
          <section className={styles.successSection}>
            <div className={styles.successIconWrapper}>
              <Check size={48} />
            </div>
            <h2>Application Submitted!</h2>
            <p className={styles.successText}>{message}</p>
            <div className={styles.nextStepsCard}>
              <h4>Next Steps:</h4>
              <ul>
                <li>Your submission has been added to the reviewer queue.</li>
                <li>Once reviews are complete, onboarding access will be unlocked.</li>
                <li>Check your Onboarding profile using the button below.</li>
              </ul>
            </div>
            <div className={styles.successNav}>
              <Link href="/onboarding" className={styles.profileBtn}>
                <FileText size={16} /> <span>View Onboarding Profile</span>
              </Link>
              <Link href="/" className={styles.homeBtn}>
                <span>Go to Dashboard</span>
              </Link>
            </div>
          </section>
        )}

      </form>
    </div>
  );
}
