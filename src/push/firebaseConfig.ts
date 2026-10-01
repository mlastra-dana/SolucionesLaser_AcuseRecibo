import type { FirebaseOptions } from 'firebase/app';

export function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined
  };
}

export function validateFirebaseConfig() {
  const config = getFirebaseConfig();
  const missing = Object.entries(config).filter(([key, value]) => key !== 'measurementId' && !value);
  if (missing.length || !import.meta.env.VITE_FIREBASE_VAPID_KEY) {
    throw new Error('La configuración de Firebase está pendiente. Configura las variables públicas de Firebase y la clave VAPID antes de registrar el navegador.');
  }
  if (config.projectId !== 'dana-push-demo-vzla') {
    throw new Error('Esta demo debe utilizar el proyecto Firebase dana-push-demo-vzla.');
  }
  return config;
}
