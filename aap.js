// ===== FIREBASE IMPORTS =====

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';

import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ===== FIREBASE CONFIG =====

const firebaseConfig = {

apiKey: "AIzaSyDA67oWl6Kq1kNXLylumXlC7YV5tgrsnBs",

authDomain: "central-public-school-1cd53.firebaseapp.com",

projectId: "central-public-school-1cd53",

storageBucket: "central-public-school-1cd53.firebasestorage.app",

messagingSenderId: "490014133859",

appId: "1:490014133859:web:f89fe318d46e3e768c3256"

};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

// ===== GLOBAL VARIABLES =====

const MO=['','January','February','March','April','May','June','July','August','September','October','November','December'];

let dbCache = {

students: [],

attendance: {},

bills: [],

sessions: [],

notices: [],

cur: '2026-27'

};

let currentUser = null;

let unsubscribers = [];

let isInitialLoad = true;

// ===== HELPER FUNCTIONS =====

function showLoader(){document.getElementById('loader').classList.add('show');}

function hideLoader(){document.getElementById('loader').classList.remove('show');}

window.toast = function(msg,type='inf',dur=3000){

const w=document.getElementById('twrap'),t=document.createElement('div');

t.className='toast '+type;

t.innerHTML=(type==='suc'?'✓':type==='err'?'✗':'ℹ')+' '+msg;

w.appendChild(t);setTimeout(()=>t.remove(),dur);

};

// ===== QR ATTENDANCE CHECKING =====

function checkQRAttendance() {

const params = new URLSearchParams(window.location.search);

const roll = params.get('attendance');

if (roll && auth.currentUser) {

console.log('QR attendance detected for roll:', roll);

markFromQR(roll);

}

}

// ===== AUTHENTICATION =====

onAuthStateChanged(auth, async (user) => {

if (user) {

currentUser = user;

document.getElementById('userEmail').textContent = user.email;

await loadAllData();

setupRealtimeListeners();

showApp();

// Check for QR attendance AFTER login
setTimeout(() => checkQRAttendance(), 300);

} else {

currentUser = null;

stopRealtimeListeners();

document.getElementById('mainApp').style.display='none';

document.getElementById('loginPage').style.display='flex';

}

hideLoader();

});

window.doLogin = async function(e) {

e.preventDefault();

showLoader();

const email = document.getElementById('loginUser').value.trim();

const password = document.getElementById('loginPass').value;

try {

await signInWithEmailAndPassword(auth, email, password);

toast('Login successful!','suc');

} catch (error) {

if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {

  try {

    await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, 'settings', auth.currentUser.uid), {

      currentSession: '2026-27',

      sessions: [],

      createdAt: new Date().toISOString()

    });

    toast('Account created!','suc');

  } catch (createError) {

    toast('Error: ' + createError.message,'err');

    hideLoader();

  }

} else {

  toast('Login failed: ' + error.message,'err');

  hideLoader();

}

}

};

window.logout = async function() {

if(!confirm('Logout?')) return;

showLoader();

try {

await signOut(auth);

document.getElementById('loginForm').reset();

toast('Logged out','inf');

} catch (error) {

toast('Logout failed','err');

}

hideLoader();

};

window.changePassword = async function() {

const newP = document.getElementById('newPass').value;

const confirm = document.getElementById('confirmPass').value;

if(!newP || !confirm) {

toast('Please fill all fields','err');

return;

}

if(newP !== confirm) {

toast('Passwords do not match','err');

return;

}

if(newP.length < 6) {

toast('Password must be at least 6 characters','err');

return;

}

showLoader();

try {

await updatePassword(auth.currentUser, newP);

toast('Password changed!','suc');

document.getElementById('currentPass').value='';

document.getElementById('newPass').value='';

document.getElementById('confirmPass').value='';

} catch (error) {

toast('Error: Re-login and try again','err');

}

hideLoader();

};

// ===== REALTIME LISTENERS (FIXED FOR MULTI-DEVICE) =====

function setupRealtimeListeners() {

if (!auth.currentUser) return;

const uid = auth.currentUser.uid;

console.log('🔥 Setting up real-time listeners for user:', uid);

// Students listener

const studentsUnsubscribe = onSnapshot(

collection(db, 'users', uid, 'students'),

(snapshot) => {

  console.log('📚 Students update:', snapshot.docs.length, 'documents');

  dbCache.students = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

  const currentPage = document.querySelector('.page.active')?.id;

  if (currentPage === 'page-students') renderStudents();

  if (currentPage === 'page-dashboard') renderDash();

},

(error) => console.error('❌ Students listener error:', error)

);

// Attendance listener - ENHANCED FOR REAL-TIME SYNC

const attendanceUnsubscribe = onSnapshot(

collection(db, 'users', uid, 'attendance'),

(snapshot) => {

  console.log('📋 Attendance update:', snapshot.docs.length, 'date documents');

  

  // Store previous state for comparison

  const previousAttendance = JSON.parse(JSON.stringify(dbCache.attendance));

  dbCache.attendance = {};

  

  snapshot.docs.forEach(doc => {

    dbCache.attendance[doc.id] = doc.data();

  });

  

  // Detect NEW attendance entries (skip on initial load)

  if (!isInitialLoad) {

    const today = new Date().toISOString().split('T')[0];

    const todayOld = previousAttendance[today] || {};

    const todayNew = dbCache.attendance[today] || {};

    

    // Find newly added students

    Object.keys(todayNew).forEach(roll => {

      if (!todayOld[roll] && todayNew[roll]) {

        const studentData = todayNew[roll];

        console.log('✅ New attendance detected:', studentData.name);

        toast(`✓ ${studentData.name} marked present at ${studentData.time}`, 'suc', 4000);

      }

    });

  }

  

  // Update UI on all relevant pages

  const currentPage = document.querySelector('.page.active')?.id;

  if (currentPage === 'page-dashboard') renderDash();

  if (currentPage === 'page-attendance') renderAttR();

  if (currentPage === 'page-reports') renderRpt();

},

(error) => console.error('❌ Attendance listener error:', error)

);

// Bills listener

const billsUnsubscribe = onSnapshot(

collection(db, 'users', uid, 'bills'),

(snapshot) => {

  console.log('💰 Bills update:', snapshot.docs.length, 'documents');

  dbCache.bills = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

  const currentPage = document.querySelector('.page.active')?.id;

  if (currentPage === 'page-billing') {

    renderHist();

    renderOv();

  }

  if (currentPage === 'page-dashboard') renderDash();

},

(error) => console.error('❌ Bills listener error:', error)

);

// Notices listener

const noticesUnsubscribe = onSnapshot(

collection(db, 'users', uid, 'notices'),

(snapshot) => {

  console.log('📢 Notices update:', snapshot.docs.length, 'documents');

  dbCache.notices = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

  const currentPage = document.querySelector('.page.active')?.id;

  if (currentPage === 'page-notices') renderNotices();

},

(error) => console.error('❌ Notices listener error:', error)

);

unsubscribers = [studentsUnsubscribe, attendanceUnsubscribe, billsUnsubscribe, noticesUnsubscribe];

console.log('✅ All real-time listeners active');

// Mark initial load complete after 1 second

setTimeout(() => {

isInitialLoad = false;

console.log('🎯 Initial load complete - real-time notifications enabled');

}, 1000);

}

