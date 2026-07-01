import React from 'react';
import styles from './page.module.css';

export default function OnboardingPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1>Staff Onboarding Checklist</h1>
        <p>
          Welcome to the team! Before you arrive at camp, you must complete the following documentation.
          For your security and privacy, most of these documents are handled through official secure channels.
          Click the links to open the official forms, fill them out, and follow the submission instructions provided on each form.
        </p>
      </header>

      <div className={styles.checklistGrid}>
        <section className={styles.checklistSection}>
          <div className={styles.sectionHeader}>
            <h2>Required for ALL Staff</h2>
            <span className={styles.badge}>Mandatory</span>
          </div>
          <ul className={styles.taskList}>
            <li>
              <div className={styles.taskInfo}>
                <strong>Staff Application</strong>
                <p>Submitted online via our portal.</p>
              </div>
              <span className={styles.statusPending}>Pending Review</span>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Letter of Agreement</strong>
                <p>Will be provided by the Camp Director.</p>
              </div>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Signed Code of Conduct</strong>
                <p>Read and sign the standard code of conduct.</p>
              </div>
              <a href="#" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Download PDF</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Annual Health & Medical Record (Parts A, B, C)</strong>
                <p>Requires physical exam within the last 12 months.</p>
              </div>
              <a href="https://www.scouting.org/health-and-safety/ahmr/" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Official Site</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Vehicle Permit Form</strong>
                <p>Required if you are bringing a vehicle to camp.</p>
              </div>
              <a href="#" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Download PDF</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Venture / Leader Application</strong>
                <p>Required if you are not currently registered.</p>
              </div>
              <a href="https://my.scouting.org" className={styles.externalLink} target="_blank" rel="noopener noreferrer">my.scouting.org</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Background Check Validation</strong>
                <p>Completed via Catalina Council.</p>
              </div>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Safeguarding Youth Training</strong>
                <p>Must be completed annually.</p>
              </div>
              <a href="https://my.scouting.org" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Training Portal</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Hazardous Weather Training</strong>
                <p>Online module required before youth participants arrive.</p>
              </div>
              <a href="https://my.scouting.org" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Training Portal</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Workplace Harassment Prevention</strong>
                <p>Skillsoft compliance training.</p>
              </div>
              <a href="https://www.skillsoftcompliance.com/Academy/Commonui/login.aspx" className={styles.externalLink} target="_blank" rel="noopener noreferrer">Skillsoft</a>
            </li>
          </ul>
        </section>

        <section className={styles.checklistSection}>
          <div className={styles.sectionHeader}>
            <h2>Required for PAID Staff Only</h2>
            <span className={styles.badgePaid}>Paid Roles</span>
          </div>
          <ul className={styles.taskList}>
            <li>
              <div className={styles.taskInfo}>
                <strong>I-9 Form</strong>
                <p>Requires copies of two forms of I.D.</p>
              </div>
              <a href="https://www.uscis.gov/i-9" className={styles.externalLink} target="_blank" rel="noopener noreferrer">USCIS Link</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>IRS W-4 Form</strong>
                <p>Federal tax withholding.</p>
              </div>
              <a href="https://www.irs.gov/pub/irs-pdf/fw4.pdf" className={styles.externalLink} target="_blank" rel="noopener noreferrer">IRS PDF</a>
            </li>
            <li>
              <div className={styles.taskInfo}>
                <strong>Arizona Form A-4</strong>
                <p>State Withholding Election. Must submit within first 5 days.</p>
              </div>
              <a href="https://azdor.gov/forms/withholding-forms" className={styles.externalLink} target="_blank" rel="noopener noreferrer">AZ DOR Link</a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
