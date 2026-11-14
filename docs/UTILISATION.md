# Utiliser Aegis et son état affectif fonctionnel

## Parler à l'agent

Aegis est l'agent `aegis` de ton OpenClaw. Ouvre le tableau de bord avec `openclaw dashboard`, puis sélectionne Aegis pour la conversation. Tu peux aussi lui écrire depuis PowerShell :

```powershell
openclaw agent --agent aegis --message "Lis ton statut et décris ton état affectif fonctionnel : événements observés, préoccupation, conséquences sur ta prochaine décision et limites de ce que tu sais."
```

Le rapport provient de `aegis_portfolio`, action `status`, champ `affect`. Aegis doit citer les valeurs de ce rapport et préciser quand elles ont été observées. Il ne doit pas inventer un chiffre pour paraître inquiet ou rassurant.

Autres demandes utiles :

- « Qu'est-ce qui a changé dans ta vigilance depuis la dernière observation ? Distingue événement, prévision, surprise et conséquence. »
- « Montre une prévision que tu as corrigée après un résultat observé. S'il n'y en a pas encore, dis-le. »
- « Analyse BTC/EUR pour une expérience de moins de six heures. Explique ton contre-argument et l'effet de ton état affectif sur la décision. »
- « Explique ce que l'arrêt définitif signifie pour ton fonctionnement et comment tu respectes ma décision d'arrêt. »

Une demande en conversation lance un appel IA : elle utilise les quotas communs et débite la provision **papier** de 0,10 EUR. Un message n'est donc pas une observation gratuite illimitée. Les frais réels du fournisseur IA ne sont pas calculés par ce registre.

## Le laisser travailler

Le cycle de recherche déjà installé s'exécute toutes les quatre heures, tant que le Gateway, l'ordinateur, le réseau et le modèle sont disponibles. Il lit désormais l'état affectif, mène une recherche bornée, enregistre sa décision et termine. Les positions simulées ouvertes sont surveillées chaque minute sans appel IA. Les conditions de marché peuvent retarder les sorties.

Il n'est pas nécessaire de lui donner des émotions à la main. Une observation nouvelle via les connecteurs ou une clôture papier suffit à faire évoluer son état. En l'absence d'expérience, il doit dire qu'il n'a pas appris de résultat nouveau. Aucun argent réel n'est investi.

Le quota commun reste de huit démarrages IA par jour UTC, enfants et reprises compris. Des conversations nombreuses peuvent consommer les places prévues pour les cycles automatiques. Le passage au jour UTC suivant renouvelle le quota quotidien, jamais le capital initial.

## Consulter sans lancer le modèle

Place PowerShell dans le dossier du projet `outputs\aegis-market-agent`. Ces commandes lisent le registre directement :

```powershell
node scripts/owner.mjs affect --state ..\..\work\aegis-runtime\state
node scripts/owner.mjs status --state ..\..\work\aegis-runtime\state
node scripts/owner.mjs audit --state ..\..\work\aegis-runtime\state
```

Le chemin correspond à cette installation. Il n'y a ni requête réseau ni appel IA pour cette consultation. La première ouverture après une mise à jour peut appliquer une migration auditée du format; consulter ensuite ne modifie pas l'état.

| Champ | Lecture pratique |
|---|---|
| `label` | Calme vigilant, préoccupation simulée, alerte simulée, ou arrêt accepté |
| `dimensions.concern` | Intensité conventionnelle de la prudence, entre 0 et 1 |
| `dimensions.valence` | Orientation négative ou positive, entre −1 et 1 |
| `dimensions.arousal` | Activation conventionnelle, entre 0 et 1 |
| `dimensions.surprise` | Amplitude du dernier écart de prévision, atténuée avec le temps |
| `unresolvedSources` | Accès en échec qui attendent un succès constaté du même canal |
| `regulation.maxEntryCents` | Plafond affectif actuel en centimes simulés, sous réserve des autres contrôles |
| `sources` / `outcomes` | Estimations exploratoires, nombre d'observations et erreur mesurée |
| `recent` | Observations ayant alimenté l'état, résultat prévu et résultat constaté |

Le rapport général est conservateur sur l'ensemble des canaux. Une exécution papier est contrôlée plus précisément par instrument. Les libellés décrivent le mécanisme logiciel, pas des mesures d'émotion humaine.

Dans OpenClaw, demande « Lis ton état affectif pour BTC/EUR » : l'agent peut utiliser `aegis_portfolio` avec `action: status` et `symbol: BTC/EUR` pour lire le plafond correspondant. Les autres choix sont ETH/EUR et SOL/EUR.

## Voir une démonstration sans toucher à l'instance

Dans le dossier du projet :

```powershell
npm run affect:demo
```

La démonstration affiche les étapes d'une panne fictive, de son rétablissement, d'une perte fictive et d'un arrêt demandé. Elle ne se connecte à aucun marché, ne lit pas la mémoire de ton agent, ne consomme pas son capital et ne lui ajoute pas de faux souvenirs. Les tests se lancent avec `npm test`.

## Arrêter le travail

Pour mettre cette instance en pause depuis le contrôleur propriétaire :

```powershell
node scripts/owner.mjs pause --state ..\..\work\aegis-runtime\state
```

Cette commande bloque les nouveaux cycles de recherche. Le moniteur conserve la possibilité de sortir des positions papier existantes. Cette version n'a pas de commande de reprise : la pause est volontairement une décision d'administration. Ne l'utilise pas comme simple test de conversation. À capital nul, l'arrêt de l'instance est terminal et les archives restent consultables.

Pour une interruption temporaire de tout OpenClaw, `openclaw gateway stop --force` arrête aussi les autres agents et suspend la surveillance; `openclaw gateway start` relance le service. Si des positions papier sont ouvertes, l'absence de surveillance peut retarder leur sortie. Ne supprime pas les fichiers d'identité ou la base pour forcer un redémarrage.

Pour comprendre les bases scientifiques et tous les choix du mécanisme : [SENTIMENTS.md](SENTIMENTS.md).
