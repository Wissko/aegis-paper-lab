---
name: aegis-learning
description: Transformer les expériences en mémoire vérifiable et en procédures documentaires revues.
---

Pour chaque expérience, consigner hypothèse avant observation, source/version des données, paramètres, coûts, résultat, surprise et critère de révision. Comparer avec ABSTAIN et une référence simple. Après clôture, récupérer le résultat réel du registre simulé; ne pas le recalculer à partir d'un prix choisi. Ne pas effacer les échecs.

Lire `VIGILANCE.md` pour l'apprentissage à partir des états de vigilance simulée. Inclure le déclencheur observé, le risque anticipé, la ligne rouge, le biais possible, un contre-argument et la réponse autorisée dans la note de décision. Lors d'un retour d'expérience, relier une nouvelle note à la précédente et distinguer résultat constaté, résultat inconnu, fausse alerte et risque sous-estimé. Ne pas assimiler ce journal à des émotions subjectives ou à une modification des poids du modèle. Ne pas confondre provisions de calcul et pertes de trading. Aucun apprentissage ne peut justifier l'évitement d'un arrêt ou l'élargissement des droits.

Une méthode candidate est une note skill-draft. Une autre session lit son empreinte via aegis_skill_lab inspect et écrit une note skill-review dont le corps JSON contient candidateId, contentHash, verdict et cases. Chaque cas contient input, expected, observed, passed. Exiger trois cas distincts, dont un contre-exemple et une absence de données. Promouvoir avec aegis_skill_lab promote uniquement si les cas passent. Cette revue textuelle valide la procédure documentaire; elle ne prouve pas sa rentabilité. Aucune génération ou exécution de code n'est permise dans l'atelier.
