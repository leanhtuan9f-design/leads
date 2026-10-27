import {createRoot} from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { LandingPage } from './landing/LandingPage';
const AuthGate = lazy(() => import('./auth/AuthGate.tsx'));
import './index.css';

createRoot(document.getElementById('root')!).render(window.location.pathname === '/' ? <LandingPage /> : <Suspense fallback={<div className="p-8 text-center">Đang mở ứng dụng…</div>}><AuthGate /></Suspense>);
