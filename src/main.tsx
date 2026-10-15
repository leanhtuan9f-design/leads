import {createRoot} from 'react-dom/client';
import AuthGate from './auth/AuthGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<AuthGate />);
