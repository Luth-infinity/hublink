import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Overlay from './Overlay';
import VideoBar from './VideoBar';
import './index.css';

// Le calque des messages partage ce paquet plutôt que d'avoir le sien : il
// tient en quelques composants, et une seconde entrée de build coûterait plus
// cher à maintenir que les quelques kilo-octets épargnés.
const params = new URLSearchParams(window.location.search);
const estCalque = params.has('overlay');
// La barre de la fenêtre vidéo, troisième visage du même paquet.
const estVideo = params.has('video');
if (estCalque) document.documentElement.classList.add('calque');
// Toujours sombre : elle borde une image, et une bande claire sous une vidéo
// se voit plus qu'elle ne s'oublie.
if (estVideo) document.documentElement.classList.add('video', 'dark');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{estVideo ? <VideoBar /> : estCalque ? <Overlay /> : <App />}</React.StrictMode>
);
