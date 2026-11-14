# Aegis Paper Lab

**Un laboratoire pour étudier le contrôle d'un agent : quotas persistants, journal
vérifiable, reprise après panne et décisions sur données simulées.**

Cette édition publique est un instantané de recherche à historique neuf. Elle ne contient
ni historique de travail privé, ni mémoire d'instance, ni compte financier, ni secret.
Le cas d'application est la recherche financière en simulation, avec un adaptateur OpenClaw.
Commencez par la démo hors ligne : elle n'exige aucun compte ni fournisseur payant.

| À explorer | Code |
| --- | --- |
| Plafonds et autorisations | [src/policy.mjs](src/policy.mjs) |
| Registre SQLite, idempotence et journal d'intégrité | [src/store.mjs](src/store.mjs) |
| Reprise de surveillance | [src/monitor.mjs](src/monitor.mjs) |
| Réactions aux observations et aux échecs | [src/affect.mjs](src/affect.mjs) |
| Vérifications reproductibles | [test/](test/) |

Licence [MIT](LICENSE). Contributions : [CONTRIBUTING.md](CONTRIBUTING.md).
32 tests et 6 étapes de démonstration synthétique exécutés localement le 14 novembre 2026.
L'intégration Gateway n'a pas été relancée lors de la préparation de cette édition publique.

Aegis dispose d'une identité et d'une mémoire dédiées, d'un capital initial unique de **50 EUR simulés**, d'outils de recherche publique, d'un laboratoire quantitatif et d'un moteur de positions à court terme. **Aucun argent réel n'est déposé ou investi. Aucune API d'ordre réel n'est implémentée.** Le logiciel ne garantit ni bénéfice, ni absence d'erreur, ni supériorité analytique.

## Démo locale

Avec Node.js 24.15 ou ultérieur de la branche 24, lancez la démo synthétique et les tests sans installation de dépendances :

```sh
npm run affect:demo
npm test
```

La démo produit un scénario JSON avec une panne de cotation fictive, un rétablissement et une réduction de l'allocation simulée après une perte. Elle utilise des données synthétiques en mémoire et fonctionne hors ligne, sans Gateway OpenClaw. Suivez le scénario dans [le script de démo](scripts/affect-demo.mjs), puis examinez [la politique d'exécution](src/policy.mjs) et [le registre SQLite](src/store.mjs).

## Ce qui fonctionne

