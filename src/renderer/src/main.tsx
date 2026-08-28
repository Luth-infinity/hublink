import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Overlay from './Overlay';
import './index.css';

// Le calque des messages partage ce paquet plutôt que d'avoir le sien : il
// tient en quelques composants, et une seconde entrée de build coûterait plus
// cher à maintenir que les quelques kilo-octets épargnés.
const estCalque = new URLSearchParams(window.location.search).has('overlay');
if (estCalque) document.documentElement.classList.add('calque');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{estCalque ? <Overlay /> : <App />}</React.StrictMode>
);
