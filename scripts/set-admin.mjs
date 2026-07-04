import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const serviceAccountPath = path.join(process.cwd(), 'camp-lawton-staff-hub-firebase-adminsdk-fbsvc-439f443121.json');

if (!existsSync(serviceAccountPath)) {
  console.error(`Error: Service account file not found at ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = getFirestore(app);
const auth = getAuth(app);

const targetEmail = process.argv[2] || 'manosdvd@gmail.com';

async function setAdmin() {
  try {
    console.log(`Locating user with email: ${targetEmail}`);
    const user = await auth.getUserByEmail(targetEmail);
    console.log(`User found. UID: ${user.uid}`);

    // Set custom claims
    console.log('Setting custom claims (admin = true, moderator = true)...');
    await auth.setCustomUserClaims(user.uid, { admin: true, moderator: true });
    console.log('Custom claims successfully updated.');

    // Update profile in Firestore
    console.log('Updating profile in Firestore...');
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    const updateData = {
      isAdmin: true,
      portalMode: 'admin',
      adminPreset: 'owner',
      adminPermissions: ['super_admin', 'edit_wiki', 'moderate_forum', 'review_applications'],
      updatedAt: FieldValue.serverTimestamp()
    };

    if (userDoc.exists) {
      await userRef.update(updateData);
      console.log('Firestore profile successfully updated.');
    } else {
      await userRef.set({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
        accountStatus: 'active',
        ...updateData
      });
      console.log('Firestore profile successfully created.');
    }

    console.log(`Successfully configured ${targetEmail} as admin!`);
  } catch (error) {
    console.error('Error setting admin:', error);
  }
}

setAdmin();