function stopRealtimeListeners() {

console.log('🛑 Stopping real-time listeners');

unsubscribers.forEach(unsub => unsub());

unsubscribers = [];

isInitialLoad = true;

}

// ===== DATA LOADING =====

async function loadAllData() {

showLoader();

try {

const uid = auth.currentUser.uid;



// Load settings

const settingsDoc = await getDoc(doc(db, 'settings', uid));

if (settingsDoc.exists()) {

  const settingsData = settingsDoc.data();

  dbCache.cur = settingsData.currentSession || '2026-27';

  dbCache.sessions = settingsData.sessions || [];

}



// Load students

const studentsSnap = await getDocs(collection(db, 'users', uid, 'students'));

dbCache.students = studentsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));



// Load attendance

const attendanceSnap = await getDocs(collection(db, 'users', uid, 'attendance'));

dbCache.attendance = {};

attendanceSnap.docs.forEach(doc => {

  dbCache.attendance[doc.id] = doc.data();

});



// Load bills

const billsSnap = await getDocs(collection(db, 'users', uid, 'bills'));

dbCache.bills = billsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));



// Load notices

const noticesSnap = await getDocs(collection(db, 'users', uid, 'notices'));

dbCache.notices = noticesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));



console.log('📦 Data loaded:', {

  students: dbCache.students.length,

  attendance: Object.keys(dbCache.attendance).length,

  bills: dbCache.bills.length,

  notices: dbCache.notices.length

});

} catch (error) {

console.error('Error loading data:', error);

toast('Error loading data','err');

}

hideLoader();

}

async function saveSettings() {

if (!auth.currentUser) return;

try {

await setDoc(doc(db, 'settings', auth.currentUser.uid), {

  currentSession: dbCache.cur,

  sessions: dbCache.sessions,

  updatedAt: new Date().toISOString()

});

} catch (error) {

console.error('Error saving settings:', error);

}

}

async function saveStudent(student) {

if (!auth.currentUser) return;

try {

const uid = auth.currentUser.uid;

if (student.id) {

  const {id, ...data} = student;

  await setDoc(doc(db, 'users', uid, 'students', id), data);

} else {

  const {id, ...data} = student;

  const docRef = await addDoc(collection(db, 'users', uid, 'students'), data);

  student.id = docRef.id;

}

return student;

} catch (error) {

console.error('Error saving student:', error);

throw error;

}

}

async function saveAttendance(date, rollNumber, data) {

if (!auth.currentUser) return;

try {

const ref = doc(db, 'users', auth.currentUser.uid, 'attendance', date);

await setDoc(ref, { [rollNumber]: data }, { merge: true });

console.log('✅ Attendance saved:', date, rollNumber, data.name);

} catch (error) {

console.error('Error saving attendance:', error);

throw error;

}

}

async function saveBillToDb(bill) {

if (!auth.currentUser) return;

try {

const uid = auth.currentUser.uid;

if (bill.id) {

  const {id, ...data} = bill;

  await setDoc(doc(db, 'users', uid, 'bills', id), data);

} else {

  const {id, ...data} = bill;

  const docRef = await addDoc(collection(db, 'users', uid, 'bills'), data);

  bill.id = docRef.id;

}

return bill;

} catch (error) {

console.error('Error saving bill:', error);

throw error;

}

}

async function saveNoticeToDb(notice) {

if (!auth.currentUser) return;

try {

const {id, ...data} = notice;

const docRef = await addDoc(collection(db, 'users', auth.currentUser.uid, 'notices'), data);

notice.id = docRef.id;

return notice;

} catch (error) {

console.error('Error saving notice:', error);

throw error;

}

}

// ===== HELPER FUNCTION TO CHECK IF STUDENT IS ADMITTED =====
function isStudentAdmitted(studentId) {
  return dbCache.bills.some(b => b.studentId === studentId && b.paid && b.paidAmount > 0);
}

// ===== HELPER FUNCTION TO GET ALL UNPAID BILLS FOR ADMITTED STUDENTS =====
function getUnpaidBillsForStudent(studentId) {
  if (!isStudentAdmitted(studentId)) return [];
  
  const allBills = dbCache.bills.filter(b => b.studentId === studentId);
  return allBills.filter(b => !b.paid || (b.total > (b.paidAmount || 0)));
}

// ===== APP INITIALIZATION =====

function showApp(){

document.getElementById('loginPage').style.display='none';

document.getElementById('mainApp').style.display='block';

init();

}

function getNextRollNumber(cls){

const students=dbCache.students.filter(s=>s.class===cls&&s.session===dbCache.cur);

let maxNum=0;

students.forEach(s=>{

const num=parseInt(s.rollNumber);

if(!isNaN(num)&&num>maxNum)maxNum=num;

});

return String(maxNum+1).padStart(3,'0');

}

window.updateRollPreview = function(){

const cls=document.getElementById('rc').value;

if(cls){

document.getElementById('rr').value=getNextRollNumber(cls);

}else{

document.getElementById('rr').value='';

}

};

function init(){

document.getElementById('rj').valueAsDate=new Date();

document.getElementById('aDate').valueAsDate=new Date();

document.getElementById('rDate').valueAsDate=new Date();

const m=new Date().getMonth()+1;

['bMo','ovMo'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=m;});

document.getElementById('sessTag').textContent='Session '+dbCache.cur;

populateFSess();

renderDash();

renderStudents();

renderAttR();

renderSess();

renderNotices();

}

function populateFSess(){

const s=document.getElementById('fSess');

s.innerHTML='<option value="">All Sessions</option>';

[...new Set(dbCache.students.map(x=>x.session).filter(Boolean))].sort().reverse().forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent='Session '+x;s.appendChild(o);});

}

window.goP = function(n,el){

document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));

document.querySelectorAll('.ni').forEach(x=>x.classList.remove('active'));

document.getElementById('page-'+n).classList.add('active');

if(el)el.classList.add('active');

if(n==='dashboard')renderDash();

if(n==='students')renderStudents();

if(n==='reports')renderRpt();

if(n==='sessions')renderSess();

if(n==='billing')renderHist();

if(n==='notices')renderNotices();

};

window.swBTab = function(n,el){

document.querySelectorAll('#page-billing .stab').forEach(t=>t.classList.remove('active'));

document.querySelectorAll('#page-billing .tp').forEach(t=>t.classList.remove('active'));

document.getElementById('bt-'+n).classList.add('active');el.classList.add('active');

if(n==='hist')renderHist();if(n==='ov')renderOv();

};

