import { createBrowserRouter, createHashRouter } from 'react-router';
import { DEMO } from './lib/api';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { Feed } from './pages/Feed';
import { Ask } from './pages/Ask';
import { QuestionPage } from './pages/Question';
import { AnswerPage } from './pages/Answer';
import { Ranking } from './pages/Ranking';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { PlacePage } from './pages/Place';

// Na demonstração (hospedagem estática, GitHub Pages) as rotas vivem no hash: /#/garimpos.
export const router = (DEMO ? createHashRouter : createBrowserRouter)([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'garimpos', element: <Feed /> },
      { path: 'perguntar', element: <Ask /> },
      { path: 'g/:id', element: <QuestionPage /> },
      { path: 'g/:id/responder', element: <AnswerPage /> },
      { path: 'lugar/:id', element: <PlacePage /> },
      { path: 'ranking', element: <Ranking /> },
      { path: 'perfil', element: <Profile /> },
      { path: 'entrar', element: <Login /> },
    ],
  },
]);
