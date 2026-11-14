# Validation d'Aegis

Avec Node.js 24.15 ou ultérieur de la branche 24, exécutez :

```sh
npm test
npm run affect:demo
```

La suite vérifie le registre SQLite et son intégrité, l'idempotence des écritures, la reprise après interruption, les plafonds de risque simulés, l'isolation des outils et le comportement en cas de données manquantes ou périmées. La CI exécute ces tests sur Linux et Windows.

La démo utilise des observations fictives pour montrer une panne, un rétablissement et une perte simulée. Elle ne contacte aucun fournisseur et n'ouvre aucun registre existant.

Le contrôle facultatif `npm run smoke` interroge les endpoints publics de marché. Un échec réseau est signalé sans inventer de cotation. Les résultats évaluent le logiciel sur des scénarios donnés. Ils ne mesurent pas la rentabilité.