window.opM = function(id){document.getElementById(id).classList.add('open');};

window.clsM = function(id){document.getElementById(id).classList.remove('open');};

// ===== STUDENT MANAGEMENT =====

window.regStudent = async function(e){

e.preventDefault();

showLoader();

const roll=document.getElementById('rr').value.trim();

const cls=document.getElementById('rc').value;

if(dbCache.students.find(s=>s.rollNumber===roll&&s.class===cls&&s.session===dbCache.cur)){

toast('Roll number exists!','err');

hideLoader();

return;

}

const s={

name:document.getElementById('rn').value.trim(),

rollNumber:roll,

dob:document.getElementById('rd').value,

parentName:document.getElementById('rp').value.trim(),

phoneNumber:document.getElementById('rpm').value.trim(),

class:cls,

joiningDate:document.getElementById('rj').value,

monthlyFee:parseFloat(document.getElementById('rf').value),

address:document.getElementById('ra').value.trim(),

session:dbCache.cur,

createdAt: new Date().toISOString()

};

try {

await saveStudent(s);

toast('Registered: '+s.name,'suc');

document.getElementById('sForm').reset();

document.getElementById('rj').valueAsDate=new Date();

} catch (error) {

toast('Error registering','err');

}

hideLoader();

};

window.clrForm = function(){

document.getElementById('sForm').reset();

document.getElementById('rj').valueAsDate=new Date();

document.getElementById('rr').value='';

};

function getAP(r){let t=0,p=0;for(let d in dbCache.attendance){t++;if(dbCache.attendance[d][r])p++;}return t?Math.round(p/t*100):0;}

function renderDash(){

const td=new Date().toISOString().split('T')[0],ta=dbCache.attendance[td]||{};

const ss=dbCache.students.filter(s=>s.session===dbCache.cur),pr=ss.filter(s=>ta[s.rollNumber]).length;

const m=new Date().getMonth()+1,y=new Date().getFullYear();

const mb=dbCache.bills.filter(b=>b.month==m&&b.year==y&&b.paid),col=mb.reduce((a,b)=>a+(b.paidAmount||b.total),0);

document.getElementById('dStats').innerHTML=`<div class="sbox"><div class="sic si-b">👥</div><div class="snum">${ss.length}</div><div class="slbl">Total Students</div></div><div class="sbox"><div class="sic si-g">✓</div><div class="snum">${pr}</div><div class="slbl">Present Today</div></div><div class="sbox"><div class="sic si-r">⚠</div><div class="snum">${ss.length-pr}</div><div class="slbl">Absent Today</div></div><div class="sbox"><div class="sic si-gold">💰</div><div class="snum">₹${col.toLocaleString('en-IN')}</div><div class="slbl">Collected This Month</div></div>`;

const ae=document.getElementById('dAtt'),plist=ss.filter(s=>ta[s.rollNumber]).slice(0,5);

ae.innerHTML=plist.length?plist.map(s=>`<div class="ac pres" style="margin-bottom:7px"><div class="an">${s.name}</div><div class="as">Class ${s.class} · ${s.rollNumber}</div><div class="at">🕐 ${ta[s.rollNumber].time}</div></div>`).join('')+(pr>5?`<p style="color:var(--text-light);font-size:.75rem;margin-top:6px">+${pr-5} more...</p>`:''):'<div class="empty" style="padding:16px 0"><div class="ei">📋</div><p>No attendance today</p></div>';

const be=document.getElementById('dBills'),rb=[...dbCache.bills].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);

be.innerHTML=rb.length?rb.map(b=>`<div style="display:flex;gap:10px;padding:8px;background:var(--cream);border-radius:7px;margin-bottom:5px"><div style="flex:1"><div style="font-size:.82rem;font-weight:600;color:var(--navy)">${b.studentName}</div><div style="font-size:.7rem;color:var(--text-light)">${MO[b.month]} ${b.year} · Class ${b.studentClass}</div></div><div style="font-family:'DM Mono',monospace;font-size:.82rem;font-weight:600;color:var(--navy)">₹${(b.paidAmount||b.total).toLocaleString('en-IN')}</div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="ei">💳</div><p>No bills yet</p></div>';

}

function renderStudents(){

const srch=(document.getElementById('srch')?.value||'').toLowerCase(),cls=document.getElementById('fCls')?.value||'',sess=document.getElementById('fSess')?.value||'';

let list=dbCache.students.filter(s=>{if(cls&&s.class!==cls)return false;if(sess&&s.session!==sess)return false;if(srch&&!s.name.toLowerCase().includes(srch)&&!s.rollNumber.toLowerCase().includes(srch))return false;return true;});

document.getElementById('scnt').textContent=list.length;

const g=document.getElementById('sGrid');

if(!list.length){g.innerHTML='<div class="empty"><div class="ei">👤</div><h4>No students found</h4></div>';return;}

g.innerHTML=list.map(s=>{

const ap=getAP(s.rollNumber),init=s.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase(),pm=dbCache.bills.filter(b=>b.studentId===s.id).length;

return`<div class="sc"><div class="av">${init}</div><div class="sm"><h3>${s.name} <span class="bdg bdg-c">Class ${s.class}</span> <span class="bdg bdg-s">${s.session}</span></h3><div class="sub"><span>📋 ${s.rollNumber}</span><span>👪 ${s.parentName}</span><span>📱 ${s.phoneNumber}</span></div><div style="margin-top:5px;display:flex;align-items:center;gap:9px"><div style="flex:1;background:#e9ecef;border-radius:20px;height:5px;max-width:140px"><div style="background:${ap>=75?'var(--success)':ap>=50?'var(--warning)':'var(--danger)'};width:${ap}%;height:5px;border-radius:20px"></div></div><span style="font-size:.7rem;color:var(--text-light)">${ap}% · ${pm} bills</span></div></div><div class="sa"><button class="btn btn-i btn-xs" onclick="showQR('${s.id}')">QR Code</button><button class="btn btn-g btn-xs" onclick="qkBill('${s.id}')">Bill</button><button class="btn btn-d btn-xs" onclick="delStu('${s.id}')">🗑</button></div></div>`;

}).join('');

}

window.delStu = async function(id){

if(!confirm('Delete?'))return;

showLoader();

try {

await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'students', id));

toast('Deleted','inf');

} catch (error) {

toast('Error deleting','err');

}

hideLoader();

};

window.qkBill = function(id){

goP('billing',document.querySelector('[onclick*=\'billing\']'));

setTimeout(()=>{const s=dbCache.students.find(s=>s.id===id);if(!s)return;document.getElementById('bCls').value=s.class;loadBStu();setTimeout(()=>{document.getElementById('bStu').value=id;loadSBill();},110);},180);

};

// ===== QR CODE =====

const BU=window.location.href.split('?')[0];

window.showQR = function(id){

const s=dbCache.students.find(s=>s.id===id);if(!s)return;

const url=BU+'?attendance='+s.rollNumber;

document.getElementById('qrMT').textContent=s.name+' — QR Code';

document.getElementById('qrMB').innerHTML=`<div style="text-align:center">

<div class="qrc" id="qrCS"><div class="qrh">🎓 Central Public School</div><div class="qrs">Session ${s.session} · Class ${s.class}</div><div id="qrCV" style="margin:10px auto;display:inline-block"></div><div class="qrn">${s.name}</div><div class="qrroll">Roll: ${s.rollNumber}</div></div>

<div class="np" style="display:flex;gap:9px;justify-content:center;margin-top:18px"><button class="btn btn-p" onclick="prQR()">🖼 Print Card</button><button class="btn btn-o" onclick="clsM('qrM')">Close</button></div>

  </div>`;opM('qrM');

setTimeout(()=>{

new QRCode(document.getElementById('qrCV'),{

  text:url,

  width:190,

  height:190,

  colorDark:'#0f1b2d',

  colorLight:'#ffffff'

});

},100);

};

window.prQR = function(){

const c=document.getElementById('qrCS'),pr=document.getElementById('pr');

pr.innerHTML='<div style="padding:28px;text-align:center">'+c.outerHTML+'</div>';

pr.style.display='block';window.print();pr.style.display='none';pr.innerHTML='';

};

window.showDownloadQR = function(){

opM('downloadQrM');

};

window.generateQRDownload = function(){

const cls=document.getElementById('dlQrCls').value;

const sess=document.getElementById('fSess')?.value||dbCache.cur;

const list=dbCache.students.filter(s=>{

if(s.session!==sess)return false;

if(cls&&s.class!==cls)return false;

return true;

});

if(!list.length){toast('No students match filter','err');return;}

clsM('downloadQrM');

document.getElementById('allQrB').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px">${list.map((s,i)=>`<div style="text-align:center;border:2px solid var(--navy);border-radius:11px;padding:14px;page-break-inside:avoid"><div style="font-family:'Playfair Display',serif;font-size:.9rem;font-weight:800;color:var(--navy)">Central Public School</div><div style="font-size:.7rem;color:var(--text-light);margin:2px 0 8px">Session ${s.session} · Class ${s.class}</div><div id="qa${i}" style="margin:0 auto;display:inline-block"></div><div style="font-size:.88rem;font-weight:700;color:var(--navy);margin-top:7px">${s.name}</div><div style="font-family:'DM Mono',monospace;font-size:.75rem;color:var(--text-mid)">Roll: ${s.rollNumber}</div><div style="font-size:.7rem;color:var(--text-light);margin-top:2px">${s.phoneNumber}</div></div>`).join('')}</div>`;

opM('allQrM');

setTimeout(()=>{

list.forEach((s,i)=>{

  new QRCode(document.getElementById('qa'+i),{

    text:BU+'?attendance='+s.rollNumber,

    width:150,

    height:150,

    colorDark:'#0f1b2d',

    colorLight:'#ffffff'

  });

});

},130);

};

