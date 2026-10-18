/* FCM background notifications contain no position details or monetary amounts. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
const config=JSON.parse(new URL(self.location.href).searchParams.get('config')||'null');
if(config&&config.projectId==='poizen-lounge'){
 firebase.initializeApp(config);
 firebase.messaging();
}
