(() => {
  const config = window.DGL_SITE || {};
  const email = String(config.contactEmail || "").trim();
  const emailLink = document.querySelector("[data-email]");
  const emailLabel = document.querySelector("[data-email-label]");
  if (email) { emailLink.href = `mailto:${email}`; emailLabel.textContent = email; }
  else { emailLink.removeAttribute("href"); emailLink.classList.add("contact__email--pending"); }
  const games = Array.isArray(config.games) ? config.games.filter((game) => game && game.title) : [];
  if (!games.length) return;
  document.getElementById("empty-games").hidden = true;
  const grid = document.getElementById("games-grid"); const template = document.getElementById("game-card-template");
  games.forEach((game) => { const card = template.content.cloneNode(true); const icon = card.querySelector("img"); icon.src = game.icon || "favicon.svg"; icon.alt = `${game.title} app icon`; card.querySelector("h3").textContent = game.title; card.querySelector(".game-card__description").textContent = game.description || ""; card.querySelector(".platform").textContent = game.platform || "Mobile"; card.querySelector(".status").textContent = game.status || "Coming Soon"; const links = card.querySelector(".game-card__links"); [[game.googlePlayUrl, "Google Play"], [game.appStoreUrl, "App Store"]].forEach(([url, label]) => { if (!url) return; const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.textContent = label; links.append(link); }); grid.append(card); });
})();
