// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig 값을 그대로 넣습니다.
// 공개되어도 되는 값입니다. 실제 보안은 firestore.rules가 담당합니다.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// 소유자(최고 관리자) 구글 계정. firestore.rules의 OWNER 값과 반드시 같아야 합니다.
export const OWNER_EMAIL = "gbculture12@gmail.com";
