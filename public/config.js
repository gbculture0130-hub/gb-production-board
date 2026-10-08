// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig 값을 그대로 넣습니다.
// 공개되어도 되는 값입니다. 실제 보안은 firestore.rules가 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyC-Q7T7a6E5FvTxJX5606f084fZNDCq4CM",
  authDomain: "wlql-4dab7.firebaseapp.com",
  projectId: "wlql-4dab7",
  storageBucket: "wlql-4dab7.firebasestorage.app",
  messagingSenderId: "796092318410",
  appId: "1:796092318410:web:acc7b8de23d663b465aa33"
};

// 소유자(최고 관리자) 구글 계정. firestore.rules의 OWNER 값과 반드시 같아야 합니다.
export const OWNER_EMAIL = "gbculture12@gmail.com";