// ===== ATTENDANCE WITH QR CODE SCANNING (FIXED FOR REAL-TIME) =====

window.markFromQR = async function(r){

console.log('📲 QR Scan - Roll Number:', r);

const s=dbCache.students.find(s=>s.rollNumber===r);

if(!s){

toast('Student not found: '+r, 'err', 5000);

window.history.replaceState({}, document.title, window.location.pathname);

return;

}

const td=new Date().toISOString().split('T')[0];

// Check if already marked

if(dbCache.attendance[td] && dbCache.attendance[td][r]){

toast('Already marked! '+s.name+' at '+dbCache.attendance[td][r].time, 'wrn', 5000);

window.history.replaceState({}, document.title, window.location.pathname);

return;

}

const time=new Date().toLocaleTimeString('en-IN');

try {

await saveAttendance(td, r, {name:s.name,class:s.class,time});

console.log('✅ Attendance saved via QR for', s.name);

toast('✓ Attendance Marked! '+s.name+' (Class '+s.class+') at '+time, 'suc', 5000);

window.history.replaceState({}, document.title, window.location.pathname);

} catch (error) {

console.error('❌ Error saving attendance:', error);

toast('Error saving attendance','err');

}

};

window.markAtt = async function(){

const r = document.getElementById('scanIn').value.trim();

if(!r) return;

const f = document.getElementById('sFeed');

f.style.display='flex';

const s = dbCache.students.find(s => s.rollNumber === r);

if(!s){

f.className='sfeed err';

f.innerHTML='✗ Student not found with Roll Number: <b>' + r + '</b>';

} else {

const td = new Date().toISOString().split('T')[0];



if(dbCache.attendance[td] && dbCache.attendance[td][r]){

  f.className='sfeed wrn';

  f.innerHTML='⚠ Already marked — <b>' + s.name + '</b> at ' + dbCache.attendance[td][r].time;

} else {

  const time = new Date().toLocaleTimeString('en-IN');

  

  try {

    await saveAttendance(td, r, {name:s.name, class:s.class, time});

    f.className='sfeed suc';

    f.innerHTML='✓ <b>' + s.name + '</b> · Class ' + s.class + ' · 🕐 ' + time;

  } catch (error) {

    console.error('Error saving attendance:', error);

    toast('Error saving','err');

  }

}

}

document.getElementById('scanIn').value='';

setTimeout(() => {f.style.display='none';}, 3500);

};

function renderAttR(){

const date=document.getElementById('aDate')?.value,cls=document.getElementById('aCls')?.value||'';if(!date)return;

const da=dbCache.attendance[date]||{};let ss=dbCache.students.filter(s=>s.session===dbCache.cur);if(cls)ss=ss.filter(s=>s.class===cls);

const pr=ss.filter(s=>da[s.rollNumber]),ab=ss.filter(s=>!da[s.rollNumber]);

document.getElementById('aStats').innerHTML=`<div class="sbox"><div class="sic si-b">👥</div><div class="snum">${ss.length}</div><div class="slbl">Total</div></div><div class="sbox"><div class="sic si-g">✓</div><div class="snum">${pr.length}</div><div class="slbl">Present</div></div><div class="sbox"><div class="sic si-r">✗</div><div class="snum">${ab.length}</div><div class="slbl">Absent</div></div><div class="sbox"><div class="sic si-gold">📊</div><div class="snum">${ss.length?Math.round(pr.length/ss.length*100):0}%</div><div class="slbl">Rate</div></div>`;

let h='<div class="sdiv">Present ('+pr.length+')</div><div class="agrid">';

pr.forEach(s=>{h+=`<div class="ac pres"><div class="an">${s.name}</div><div class="as">Roll ${s.rollNumber} · Class ${s.class}</div><div class="at">🕐 ${da[s.rollNumber].time}</div></div>`;});

h+='</div><div class="sdiv">Absent ('+ab.length+')</div><div class="agrid">';

ab.forEach(s=>{h+=`<div class="ac abs"><div class="an">${s.name}</div><div class="as">Roll ${s.rollNumber} · Class ${s.class}</div><div class="as">📱 ${s.phoneNumber}</div></div>`;});

h+='</div>';document.getElementById('aReport').innerHTML=h;

}

