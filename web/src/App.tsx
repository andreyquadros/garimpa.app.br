import { createBrowserRouter, createHashRouter, Navigate, useParams } from 'react-router';
import { DEMO } from './lib/api';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { Feed } from './pages/Feed';
import { Ask } from './pages/Ask';
import { QuestionPage } from './pages/Question';
import { AnswerPage } from './pages/Answer';
import { Jornada } from './pages/Jornada';
import { Carteira } from './pages/Carteira';
import { Login } from './pages/Login';
import { PlacePage } from './pages/Place';

function LegacyMission({ sub = '' }: { sub?: string }) { const { id } = useParams(); return <Navigate to={`/m/${id}${sub}`} replace />; }

// Na demonstração (hospedagem estática, GitHub Pages) as rotas vivem no hash: /#/missoes.
export const router = (DEMO ? createHashRouter : createBrowserRouter)([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'missoes', element: <Feed /> },
      { path: 'missoes/nova', element: <Ask /> },
      { path: 'm/:id', element: <QuestionPage /> },
      { path: 'm/:id/evidencia', element: <AnswerPage /> },
      { path: 'lugar/:id', element: <PlacePage /> },
      { path: 'jornada', element: <Jornada /> },
      { path: 'carteira', element: <Carteira /> },
      { path: 'entrar', element: <Login /> },
      // Endereços antigos continuam funcionando.
      { path: 'garimpos', element: <Navigate to="/missoes" replace /> },
      { path: 'perguntar', element: <Navigate to="/missoes/nova" replace /> },
      { path: 'g/:id', element: <LegacyMission /> },
      { path: 'g/:id/responder', element: <LegacyMission sub="/evidencia" /> },
      { path: 'ranking', element: <Navigate to="/jornada" replace /> },
      { path: 'perfil', element: <Navigate to="/carteira" replace /> },
    ],
  },
]);
