# 🚀 Guide de Déploiement Vercel - Marketing Tracker V2.2

## 📋 Vue d'ensemble

Ce guide vous explique comment déployer votre Marketing Tracker sur Vercel avec un token GitHub **sécurisé**.

### ✅ Avantages de cette solution :
- 🔐 **Token GitHub sécurisé** (jamais dans le code)
- 🌍 **App accessible publiquement** via URL Vercel
- 💾 **Sauvegarde multi-device** fonctionnelle
- 🔄 **Déploiement automatique** à chaque push
- 💰 **100% gratuit**

---

## 📝 Prérequis

Avant de commencer, assurez-vous d'avoir :
- ✅ Un compte Vercel (vous l'avez déjà !)
- ✅ Votre repository GitHub accessible
- ✅ Un token GitHub avec permissions Contents Read/Write

---

## 🎯 Étape 1 : Créer votre Token GitHub

### 1.1 Aller sur la page des tokens

Ouvrez : **https://github.com/settings/tokens?type=beta**

### 1.2 Créer un nouveau token

1. Cliquez **"Generate new token"** (en haut à droite)
2. Remplissez :
   - **Token name**: `Marketing Tracker Vercel`
   - **Expiration**: `No expiration` (ou 90 days)
   - **Repository access**: `Only select repositories`
   - Sélectionnez : `migso-pcubed-mkt-com/Marketing-Dashboard`

### 1.3 Configurer les permissions

Dans **"Repository permissions"** :
- Trouvez **"Contents"**
- Mettez : **"Read and write"** ✅

### 1.4 Générer et copier

1. Scrollez en bas → **"Generate token"**
2. **COPIEZ le token COMPLET** (commence par `github_pat_...`)
3. ⚠️ **IMPORTANT** : Vous ne le verrez qu'UNE SEULE FOIS !

---

## 🚀 Étape 2 : Déployer sur Vercel

### 2.1 Connecter votre repository

1. Allez sur **https://vercel.com/dashboard**
2. Cliquez **"Add New..."** → **"Project"**
3. Trouvez et sélectionnez **`Marketing-Dashboard`**
4. Cliquez **"Import"**

### 2.2 Configuration du projet

Vercel détectera automatiquement votre configuration grâce au fichier `vercel.json`.

**Ne modifiez RIEN dans les paramètres par défaut.**

### 2.3 Ajouter la variable d'environnement

⚠️ **ÉTAPE CRITIQUE** ⚠️

Avant de déployer, vous DEVEZ ajouter le token GitHub :

1. Dans la section **"Environment Variables"**
2. Cliquez **"Add"**
3. Remplissez :
   - **Name**: `GITHUB_TOKEN`
   - **Value**: Collez votre token GitHub (celui copié à l'étape 1.4)
   - **Environment**: Cochez **Production**, **Preview**, et **Development**

4. Cliquez **"Add"**

### 2.4 Déployer

1. Cliquez **"Deploy"** en bas
2. Attendez 1-2 minutes
3. ✅ Votre app sera déployée !

---

## 🎉 Étape 3 : Tester votre application

### 3.1 Accéder à votre app

Vercel vous donnera une URL comme :
```
https://votre-projet.vercel.app
```

### 3.2 Vérifier que ça fonctionne

1. Ouvrez l'URL dans votre navigateur
2. Ouvrez la console (F12)
3. Vous devriez voir :
   ```
   🚀 Chargement des données via Vercel API...
   📥 Loading from GitHub via Vercel API...
   ✅ GitHub loaded successfully. Categories: X Actions: Y Tasks: Z
   ```

4. Modifiez une tâche
5. Attendez 2 secondes (auto-save)
6. Vous devriez voir :
   ```
   💾 Saving to GitHub via Vercel API...
   ✅ GitHub save successful. New SHA: XXXXXXXX
   ✅ Sauvegarde GitHub réussie
   ```

### 3.3 Test multi-device

1. Ouvrez l'URL sur un autre appareil (iPad, téléphone, etc.)
2. Les modifications faites sur un device apparaissent sur l'autre
3. ✅ Synchronisation fonctionnelle !

---

## 🔧 Configuration avancée (Optionnel)

### Domaine personnalisé

Vous pouvez utiliser votre propre domaine :

1. Vercel Dashboard → Votre projet → **Settings** → **Domains**
2. Ajoutez votre domaine personnalisé
3. Suivez les instructions DNS

### Déploiement automatique

Par défaut, Vercel déploie automatiquement à chaque push sur `main`.

Pour changer la branche :
1. Settings → **Git** → **Production Branch**
2. Changez pour la branche de votre choix si besoin

---

## 🐛 Résolution de problèmes

### ❌ Erreur 500 : "Token GitHub non configuré"

**Problème** : La variable d'environnement `GITHUB_TOKEN` n'est pas configurée.

**Solution** :
1. Vercel Dashboard → Votre projet → **Settings** → **Environment Variables**
2. Vérifiez que `GITHUB_TOKEN` existe
3. Si non, ajoutez-la (voir Étape 2.3)
4. **Redéployez** : Deployments → ... → **Redeploy**

### ❌ Erreur 401 : "Bad Credentials"

**Problème** : Le token GitHub est invalide ou expiré.

**Solution** :
1. Créez un NOUVEAU token GitHub (Étape 1)
2. Vercel Dashboard → Settings → Environment Variables
3. Cliquez sur `GITHUB_TOKEN` → **Edit**
4. Collez le NOUVEAU token
5. Redéployez

### ❌ Erreur CORS

**Problème** : L'app ne peut pas appeler l'API Vercel.

**Solution** : Le fichier `vercel.json` configure déjà CORS. Si le problème persiste :
1. Vérifiez que `vercel.json` existe dans votre repo
2. Redéployez

### ❌ Les modifications ne s'affichent pas

**Problème** : L'app utilise peut-être une ancienne version.

**Solution** :
1. Actualisez la page avec **Ctrl+F5** (force le cache)
2. Vérifiez dans Vercel Deployments que le dernier commit est déployé
3. Si nécessaire, redéployez manuellement

---

## 📊 Monitoring

### Voir les logs

1. Vercel Dashboard → Votre projet → **Logs**
2. Vous verrez toutes les requêtes à votre API
3. Utile pour débugger

### Voir les déploiements

1. Vercel Dashboard → Votre projet → **Deployments**
2. Historique de tous vos déploiements
3. Possibilité de rollback si problème

---

## 🔄 Workflow de développement

### Développement local

Si vous voulez tester en local avant de déployer :

```bash
# Installer Vercel CLI
npm install -g vercel

# Dans le dossier du projet
vercel dev
```

L'app sera accessible sur `http://localhost:3000`

### Push et déploiement

```bash
git add .
git commit -m "Update: ..."
git push origin main
```

Vercel déploiera automatiquement en 1-2 minutes.

---

## ✅ Checklist finale

Avant de considérer que tout fonctionne :

- [ ] Token GitHub créé avec permissions Contents Read/Write
- [ ] Variable d'environnement `GITHUB_TOKEN` ajoutée dans Vercel
- [ ] Premier déploiement réussi
- [ ] URL Vercel accessible
- [ ] Chargement des données fonctionne (voir console)
- [ ] Sauvegarde fonctionne (modifier une tâche)
- [ ] Test multi-device réussi (modifications visibles partout)
- [ ] Aucune erreur 401, 500 dans la console

---

## 🆘 Support

Si vous rencontrez un problème non couvert par ce guide :

1. Vérifiez les logs Vercel (Dashboard → Logs)
2. Vérifiez la console du navigateur (F12)
3. Vérifiez que le token GitHub est toujours valide

---

## 🎉 Félicitations !

Votre Marketing Tracker est maintenant :
- ✅ Déployé sur Vercel
- ✅ Accessible publiquement
- ✅ Sécurisé (token côté serveur)
- ✅ Synchronisé multi-device
- ✅ Prêt à l'emploi !

Profitez de votre application ! 🚀