// ===== BILLING (WITH AUTO-GENERATION) =====

let cb={student:null,items:[],unpaidBills:[]};

window.loadBStu = function(){

const cls=document.getElementById('bCls').value,sel=document.getElementById('bStu');

sel.innerHTML='<option value="">Choose student</option>';if(!cls)return;

dbCache.students.filter(s=>s.class===cls&&s.session===dbCache.cur).forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name+' ('+s.rollNumber+')';sel.appendChild(o);});

};

window.loadSBill = async function(){

const id=document.getElementById('bStu').value;

if(!id){document.getElementById('bPrevW').style.display='none';return;}

const s=dbCache.students.find(s=>s.id===id);if(!s)return;

cb.student=s;cb.items=[{name:'Monthly Fee',price:s.monthlyFee}];

if (isStudentAdmitted(id)) {

showLoader();

await autoGenerateMissingBills(s);

await new Promise(resolve => setTimeout(resolve, 500));

try {

  const uid = auth.currentUser.uid;

  const billsSnap = await getDocs(collection(db, 'users', uid, 'bills'));

  dbCache.bills = billsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));

} catch (error) {

  console.error('Error reloading bills:', error);

}

hideLoader();

}

loadUnpaidBillsAndRender(id, s);

};

function loadUnpaidBillsAndRender(studentId, student) {

const mo=parseInt(document.getElementById('bMo').value);

const yr=parseInt(document.getElementById('bYr').value);

const allBills=dbCache.bills.filter(b=>b.studentId===studentId);

cb.unpaidBills=allBills.filter(b => {

if (b.month === mo && b.year === yr) return false;

return !b.paid || (b.total > (b.paidAmount || 0));

});

updBP();

}

async function autoGenerateMissingBills(student) {

const currentDate = new Date();

const currentMonth = currentDate.getMonth() + 1;

const currentYear = currentDate.getFullYear();

const hasPaidBill = dbCache.bills.some(b => b.studentId === student.id && b.paid && b.paidAmount > 0);

if (!hasPaidBill) return;

const joiningDate = new Date(student.joiningDate);

let startMonth = joiningDate.getMonth() + 1;

let startYear = joiningDate.getFullYear();

let month = startMonth;

let year = startYear;

while (year < currentYear || (year === currentYear && month <= currentMonth)) {

const existingBill = dbCache.bills.find(

  b => b.studentId === student.id && b.month === month && b.year === year

);

if (!existingBill) {

  const newBill = {

    studentId: student.id,

    studentName: student.name,

    studentClass: student.class,

    rollNumber: student.rollNumber,

    parentName: student.parentName,

    phone: student.phoneNumber,

    month: month,

    year: year,

    total: student.monthlyFee,

    paidAmount: 0,

    paid: false,

    items: [{name: 'Monthly Fee', price: student.monthlyFee}],

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),

    session: student.session,

    autoGenerated: true

  };

  

  try {

    await saveBillToDb(newBill);

  } catch (error) {

    console.error('Error auto-generating bill:', error);

  }

}

month++;

if (month > 12) {

  month = 1;

  year++;

}

}

}

window.addBillItem = function(){

const name=prompt('Item name (e.g., Books, Uniform):');

if(!name)return;

const price=parseFloat(prompt('Amount (₹):'));

if(isNaN(price)||price<=0){toast('Invalid amount','err');return;}

cb.items.push({name,price});

updBP();

};

window.removeBillItem = function(idx){

if(idx===0){toast('Cannot remove monthly fee','err');return;}

cb.items.splice(idx,1);

updBP();

};

