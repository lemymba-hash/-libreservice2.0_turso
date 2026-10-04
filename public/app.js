// app.js — fonctions partagées par toutes les pages (auth, appels API, en-tête)

const API_BASE = '/api';

const Session = {
  getToken() { return localStorage.getItem('ls_token'); },
  getUser() {
    const raw = localStorage.getItem('ls_user');
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem('ls_token', token);
    localStorage.setItem('ls_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('ls_token');
    localStorage.removeItem('ls_user');
  },
  estConnecte() { return !!this.getToken(); },
};

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = Session.getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* pas de corps JSON */ }

  if (!res.ok) {
    const message = (data && data.error) || 'Une erreur est survenue.';
    if (res.status === 401) {
      Session.clear();
    }
    throw new Error(message);
  }
  return data;
}

function echapperHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formaterDate(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formaterHeure(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function etoiles(note) {
  const n = Math.round(note || 0);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

const CATEGORIE_EMOJI = {
  bricolage: '🔧',
  entretien: '🧹',
  beaute: '💇',
  cours: '📚',
  livraison: '🛵',
  divers: '🧰',
};

const LOGO_MARQUE = `
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="5" y="5" width="22" height="22" rx="2" transform="rotate(45 16 16)" fill="#fcd116"/>
    <circle cx="16" cy="16" r="6.5" fill="#0a5a45"/>
  </svg>`;

function rendreEntete(actif) {
  const user = Session.getUser();
  const conteneur = document.getElementById('entete');
  if (!conteneur) return;

  const lien = (href, cle, texte) =>
    `<a href="${href}" class="${actif === cle ? 'actif' : ''}">${texte}</a>`;

  let liensDroite = '';
  if (!user) {
    liensDroite = `
      ${lien('/pages/connexion.html', 'connexion', 'Connexion')}
      <a href="/pages/inscription.html" class="btn accent">Inscription</a>
    `;
  } else {
    const lienEspace = user.role === 'admin'
      ? lien('/pages/admin.html', 'admin', 'Back-office')
      : lien('/pages/profil.html', 'profil', 'Mon profil');
    liensDroite = `
      ${lienEspace}
      ${lien('/pages/messages.html', 'messages', 'Messages')}
      <button class="lien" id="btn-deconnexion">Déconnexion</button>
    `;
  }

  conteneur.innerHTML = `
    <div class="conteneur">
      <a href="/" class="logo">${LOGO_MARQUE}<span>LibreService</span></a>
      <nav class="nav-principale" aria-label="Navigation principale">
        ${lien('/pages/recherche.html', 'recherche', 'Rechercher')}
        ${liensDroite}
      </nav>
    </div>
  `;

  const btnDeco = document.getElementById('btn-deconnexion');
  if (btnDeco) {
    btnDeco.addEventListener('click', () => {
      Session.clear();
      window.location.href = '/';
    });
  }
}

function afficherAlerte(conteneurId, message, type = 'erreur') {
  const el = document.getElementById(conteneurId);
  if (!el) return;
  el.innerHTML = `<div class="alerte ${type}">${echapperHtml(message)}</div>`;
}

function viderAlerte(conteneurId) {
  const el = document.getElementById(conteneurId);
  if (el) el.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  rendreEntete(document.body.dataset.page);
});
