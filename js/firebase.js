import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, off, set, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCETNzuvNn0-f5CsJhR_okTIgyJMC-dEPQ",
  authDomain: "ascension-e83bb.firebaseapp.com",
  databaseURL: "https://ascension-e83bb-default-rtdb.firebaseio.com",
  projectId: "ascension-e83bb",
  storageBucket: "ascension-e83bb.firebasestorage.app",
  messagingSenderId: "269995200895",
  appId: "1:269995200895:web:3780fadb27fb1810944a4a",
  measurementId: "G-94ER7T1W8W"
};
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, onValue, off, set, get };

export function roomRef(roomCode){ return ref(db, 'rooms/'+roomCode); }

export let deviceId = localStorage.getItem('ascension_device_id');
if(!deviceId){ deviceId='d'+Math.random().toString(36).slice(2,10); localStorage.setItem('ascension_device_id', deviceId); }