function updBP(){

if(!cb.student)return;

const s=cb.student,curTotal=cb.items.reduce((a,b)=>a+b.price,0);

const mo=parseInt(document.getElementById('bMo').value),yr=document.getElementById('bYr').value;

const existing=dbCache.bills.find(b=>b.studentId===s.id&&b.month===mo&&b.year==yr);

const isFullyPaid=existing&&existing.paid&&existing.paidAmount>=existing.total;

let currentMonthPreviousPayment = 0;

if (existing && existing.paidAmount > 0 && !isFullyPaid) {

currentMonthPreviousPayment = existing.paidAmount;

}

const unpaidTotal=cb.unpaidBills.reduce((a,b)=>a+(b.total-(b.paidAmount||0)),0);

const grandTotal=curTotal+unpaidTotal;

let currentDeposit = grandTotal;

const existingDepositInput = document.getElementById('depositAmount');

if (existingDepositInput && existingDepositInput.value) {

const parsed = parseFloat(existingDepositInput.value);

if (!isNaN(parsed)) currentDeposit = parsed;

}

let paymentStatusMessage = '';

if (currentDeposit > 0) {

if (currentDeposit >= grandTotal) {

  paymentStatusMessage = '<div style="margin:12px 0;padding:12px;background:#d4edda;border:1px solid #28a745;border-radius:8px;color:#155724;font-weight:600;text-align:center">✓ Thank you for full payment!</div>';

} else {

  const remaining = grandTotal - currentDeposit;

  paymentStatusMessage = `<div style="margin:12px 0;padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;color:#856404">

    <div style="font-weight:600;margin-bottom:4px">Partial Payment</div>

    <div style="font-size:.85rem">Deposit: ₹${currentDeposit.toLocaleString('en-IN')}</div>

    <div style="font-size:.85rem;font-weight:700;margin-top:4px;color:#dc3545">Remaining Due: ₹${remaining.toLocaleString('en-IN')}</div>

  </div>`;

}

}

document.getElementById('bPrevW').style.display='block';

document.getElementById('bPrev').innerHTML=`<div style="background:#fff;border:2px solid var(--navy);border-radius:8px;padding:24px;max-width:600px;margin:0 auto" id="pbill">

<div style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:900;color:var(--navy);text-align:center">Central Public School</div>

<div style="text-align:center;margin:12px 0;font-size:.95rem;font-weight:700;color:var(--gold)">FEE RECEIPT ${isFullyPaid?'<span class="bdg bdg-paid">PAID ✓</span>':''}</div>

<div style="margin:12px 0;font-size:.82rem;border-bottom:1px solid var(--border);padding-bottom:10px">

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Student:</span><span style="font-weight:600">${s.name}</span></div>

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Roll No:</span><span style="font-weight:600">${s.rollNumber}</span></div>

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Class:</span><span style="font-weight:600">Class ${s.class}</span></div>

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Parent:</span><span style="font-weight:600">${s.parentName}</span></div>

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Phone:</span><span style="font-weight:600">${s.phoneNumber}</span></div>

  <div style="display:flex;gap:10px;margin:4px 0"><span style="color:var(--text-light);min-width:85px">Period:</span><span style="font-weight:600">${MO[mo]} ${yr}</span></div>

</div>

<div style="margin:12px 0">

  <div style="font-weight:700;color:var(--navy);margin-bottom:8px">Current Month Charges:</div>

  ${cb.items.map((item,idx)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0"><span>${item.name}</span><div style="display:flex;align-items:center;gap:8px"><span style="font-weight:600">₹${item.price.toLocaleString('en-IN')}</span>${idx>0?`<button class="btn btn-d btn-xs np" onclick="removeBillItem(${idx})" style="padding:2px 6px">✕</button>`:''}</div></div>`).join('')}

  <div class="np" style="margin-top:8px"><button class="btn btn-o btn-xs" onclick="addBillItem()">+ Add Item</button></div>

  <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;border-top:2px solid var(--navy);margin-top:8px"><span>Current Month Total:</span><span>₹${curTotal.toLocaleString('en-IN')}</span></div>

  ${currentMonthPreviousPayment > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#28a745;font-size:.85rem"><span>Previously Paid (${MO[mo]} ${yr}):</span><span>- ₹${currentMonthPreviousPayment.toLocaleString('en-IN')}</span></div><div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;border-top:1px solid var(--border);margin-top:4px;color:var(--warning)"><span>Remaining for ${MO[mo]}:</span><span>₹${(curTotal - currentMonthPreviousPayment).toLocaleString('en-IN')}</span></div>` : ''}

</div>

${cb.unpaidBills.length>0?`<div style="margin:12px 0;padding:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px">

  <div style="font-weight:700;color:#856404;margin-bottom:8px">⚠️ Previous Unpaid Bills:</div>

  ${cb.unpaidBills.map(b=>`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.85rem;color:#856404"><span>${MO[b.month]} ${b.year}${b.autoGenerated?' (Auto)':''}</span><span>₹${(b.total-(b.paidAmount||0)).toLocaleString('en-IN')}</span></div>`).join('')}

  <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;border-top:2px solid #ffc107;margin-top:8px;color:#856404"><span>Unpaid Total:</span><span>₹${unpaidTotal.toLocaleString('en-IN')}</span></div>

</div>`:''}

<div style="margin:16px 0;padding:12px;background:var(--navy);color:#fff;border-radius:6px">

  <div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:.78rem">GRAND TOTAL</span><span style="font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:800;color:var(--gold-light)">₹${grandTotal.toLocaleString('en-IN')}</span></div>

</div>

<div class="np" style="margin-top:12px">

  <label style="display:block;margin-bottom:5px;font-size:.75rem;font-weight:600;color:var(--text-mid)">DEPOSIT AMOUNT (₹)</label>

  <input type="number" id="depositAmount" placeholder="Enter amount" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:.9rem" value="${currentDeposit}">

  <div style="margin-top:8px;font-size:.75rem;color:var(--text-light)">Enter the amount being paid. Remaining will be carried forward.</div>

</div>

${paymentStatusMessage}

<div style="text-align:center;font-size:.72rem;color:var(--text-light);margin-top:12px">Thank you. Central Public School</div>

  </div>`;

setTimeout(() => {

const depositInput = document.getElementById('depositAmount');

if (depositInput) {

  depositInput.removeEventListener('input', updBP);

  depositInput.addEventListener('input', updBP);

}

}, 50);

}

window.saveBill = async function(){

if(!cb.student){toast('Select student first','err');return;}

const depositInput=document.getElementById('depositAmount');

if(!depositInput){toast('Error: Deposit amount field not found','err');return;}

const depositAmount=parseFloat(depositInput.value);

const curTotal=cb.items.reduce((a,b)=>a+b.price,0);

const unpaidTotal=cb.unpaidBills.reduce((a,b)=>a+(b.total-(b.paidAmount||0)),0);

const grandTotal=curTotal+unpaidTotal;

if(isNaN(depositAmount)||depositAmount<=0){

toast('Please enter valid deposit amount','err');

return;

}

if(depositAmount>grandTotal){

toast('Deposit amount cannot exceed total bill amount','err');

return;

}

showLoader();

const s=cb.student;

const mo=parseInt(document.getElementById('bMo').value);

const yr=parseInt(document.getElementById('bYr').value);

try {

let remainingDeposit=depositAmount;

const sortedUnpaidBills = [...cb.unpaidBills].sort((a,b) => {

  const dateA = new Date(a.year, a.month-1);

  const dateB = new Date(b.year, b.month-1);

  return dateA - dateB;

});

for(let oldBill of sortedUnpaidBills){

  if(remainingDeposit<=0)break;

  

  const oldBillUnpaid=oldBill.total-(oldBill.paidAmount||0);

  const paymentForThisBill=Math.min(remainingDeposit,oldBillUnpaid);

  

  oldBill.paidAmount=(oldBill.paidAmount||0)+paymentForThisBill;

  oldBill.paid=oldBill.paidAmount>=oldBill.total;

  oldBill.updatedAt=new Date().toISOString();

  

  await saveBillToDb(oldBill);

  

  remainingDeposit-=paymentForThisBill;

}

const existingCurrentBill = dbCache.bills.find(b=>b.studentId===s.id&&b.month===mo&&b.year===yr);

const newBill={

  id: existingCurrentBill?.id,

  studentId:s.id,

  studentName:s.name,

  studentClass:s.class,

  rollNumber:s.rollNumber,

  parentName:s.parentName,

  phone:s.phoneNumber,

  month:mo,

  year:yr,

  total:curTotal,

  paidAmount:Math.min(remainingDeposit,curTotal),

  paid:remainingDeposit>=curTotal,

  items:[...cb.items],

  createdAt: existingCurrentBill?.createdAt || new Date().toISOString(),

  updatedAt: new Date().toISOString(),

  session:s.session

};

await saveBillToDb(newBill);

if(depositAmount>=grandTotal){

  toast('✓ Thank you for full payment! Bill fully paid for '+s.name,'suc',4000);

}else{

  const remaining = grandTotal - depositAmount;

  toast('Partial payment recorded: ₹'+depositAmount.toLocaleString('en-IN')+' paid. Remaining Due: ₹'+remaining.toLocaleString('en-IN'),'inf',5000);

}

setTimeout(() => loadSBill(), 500);

}catch(error){

console.error('Error saving bill:',error);

toast('Error saving bill','err');

}

hideLoader();

};

window.printBill = function(){

if(!cb.student){toast('Generate bill first','err');return;}

const b=document.getElementById('pbill');if(!b){toast('Error','err');return;}

const pr=document.getElementById('pr');pr.innerHTML=b.outerHTML;pr.style.display='block';window.print();pr.style.display='none';pr.innerHTML='';

};

window.sendBillSMS = function(){

if(!cb.student){toast('Generate bill first','err');return;}

const s=cb.student,mo=parseInt(document.getElementById('bMo').value),yr=parseInt(document.getElementById('bYr').value);

const curTotal=cb.items.reduce((a,b)=>a+b.price,0);

const unpaidTotal=cb.unpaidBills.reduce((a,b)=>a+(b.total-(b.paidAmount||0)),0);

const grandTotal=curTotal+unpaidTotal;

const msg=`Dear ${s.parentName}, fee bill for ${s.name} (${s.rollNumber}) for ${MO[mo]} ${yr} is ₹${grandTotal}${unpaidTotal>0?' (includes ₹'+unpaidTotal+' dues)':''}. - Central Public School`;

alert('SMS Message (to '+s.phoneNumber+'):\n\n'+msg+'\n\nNote: Integrate with SMS gateway API.');

toast('SMS prepared','suc');

};

window.renderOv = function(){

const mo=parseInt(document.getElementById('ovMo').value),yr=parseInt(document.getElementById('ovYr').value),cls=document.getElementById('ovCls').value;

let ss=dbCache.students.filter(s=>s.session===dbCache.cur);if(cls)ss=ss.filter(s=>s.class===cls);

const bills=dbCache.bills.filter(b=>b.month===mo&&b.year===yr&&b.paid),bids=bills.map(b=>b.studentId);

const paid=ss.filter(s=>bids.includes(s.id)),upd=ss.filter(s=>!bids.includes(s.id));

let h='<div class="sdiv">Paid ('+paid.length+')</div><div class="sgrid">';

paid.forEach(s=>{h+=`<div style="background:#fff;border-radius:9px;border:1px solid var(--border);padding:12px;display:flex;gap:12px;align-items:center"><div style="flex:1"><div style="font-weight:700;font-size:.88rem;color:var(--navy)">${s.name} <span class="bdg bdg-c">Class ${s.class}</span></div><div style="font-size:.75rem;color:var(--text-light);margin-top:2px">Roll: ${s.rollNumber}</div></div><div style="color:var(--success);font-weight:700">PAID</div></div>`;});

h+='</div><div class="sdiv">Unpaid ('+upd.length+')</div><div class="sgrid">';

upd.forEach(s=>{h+=`<div style="background:#fff;border-radius:9px;border:1px solid var(--border);padding:12px;display:flex;gap:12px;align-items:center"><div style="flex:1"><div style="font-weight:700;font-size:.88rem;color:var(--navy)">${s.name} <span class="bdg bdg-c">Class ${s.class}</span></div><div style="font-size:.75rem;color:var(--text-light);margin-top:2px">Roll: ${s.rollNumber} · 📱 ${s.phoneNumber}</div></div><div style="display:flex;gap:4px"><button class="btn btn-g btn-xs" onclick="qkBill('${s.id}')">Bill</button><button class="btn btn-i btn-xs" onclick="sendDueSMS('${s.id}',${mo},${yr})">📱</button></div></div>`;});

h+='</div>';document.getElementById('ovList').innerHTML=h;

};

window.sendDueSMS = function(sid,mo,yr){

const s=dbCache.students.find(s=>s.id===sid);if(!s)return;

const msg=`Dear ${s.parentName}, reminder: fee for ${s.name} (${s.rollNumber}) for ${MO[mo]} ${yr} is pending. Amount: ₹${s.monthlyFee}. - Central Public School`;

alert('SMS Message (to '+s.phoneNumber+'):\n\n'+msg);

toast('Reminder sent','suc');

};

function renderHist(){

const srch=(document.getElementById('hSrch')?.value||'').toLowerCase();

const mo=parseInt(document.getElementById('hMo')?.value||'0');

const cls=document.getElementById('hCls')?.value||'';

let bills=[...dbCache.bills].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

if(mo)bills=bills.filter(b=>b.month===mo);

if(cls)bills=bills.filter(b=>b.studentClass===cls);

if(srch)bills=bills.filter(b=>b.studentName.toLowerCase().includes(srch)||b.rollNumber.toLowerCase().includes(srch));

const c=document.getElementById('hList');

if(!bills.length){c.innerHTML='<div class="empty"><div class="ei">📂</div><h4>No bills found</h4></div>';return;}

c.innerHTML=bills.map(b=>{

const isPaid=b.paid&&b.paidAmount>=b.total;

const isPartial=b.paidAmount>0&&b.paidAmount<b.total;

const statusBadge=isPaid?'<span class="bdg bdg-paid">PAID</span>':isPartial?'<span class="bdg" style="background:rgba(230,126,34,.1);color:var(--warning)">PARTIAL</span>':'<span class="bdg" style="background:rgba(192,57,43,.1);color:var(--danger)">UNPAID</span>';

return`<div class="sc"><div class="av" style="background:linear-gradient(135deg,${isPaid?'var(--success)':isPartial?'var(--warning)':'var(--danger)'},#20c997)">₹</div><div class="sm"><h3>${b.studentName} <span class="bdg bdg-c">Class ${b.studentClass}</span> ${statusBadge}${b.autoGenerated?' <span class="bdg" style="background:rgba(52,152,219,.1);color:#3498db;font-size:.65rem">AUTO</span>':''}</h3><div class="sub"><span>📝 ${b.rollNumber}</span><span>📅 ${MO[b.month]} ${b.year}</span><span>👪 ${b.parentName}</span></div>${isPartial?`<div style="font-size:.75rem;color:var(--text-mid);margin-top:4px">Paid: ₹${b.paidAmount.toLocaleString('en-IN')} / ₹${b.total.toLocaleString('en-IN')}</div>`:''}</div><div style="text-align:right;flex-shrink:0"><div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;color:var(--navy)">₹${(b.paidAmount||b.total).toLocaleString('en-IN')}</div><div style="font-size:.72rem;color:var(--text-light)">${new Date(b.createdAt).toLocaleDateString('en-IN')}</div><button class="btn btn-i btn-xs" onclick="sendBillSMSById('${b.id}')" style="margin-top:4px">📱 SMS</button></div></div>`;

}).join('');

}

window.sendBillSMSById = function(bid){

const b=dbCache.bills.find(x=>x.id===bid);if(!b)return;

const status=b.paid&&b.paidAmount>=b.total?' - PAID':b.paidAmount>0?` - Partial Payment ₹${b.paidAmount}`:' - UNPAID';

const msg=`Dear ${b.parentName}, fee bill for ${b.studentName} (${b.rollNumber}) for ${MO[b.month]} ${b.year} is ₹${b.total}${status}. - Central Public School`;

alert('SMS Message:\n\n'+msg);

toast('SMS sent','suc');

};

// ===== NOTICES =====

window.noticeTypeChange = function(){

const type=document.getElementById('noticeTo').value;

document.getElementById('noticeClassSelect').style.display=type==='class'?'block':'none';

document.getElementById('noticeStudentSelect').style.display=type==='select'?'block':'none';

if(type==='select')loadStudentCheckList();

};

function loadStudentCheckList(){

const list=dbCache.students.filter(s=>s.session===dbCache.cur);

document.getElementById('studentCheckList').innerHTML=list.map(s=>`<div style="padding:5px;border-bottom:1px solid var(--border)"><label style="display:flex;align-items:center;cursor:pointer"><input type="checkbox" class="stu-check" value="${s.id}"><span style="font-size:.85rem">${s.name} (${s.rollNumber}) - Class ${s.class}</span></label></div>`).join('');

}

window.sendNotice = async function(){

const title=document.getElementById('noticeTitle').value.trim();

const msg=document.getElementById('noticeMsg').value.trim();

const type=document.getElementById('noticeTo').value;

if(!title||!msg){toast('Fill title and message','err');return;}

let recipients=[];

if(type==='all'){

recipients=dbCache.students.filter(s=>s.session===dbCache.cur);

}else if(type==='class'){

const cls=document.getElementById('noticeClass').value;

if(!cls){toast('Select a class','err');return;}

recipients=dbCache.students.filter(s=>s.session===dbCache.cur&&s.class===cls);

}else if(type==='select'){

const checked=document.querySelectorAll('.stu-check:checked');

if(checked.length===0){toast('Select students','err');return;}

const ids=Array.from(checked).map(c=>c.value);

recipients=dbCache.students.filter(s=>ids.includes(s.id));

}

if(recipients.length===0){toast('No recipients','err');return;}

showLoader();

try {

const notice={

  title,

  message:msg,

  type,

  recipientCount:recipients.length,

  createdAt:new Date().toISOString(),

  recipients:recipients.map(r=>({id:r.id,name:r.name,phone:r.phoneNumber}))

};

await saveNoticeToDb(notice);

toast(`Notice sent to ${recipients.length} parents!`,'suc');

document.getElementById('noticeTitle').value='';

document.getElementById('noticeMsg').value='';

document.getElementById('noticeTo').value='all';

noticeTypeChange();

} catch (error) {

toast('Error sending notice','err');

}

hideLoader();

};

function renderNotices(){

const list=[...dbCache.notices].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

const c=document.getElementById('noticeHistory');

if(!list.length){c.innerHTML='<div class="empty"><div class="ei">📢</div><h4>No notices yet</h4></div>';return;}

c.innerHTML=list.map(n=>`<div class="notice-card">

<h4>${n.title}</h4>

<div class="meta">Sent to ${n.recipientCount} parents · ${new Date(n.createdAt).toLocaleString('en-IN')}</div>

<div class="msg">${n.message}</div>

  </div>`).join('');

}

// ===== REPORTS =====

function renderRpt(){

const date=document.getElementById('rDate')?.value,cls=document.getElementById('rCls')?.value||'';

if(!date){document.getElementById('rCnt').innerHTML='<div class="empty"><div class="ei">📊</div><p>Select a date</p></div>';return;}

const da=dbCache.attendance[date]||{};let ss=dbCache.students.filter(s=>s.session===dbCache.cur);if(cls)ss=ss.filter(s=>s.class===cls);

const pr=ss.filter(s=>da[s.rollNumber]),ab=ss.filter(s=>!da[s.rollNumber]);

let h='<div class="sdiv">Present ('+pr.length+')</div><div class="agrid">';

pr.forEach(s=>{h+=`<div class="ac pres"><div class="an">${s.name}</div><div class="as">Roll ${s.rollNumber} · Class ${s.class}</div><div class="at">🕐 ${da[s.rollNumber].time}</div></div>`;});

h+='</div><div class="sdiv">Absent ('+ab.length+')</div><div class="agrid">';

ab.forEach(s=>{h+=`<div class="ac abs"><div class="an">${s.name}</div><div class="as">Roll ${s.rollNumber} · Class ${s.class}</div></div>`;});

h+='</div>';document.getElementById('rCnt').innerHTML=h;

}

// ===== SESSIONS =====

window.showNewSession = function(){

opM('newSessionM');

};

window.createNewSession = async function(){

const name=document.getElementById('newSessName').value.trim();

if(!name){toast('Enter session name','err');return;}

if(dbCache.sessions.includes(name)||name===dbCache.cur){toast('Session exists','err');return;}

if(!confirm(`Archive ${dbCache.cur} and create ${name}?`))return;

showLoader();

try {

dbCache.sessions.push(dbCache.cur);

dbCache.cur=name;

await saveSettings();

document.getElementById('newSessName').value='';

clsM('newSessionM');

document.getElementById('sessTag').textContent='Session '+dbCache.cur;

toast('Session created: '+name,'suc');

renderSess();renderDash();

} catch (error) {

toast('Error creating session','err');

}

hideLoader();

};

function renderSess(){

const all=[...new Set([dbCache.cur,...dbCache.sessions,...dbCache.students.map(s=>s.session).filter(Boolean)])].sort().reverse();

let h='<div style="background:linear-gradient(135deg,var(--navy),var(--royal));border-radius:12px;padding:18px 22px;color:#fff;margin-bottom:20px"><h3 style="font-family:\'Playfair Display\',serif;font-size:1rem;font-weight:800">Active: Session '+dbCache.cur+'</h3><p style="font-size:.8rem;color:rgba(255,255,255,.7);margin-top:2px">All new registrations go here</p></div><div class="sgrid">';

all.forEach(sess=>{

const ss=dbCache.students.filter(s=>s.session===sess),bs=dbCache.bills.filter(b=>b.session===sess&&b.paid),col=bs.reduce((a,b)=>a+(b.paidAmount||b.total),0);

h+=`<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div><div style="font-family:'Playfair Display',serif;font-size:1.15rem;font-weight:800;color:var(--navy)">Session ${sess}</div>${sess===dbCache.cur?'<span class="bdg" style="background:rgba(45,155,90,.12);color:var(--success);margin-top:3px">● Active</span>':'<span class="bdg" style="background:var(--cream);color:var(--text-mid);border:1px solid var(--border);margin-top:3px">Archived</span>'}</div><div style="text-align:right"><div style="font-size:.72rem;color:var(--text-light)">Collected</div><div style="font-family:'Playfair Display',serif;font-size:1.05rem;font-weight:800;color:var(--navy)">₹${col.toLocaleString('en-IN')}</div></div></div><div style="display:flex;gap:20px">${[[ss.length,'Students'],[bs.length,'Bills'],[[...new Set(ss.map(s=>s.class))].length,'Classes']].map(([v,l])=>`<div><div style="font-size:1.4rem;font-weight:800;color:var(--navy)">${v}</div><div style="font-size:.72rem;color:var(--text-light)">${l}</div></div>`).join('')}</div></div>`;

});

h+='</div>';document.getElementById('sessList').innerHTML=h;

}

// Start loader

showLoader();