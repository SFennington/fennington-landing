const admin = require("../functions/node_modules/firebase-admin");

const projectId = process.env.PROJECT_ID || "fennington-financial";
const sourceEmail = process.env.SOURCE_EMAIL || "cfennington2@gmail.com";
const householdId = process.env.HOUSEHOLD_ID || "fennington-household";
const householdName = process.env.HOUSEHOLD_NAME || "Fennington Household";
const batchSize = Number(process.env.BATCH_SIZE || 50);
const pageSize = Number(process.env.PAGE_SIZE || 100);
const delayMs = Number(process.env.DELAY_MS || 1000);

const profileCollectionNames = [
  "accounts",
  "imports",
  "mappings",
  "categories",
  "transactions",
  "merchantMappings",
  "rules",
  "recurring",
  "overtimeScenarios",
  "monthlySummaries"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function commitWrites(db, writes) {
  for (let index = 0; index < writes.length; index += batchSize) {
    const batch = db.batch();
    writes.slice(index, index + batchSize).forEach((write) => write(batch));
    await batch.commit();
    console.log(`Committed ${Math.min(index + batchSize, writes.length)} of ${writes.length} writes in this group.`);
    if (delayMs > 0) await sleep(delayMs);
  }
}

async function copyCollection(db, sourcePath, targetPath, collectionName) {
  const sourceCollection = db.collection(`${sourcePath}/${collectionName}`);
  const targetCollection = db.collection(`${targetPath}/${collectionName}`);
  let lastDoc = null;
  let copied = 0;

  while (true) {
    let query = sourceCollection.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc.id);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const writes = snapshot.docs.map((sourceDoc) => (batch) => {
      batch.set(targetCollection.doc(sourceDoc.id), {
        ...sourceDoc.data(),
        workspaceId: householdId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    await commitWrites(db, writes);
    copied += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    console.log(`${collectionName}: copied ${copied} docs so far.`);

    if (snapshot.size < pageSize) break;
  }

  return copied;
}

async function main() {
  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const user = await admin.auth().getUserByEmail(sourceEmail);
  const sourcePath = `users/${user.uid}/financialProfiles/default`;
  const targetPath = `households/${householdId}/financialProfiles/default`;

  console.log(`Migrating ${sourceEmail} (${user.uid})`);
  console.log(`From: ${sourcePath}`);
  console.log(`To:   ${targetPath}`);
  console.log(`Batch size: ${batchSize}, page size: ${pageSize}, delay: ${delayMs}ms`);

  const sourceProfile = await db.doc(sourcePath).get();
  if (!sourceProfile.exists) throw new Error(`Source profile not found: ${sourcePath}`);

  await db.doc(`households/${householdId}`).set({
    name: householdName,
    memberEmails: { [sourceEmail]: true },
    memberUids: { [user.uid]: "owner" },
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true });

  await db.doc(targetPath).set({
    ...sourceProfile.data(),
    workspaceId: householdId,
    migratedFromUserId: user.uid,
    migrationComplete: false,
    updatedAt: serverTimestamp()
  }, { merge: true });

  const totals = {};
  for (const collectionName of profileCollectionNames) {
    totals[collectionName] = await copyCollection(db, sourcePath, targetPath, collectionName);
  }

  const income = await db.doc(`${sourcePath}/settings/income`).get();
  if (income.exists) {
    await db.doc(`${targetPath}/settings/income`).set({
      ...income.data(),
      workspaceId: householdId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    totals["settings/income"] = 1;
  } else {
    totals["settings/income"] = 0;
  }

  await db.doc(targetPath).set({ migrationComplete: true, updatedAt: serverTimestamp() }, { merge: true });

  console.log("Migration complete.");
  console.table(totals);
  await admin.app().delete();
}

main().catch(async (error) => {
  console.error(error);
  try { await admin.app().delete(); } catch (_) { /* ignore cleanup errors */ }
  process.exit(1);
});
