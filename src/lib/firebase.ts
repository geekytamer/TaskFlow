
import { initializeApp, getApp, getApps } from 'firebase/app';

const firebaseConfig = {
  projectId: "taskflow-5jocq",
  appId: "1:709853870087:web:a4413549c5024fd8d292a2",
  storageBucket: "taskflow-5jocq.firebasestorage.app",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "taskflow-5jocq.firebaseapp.com",
  messagingSenderId: "709853870087",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export { app };
