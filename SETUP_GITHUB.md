# 🔧 Configuration GitHub - Marketing Tracker V2.2

## ⚠️ ÉTAPE OBLIGATOIRE : Configurer votre token GitHub

Pour que l'application fonctionne sur **tous vos devices** (ordinateur, iPad, téléphone), vous devez configurer votre token GitHub **une seule fois** dans le code.

---

## 📋 ÉTAPES DE CONFIGURATION

### 1️⃣ Créer un token GitHub

1. **Connectez-vous** à GitHub
2. **Allez sur** : https://github.com/settings/tokens
3. **Cliquez** sur "Generate new token" → "Generate new token (classic)"
4. **Configurez** :
   - **Note** : "Marketing Tracker V2.2"
   - **Expiration** : No expiration (ou 1 an)
   - **Permissions** : Cochez **`repo`** (Full control of private repositories)
5. **Cliquez** sur "Generate token" en bas de la page
6. **⚠️ IMPORTANT** : Copiez le token **immédiatement** (il ne sera plus affiché)

---

### 2️⃣ Ajouter le token dans index.html

1. **Ouvrez** le fichier `index.html`
2. **Trouvez** la ligne **1380** (environ) :
   ```javascript
   token:'VOTRE_TOKEN_ICI' // ← Remplacez par votre token GitHub Personnel
   ```

3. **Remplacez** `VOTRE_TOKEN_ICI` par votre token GitHub :
   ```javascript
   token:'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
   ```

4. **Sauvegardez** le fichier

---

### 3️⃣ Vérifier que ça fonctionne

1. **Ouvrez** l'application dans votre navigateur
2. **Ouvrez la console** (F12 → Console)
3. **Vérifiez** que vous voyez :
   ```
   📥 Loading from GitHub...
   ✅ GitHub loaded successfully. Categories: X Actions: Y Tasks: Z
   ```

4. **Si vous voyez** :
   ```
   ⚠️ Token GitHub non configuré
   ```
   → Retournez à l'étape 2

---

## ✅ AVANTAGES DE CETTE APPROCHE

### Avant (avec localStorage)
❌ Token différent sur chaque device
❌ Impossible de sauvegarder depuis iPad sans re-configurer
❌ Erreur "sha wasn't supplied"
❌ Modifications pas visibles ailleurs

### Après (token intégré)
✅ Token **automatiquement disponible** sur tous devices
✅ Sauvegarde fonctionne **partout**
✅ Modifications **immédiatement visibles**
✅ **Aucune configuration** nécessaire sur les autres devices

---

## 🧪 TEST MULTI-DEVICE

### Test 1 : Ordinateur → iPad

1. **Ordinateur** :
   - Créez une tâche "Test Multi-Device"
   - Attendez 2 secondes (icône "saved")

2. **iPad** :
   - Ouvrez l'URL de l'app
   - Rechargez la page
   - ✅ La tâche "Test Multi-Device" doit apparaître

### Test 2 : iPad → Ordinateur

1. **iPad** :
   - Modifiez la tâche "Test Multi-Device" → "Modifié depuis iPad"
   - Attendez 2 secondes

2. **Ordinateur** :
   - Rechargez la page
   - ✅ La modification doit apparaître

---

## 🔒 SÉCURITÉ

### ⚠️ IMPORTANT

Le token GitHub donne **accès complet** à votre repository.

**Recommandations** :
- ✅ Utilisez un **repository privé** (pas public)
- ✅ Ne partagez le fichier `index.html` qu'avec des **personnes de confiance**
- ✅ Si le token est compromis : **révoquez-le** et créez-en un nouveau

### Pour révoquer un token

1. Allez sur https://github.com/settings/tokens
2. Trouvez "Marketing Tracker V2.2"
3. Cliquez sur "Delete"
4. Créez un nouveau token et remplacez-le dans `index.html`

---

## 🐛 PROBLÈMES COURANTS

### Erreur "sha wasn't supplied"
**Cause** : Token pas configuré ou invalide
**Solution** : Vérifiez que le token est bien copié à la ligne 1380

### Modifications pas visibles sur autre device
**Cause** : Token différent ou cache navigateur
**Solution** :
1. Vérifiez que le token est le même sur les deux devices
2. Forcez le rechargement : Ctrl+Shift+R (ou Cmd+Shift+R sur Mac)

### "⚠️ Token GitHub non configuré"
**Cause** : Token pas remplacé ou égal à 'VOTRE_TOKEN_ICI'
**Solution** : Retournez à l'étape 2 de la configuration

---

## 📞 SUPPORT

Si vous rencontrez des problèmes :
1. Ouvrez la console (F12)
2. Copiez les logs d'erreur
3. Vérifiez que le token est bien configuré
4. Testez en mode navigation privée pour écarter les problèmes de cache

---

**Dernière mise à jour** : 2026-01-19
**Version** : V2.2 - Token intégré