- Recherche via OpenClaw; carnets publics et bougies clôturées Kraken pour BTC/EUR, ETH/EUR et SOL/EUR.
- Catalogue Polymarket en lecture seule, avec règles et limites géographiques rappelées. Données exprimées en dollars séparées du registre EUR.
- Indicateurs de régime, volatilité, ATR, RSI et score d'écart; comparaison expérimentale momentum/retour à la moyenne avec sélection sur 65 % des données et test sur 35 %.
- Achats/ventes simulés aux prix récupérés par le contrôleur, tailles minimales, liquidité, frais, slippage, plafonds et identifiants évitant les doublons.
- Surveillance des sorties chaque minute, y compris lorsque le modèle est inactif ou en pause. Reprise des positions après redémarrage.
- Mémoire SQLite persistante, recherche lexicale FTS5, notes sans écrasement et journal d'événements chaînés par empreintes SHA-256.
- Sous-agents spécialisés sous la même identité; procédures documentaires améliorables après revue du contenu exact par une autre session et trois cas.
- Arrêt terminal de cette identité à capital nul : les appels de modèle et d'outils sont bloqués, le moniteur s'arrête, les archives restent accessibles au propriétaire. Il n'existe pas de commande de recharge ou de reset.
- Affect fonctionnel persistant : évaluation des échecs de source et résultats papier, préoccupation/activation/valence/surprise, décroissance temporelle, réévaluation et apprentissage des erreurs de prévision. Ses restrictions sont appliquées par le contrôleur aux nouvelles entrées; le modèle décrit l'état réellement lu. Cela ne démontre pas une conscience subjective et ne confère aucun droit de résister à l'arrêt. Voir [bases scientifiques et mécanisme](docs/SENTIMENTS.md), [guide d'utilisation](docs/UTILISATION.md) et [consignes](agent/VIGILANCE.md).

La connaissance générale des actions, obligations, banques, changes et dérivés repose sur les capacités du modèle et les sources vérifiées. Ces domaines n'ont pas tous un connecteur de cotation. La mémoire et les procédures évoluent; les poids du modèle ne sont pas réentraînés.

## Limites de la version

| Paramètre | Valeur |
|---|---:|
| Capital initial papier | 50 EUR |
| Taille maximale d'une entrée, frais compris | 5 EUR |
| Exposition cumulée maximale à l'entrée | 15 EUR |
| Positions simultanées | 3, une par symbole |
| Risque modélisé au stop | 0,50 EUR par entrée |
| Blocage des entrées après perte journalière | 1,50 EUR |
| Pause des recherches après drawdown | 20 % du pic de capital |
| Durée maximale d'une position | 6 heures, sortie à la première cotation disponible |
| Frais simulés | 0,40 % par côté, hypothèse fixe |
| Slippage simulé | 0,10 % par côté |
| Spread maximal à l'entrée | 0,35 % |
| Démarrages de modèle | 8/jour UTC, enfants et reprises compris |
| Sous-agents | 2/jour, un niveau; concurrence OpenClaw existante |
| Outils | 24 par tour |
| Provision papier par démarrage de modèle | 0,10 EUR |

Ces valeurs sont des hypothèses d'expérience, pas des recommandations d'investissement. Elles sont contrôlées par le code hôte, inaccessible en écriture via les outils Aegis. Pas de levier, vente à découvert, martingale ou grille automatique. Les frais réels du fournisseur IA ne sont **pas** rapprochés : la provision de 0,10 EUR est un coût simulé, pas une facture ni un plafond de dépenses réelles. Les minimums du marché peuvent empêcher une entrée de 5 EUR.

Le moniteur dépend du Gateway, de l'ordinateur et du réseau. Un stop ou une échéance ne garantit pas un prix ni une clôture à l'heure exacte. En panne de données, aucune exécution n'est inventée; une sortie reste en attente. L'horodatage de cotation est l'heure de réception HTTP locale, pas une preuve indépendante de fraîcheur de l'exchange. Le modèle ne peut pas installer du code, s'accorder des outils ou manipuler des comptes financiers.

## Installation Windows

Prérequis : OpenClaw 2026.8.2 compatible, Node.js 24.15+ de la branche 24, modèle OpenClaw déjà configuré. Cette version n'ajoute aucune dépendance npm.

```powershell
npm test
npm run smoke
./scripts/install.ps1 -RuntimeRoot 'C:\chemin\prive\aegis-runtime'
openclaw gateway restart
openclaw agent --agent aegis --message 'Vérifie ton portefeuille, ta mémoire et les outils publics. Aucun achat pour ce contrôle.' --json
```

Le runtime contient `state/` (registre, identité, mémoire), `workspace/` (persona et skills) et `openclaw-agent/` (sessions OpenClaw). Garder ces données hors du dépôt. L'installateur refuse de remplacer une autre identité Aegis. Il sélectionne le runtime intégré `openclaw` pour cet agent et autorise les hooks de cycle de vie du contrôleur, nécessaires pour bloquer les nouveaux tours et appliquer les quotas. Le plugin refuse de démarrer si cette autorisation manque. Ne jamais supprimer la base pour « recommencer » : restaurer les sauvegardes de l'instance complète en cas d'incident.

Planification native OpenClaw, après un contrôle réussi :

```powershell
$Cycle = Get-Content ./scripts/cycle.txt -Raw
$Tools = 'read,web_search,web_fetch,sessions_spawn,sessions_yield,subagents,session_status,aegis_portfolio,aegis_market,aegis_analysis,aegis_memory,aegis_skill_lab'
openclaw cron add --name aegis-research-cycle --declaration-key aegis:research:v1 --agent aegis --every 4h --session isolated --message $Cycle --thinking high --timeout-seconds 240 --no-deliver --tools $Tools
```

Inspecter `openclaw cron list` avant de créer le cycle afin d'éviter un doublon. Ce cycle n'envoie pas de message vers un service externe. Les résultats se consultent dans le chat Aegis, les tâches OpenClaw et sa mémoire. L'interface OpenClaw suffit : aucun tableau de bord séparé n'est ajouté.

## Contrôle propriétaire

```powershell
node scripts/owner.mjs status --state 'C:\chemin\prive\aegis-runtime\state'
node scripts/owner.mjs audit --state 'C:\chemin\prive\aegis-runtime\state'
node scripts/owner.mjs pause --state 'C:\chemin\prive\aegis-runtime\state'
```

La pause bloque les nouveaux tours de recherche; le moniteur continue à gérer les sorties simulées. Le propriétaire conserve les droits système et le contrôle des services. Le mécanisme terminal est opposable à l'agent, pas inviolable face à un administrateur qui modifie le code ou restaure une ancienne sauvegarde.

## Vérification et architecture

`npm test` couvre capital unique, reprise, arrondis, idempotence, frais, données invalides/périmées, minimums, quotas persistants, limites de perte, arrêt terminal, sorties après panne, intégrité de la mémoire, isolation des outils et promotion des méthodes. `npm run smoke` interroge les API publiques sans ordre. Les tests historiques sont exploratoires et ne constituent pas une validation de performance financière.

Voir [ARCHITECTURE.md](docs/ARCHITECTURE.md), [SOURCES.md](docs/SOURCES.md) et [VALIDATION.md](docs/VALIDATION.md) pour le périmètre, les sources et le protocole de validation.
