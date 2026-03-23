import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldPath } from 'firebase-admin/firestore'

function getFirebaseAdmin() {
  if (getApps().length === 0) {
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!keyJson) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_KEY is not set. Add it to web/.env.local with the Firebase service account JSON.'
      )
    }

    let serviceAccount
    try {
      serviceAccount = JSON.parse(keyJson)
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the entire service account JSON on one line.'
      )
    }

    initializeApp({ credential: cert(serviceAccount) })
  }
  return getFirestore()
}

/** Lazy getter — initializes Firebase on first access, not at module load */
export function getDb() {
  return getFirebaseAdmin()
}

/** Re-export FieldPath for use in queries needing document ID ordering */
export function getFieldPath() {
  return FieldPath
}
