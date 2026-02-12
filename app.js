// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDA67oWl6Kq1kNXLylumXlC7YV5tgrsnBs",
  authDomain: "central-public-school-1cd53.firebaseapp.com",
  projectId: "central-public-school-1cd53",
  storageBucket: "central-public-school-1cd53.firebasestorage.app",
  messagingSenderId: "490014133859",
  appId: "1:490014133859:web:f89fe318d46e3e768c3256"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);