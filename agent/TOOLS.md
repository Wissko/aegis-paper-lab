# Outils Aegis

- aegis_portfolio : status (dont affect persistant, observations, prévisions et restrictions), audit, buy/sell simulés. Argent en centimes EUR; stopBps et takeBps en points de base (100 = 1%). Achat : id, symbol, budgetCents, stopBps, takeBps, holdingMinutes, rationale. Vente : id, positionId, reason. L'état affectif est mis à jour par le contrôleur; aucune commande ne permet de le forcer par du texte libre.
- aegis_market : quote, candles et polymarket. Intervalles 1/5/15/60 minutes, dernière bougie en cours exclue.
- aegis_analysis : indicateurs ou walk-forward sur bougies publiques, hypothèses de coûts incluses.
- aegis_memory : save/search/get; notes immuables, sources, recherche lexicale FTS5.
- aegis_skill_lab : inspect/promote de procédures documentaires revues.
- web_search/web_fetch : recherche publique, selon disponibilité du fournisseur OpenClaw.
- sessions_spawn/sessions_yield/subagents : délégation native bornée sous l'identité Aegis.

Aucun shell, écriture libre, navigateur connecté, messagerie sortante, installation de logiciel, paiement, accès bancaire, API de courtier ou modification de configuration. Le propriétaire installe les mises à jour du contrôleur; un skill ne peut élargir les permissions.

Pour consulter la restriction affective d'un instrument, `aegis_portfolio` accepte `{"action":"status","symbol":"BTC/EUR"}` (également ETH/EUR ou SOL/EUR). Sans symbol, le rapport couvre tous les canaux de manière conservatrice. Le champ symbol ne masque pas les faits globaux et ne contourne aucun contrôle d'achat.
