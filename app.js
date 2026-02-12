// ===== IMPORTS =====
import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;
let currentRole = null;
let activeSession = "2026-27";

// ================= AUTH =================

window.loginUser = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    alert(err.message);
  }
};

window.logoutUser = async function () {
  await signOut(auth);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      alert("No role assigned. Contact admin.");
      return;
    }

    currentRole = userSnap.data().role;
    document.getElementById("userRole").innerText = currentRole.toUpperCase();

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("app").style.display = "block";

    loadSessions();
    loadStudents();
    loadNotices();
  } else {
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("app").style.display = "none";
  }
});

// ================= NAVIGATION =================

window.showPage = function (id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
};

// ================= ROLL SYSTEM =================

async function generateRoll(className) {
  const key = activeSession + "_" + className;
  const ref = doc(db, "rollCounters", key);
  const snap = await getDoc(ref);

  let nextRoll = 1;

  if (snap.exists()) {
    nextRoll = snap.data().lastRoll + 1;
    await updateDoc(ref, { lastRoll: nextRoll });
  } else {
    await setDoc(ref, { lastRoll: 1 });
  }

  return String(nextRoll).padStart(3, "0");
}

// ================= STUDENTS =================

window.addStudent = async function () {

  if (currentRole !== "admin") {
    alert("Only admin can add students");
    return;
  }

  const name = document.getElementById("studentName").value;
  const parent = document.getElementById("parentName").value;
  const phone = document.getElementById("phone").value;
  const className = document.getElementById("classSelect").value;

  if (!name || !className) {
    alert("Fill required fields");
    return;
  }

  const roll = await generateRoll(className);

  await addDoc(collection(db, "students"), {
    name,
    parent,
    phone,
    class: className,
    roll,
    session: activeSession,
    createdAt: new Date()
  });

  alert("Student Added with Roll: " + roll);
  loadStudents();
};

async function loadStudents() {
  const q = query(collection(db, "students"), where("session", "==", activeSession));
  const snap = await getDocs(q);

  const list = document.getElementById("studentList");
  list.innerHTML = "";

  snap.forEach(docSnap => {
    const s = docSnap.data();

    list.innerHTML += `
      <div class="list-item">
        <div>
          <strong>${s.name}</strong>
          <small>Class ${s.class} | Roll ${s.roll}</small>
        </div>
      </div>
    `;
  });
}

// ================= ATTENDANCE =================

window.markAttendance = async function () {

  if (!currentUser) {
    alert("Login required");
    return;
  }

  const roll = document.getElementById("attendanceRoll").value;

  const q = query(
    collection(db, "students"),
    where("roll", "==", roll),
    where("session", "==", activeSession)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    alert("Student not found");
    return;
  }

  const student = snap.docs[0];

  await addDoc(collection(db, "attendance"), {
    studentId: student.id,
    roll,
    date: new Date().toISOString().split("T")[0],
    markedBy: currentUser.uid,
    time: new Date()
  });

  alert("Attendance Marked");
};

// ================= BILLING =================

window.loadBills = async function () {

  const classFilter = document.getElementById("billClassFilter").value;

  let q = query(collection(db, "students"), where("session", "==", activeSession));

  if (classFilter) {
    q = query(
      collection(db, "students"),
      where("session", "==", activeSession),
      where("class", "==", classFilter)
    );
  }

  const snap = await getDocs(q);
  const list = document.getElementById("billList");
  list.innerHTML = "";

  snap.forEach(docSnap => {
    const s = docSnap.data();

    list.innerHTML += `
      <div class="list-item">
        <div>
          <strong>${s.name}</strong>
          <small>Class ${s.class} | Roll ${s.roll}</small>
        </div>
        ${currentRole === "admin" ? `
          <div>
            <button class="btn-success" onclick="markPaid('${docSnap.id}','${s.name}')">Save</button>
            <button class="btn-primary" onclick="printBill('${s.name}','${s.roll}')">Print</button>
            <button class="btn-warning" onclick="sendPaidSMS('${s.name}','${s.roll}')">SMS</button>
          </div>
        ` : ""}
      </div>
    `;
  });
};

window.markPaid = async function (studentId, name) {

  if (currentRole !== "admin") return;

  await addDoc(collection(db, "bills"), {
    studentId,
    status: "paid",
    paidBy: currentUser.uid,
    paidAt: new Date(),
    session: activeSession
  });

  alert("Bill Marked Paid for " + name);
};

window.printBill = function (name, roll) {
  alert("Print Bill for " + name + " Roll: " + roll);
};

window.sendPaidSMS = function (name, roll) {
  alert("SMS Placeholder for " + name + " (Connect SMS API later)");
};

// ================= NOTICES =================

window.sendNotice = async function () {

  if (currentRole !== "admin") {
    alert("Only admin can send notice");
    return;
  }

  const title = document.getElementById("noticeTitle").value;
  const message = document.getElementById("noticeMessage").value;

  if (!title || !message) {
    alert("Fill fields");
    return;
  }

  await addDoc(collection(db, "notices"), {
    title,
    message,
    createdBy: currentUser.uid,
    createdAt: new Date(),
    session: activeSession
  });

  alert("Notice Sent");
  loadNotices();
};

async function loadNotices() {
  const q = query(collection(db, "notices"), where("session", "==", activeSession));
  const snap = await getDocs(q);

  const board = document.getElementById("noticeBoard");
  board.innerHTML = "";

  snap.forEach(docSnap => {
    const n = docSnap.data();
    board.innerHTML += `
      <div class="notice-card">
        <strong>${n.title}</strong>
        <p>${n.message}</p>
      </div>
    `;
  });
}

// ================= SESSIONS =================

window.createSession = async function () {

  if (currentRole !== "admin") return;

  const newSession = document.getElementById("newSession").value;

  await setDoc(doc(db, "sessions", newSession), {
    active: true,
    createdAt: new Date()
  });

  activeSession = newSession;
  alert("Session Created: " + newSession);
};

async function loadSessions() {
  const snap = await getDocs(collection(db, "sessions"));

  snap.forEach(docSnap => {
    if (docSnap.data().active) {
      activeSession = docSnap.id;
    }
  });
}
