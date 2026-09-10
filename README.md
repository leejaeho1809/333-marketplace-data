# sauna-reserch

React + Vite + TypeScript + Tailwind CSS 프로젝트. 기존 HTML 페이지들을 React 컴포넌트로 재구현하며, 데이터는 Supabase를 사용한다.

## 스택

- [Vite](https://vite.dev/) + React + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite` 플러그인)
- [React Router](https://reactrouter.com/) (페이지 라우팅)
- [Supabase](https://supabase.com/) (`@supabase/supabase-js`)

## 폴더 구조

```
src/
  components/   재사용 UI 컴포넌트
  hooks/        커스텀 훅
  pages/        라우트 단위 페이지
  types/        공용 타입 정의
  utils/        supabase 클라이언트 등 유틸리티
  App.tsx       라우트 정의
  main.tsx      엔트리 포인트
```

## 시작하기

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY 값 채우기
npm run dev
```

## 스크립트

- `npm run dev` — 개발 서버 실행
- `npm run build` — 타입 체크 후 프로덕션 빌드
- `npm run preview` — 빌드 결과 미리보기
- `npm run lint` — oxlint 실행
