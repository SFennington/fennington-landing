const admin = require("../functions/node_modules/firebase-admin");

const projectId = process.env.PROJECT_ID || "fennington-financial";
const householdId = process.env.HOUSEHOLD_ID || "fennington-household";

function uniqueCategoryId(existingIds) {
  let id = "";
  do {
    id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

async function main() {
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const profileRef = db.doc(`households/${householdId}/financialProfiles/default`);
  const categoriesRef = profileRef.collection("categories");
  const snapshot = await categoriesRef.get();

  if (snapshot.empty) {
    console.log("No categories found.");
    await admin.app().delete();
    return;
  }

  const oldCategories = snapshot.docs.map((doc) => ({ docId: doc.id, ...doc.data() }));
  const existingIds = new Set(oldCategories.filter((category) => String(category.docId).startsWith("cat-")).map((category) => category.docId));
  const idMap = new Map();

  oldCategories.forEach((category) => {
    idMap.set(category.docId, String(category.docId).startsWith("cat-") ? category.docId : uniqueCategoryId(existingIds));
  });

  const batch = db.batch();
  oldCategories.forEach((category) => {
    const newId = idMap.get(category.docId);
    const newParentId = category.parentId ? idMap.get(category.parentId) || category.parentId : "";
    const data = {
      ...category,
      id: newId,
      parentId: newParentId,
      workspaceId: householdId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    delete data.docId;
    batch.set(categoriesRef.doc(newId), data, { merge: true });
    if (newId !== category.docId) batch.delete(categoriesRef.doc(category.docId));
  });

  await batch.commit();
  console.log(`Normalized ${oldCategories.length} categories.`);
  console.table(oldCategories.map((category) => ({ oldId: category.docId, newId: idMap.get(category.docId), name: category.name })));
  await admin.app().delete();
}

main().catch(async (error) => {
  console.error(error);
  try { await admin.app().delete(); } catch (_) { /* ignore cleanup errors */ }
  process.exit(1);
});
