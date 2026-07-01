'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import styles from './page.module.css';

// Editor.js must be imported dynamically with ssr: false
const Editor = dynamic(() => import('@/components/wiki/Editor'), {
  ssr: false,
  loading: () => <div className={styles.loadingEditor}>Loading Editor...</div>
});

export default function WikiEditPage() {
  const handleEditorChange = (data: any) => {
    console.log('Editor data:', data);
    // TODO: Save to Firestore
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Create/Edit Wiki Article</h1>
        <div className={styles.actions}>
          <button className={styles.saveBtn}>Save Draft</button>
          <button className={styles.publishBtn}>Publish</button>
        </div>
      </header>
      
      <div className={styles.editorWrapper}>
        <div className={styles.metadataForm}>
          <input 
            type="text" 
            placeholder="Article Title" 
            className={styles.titleInput} 
          />
          <select className={styles.categorySelect}>
            <option value="">Select Category...</option>
            <option value="programs">Programs & Activities</option>
            <option value="facilities">Facilities & Maintenance</option>
            <option value="emergency">Emergency Procedures</option>
            <option value="kitchen">Kitchen & Dining</option>
          </select>
        </div>
        
        <div className={styles.editorArea}>
          <Editor onChange={handleEditorChange} />
        </div>
      </div>
    </div>
  );
}
